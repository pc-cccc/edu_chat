/**
 * Edu_chat Cloudflare Worker —— DeepSeek 轻量 API 代理
 *
 * 职责：
 *   1. 校验请求携带的 Supabase 登录态（真实用户 access_token，拒绝 anon/service_role）；
 *   2. 在 Worker 内部注入你的 DeepSeek API Key（前端 / Supabase 都拿不到）；
 *   3. 把请求转发给 DeepSeek 官方接口，并把（流式）响应原样返回；
 *   4. 共享 DeepSeek Key 下，用 Supabase 的 files 表校验文件的上传/引用/删除归属。
 *
 * 依赖：`jose`（Cloudflare 官方推荐，通过 wrangler 打包）。
 * 环境变量：
 *   - DEEPSEEK_API_KEY        (secret)  DeepSeek 密钥
 *   - SUPABASE_URL            (var)     形如 https://xxx.supabase.co
 *   - SUPABASE_ANON_KEY       (var)     Supabase 的 anon public 密钥（公开值）
 *   - SUPABASE_SERVICE_ROLE_KEY (secret) 仅 Worker 写入文件归属，绝不能放前端
 *   - SUPABASE_JWT_SECRET     (secret, 可选) 仅用于旧 HS256 项目的回退校验
 *   - ALLOWED_ORIGINS         (var)     允许跨域的前端域名，逗号分隔
 *
 * 路由（与前端 src/services/api/client.ts 一致）：
 *   GET    /models
 *   POST   /anthropic/v1/messages      （流式聊天）
 *   POST   /anthropic/v1/files         （上传附件）
 *   POST   /v1/tools/asr               （语音转文字）
 *   POST   /v1/tools/tts               （文字转语音）
 *   DELETE /anthropic/v1/files/:id     （删除附件）
 */
import { createRemoteJWKSet, jwtVerify } from 'jose'

const DEEPSEEK_ORIGIN = 'https://api.deepseek.com'
const MAX_BODY_BYTES = 32 * 1024 * 1024 // 32 MiB
const UPSTREAM_TIMEOUT_MS = 180_000 // 180 秒，大于流式回答上限

// Android WebView 与本地开发固定放行；Pages 域名通过 ALLOWED_ORIGINS 配置。
const DEFAULT_ORIGINS = ['https://localhost', 'http://localhost', 'capacitor://localhost']

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, accept, anthropic-beta',
  'Access-Control-Max-Age': '600',
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
// Reuse jose's key cache; do not fetch JWKS on every chat request.
const jwksByIssuer = new Map()

// 尽力而为的按用户限流（内存 Map 不跨隔离区，不能当作可靠的费用/滥用控制；
// 真正的限制依赖：Supabase 关闭公开注册 + Cloudflare 控制台的 Rate Limiting 规则）。
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 60
const rateMap = new Map()

function baseUrl(value) {
  return String(value || '').replace(/\/+$/, '')
}

function matchRoute(method, pathname) {
  if (method === 'GET' && pathname === '/models') return true
  if (method === 'POST') {
    return [
      '/anthropic/v1/messages',
      '/anthropic/v1/files',
      '/v1/tools/asr',
      '/v1/tools/tts',
    ].includes(pathname)
  }
  if (method === 'DELETE' && /^\/anthropic\/v1\/files\/[A-Za-z0-9_-]+$/.test(pathname)) {
    return true
  }
  return false
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin')
  if (!origin) return null
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return [...DEFAULT_ORIGINS, ...configured].includes(origin) ? origin : null
}

/** 给所有响应（含错误）统一附加 CORS 头。 */
function withCors(headers, origin) {
  const h = new Headers(headers)
  if (origin) {
    h.set('Access-Control-Allow-Origin', origin)
    h.set('Vary', 'Origin')
  }
  return h
}

function jsonResponse(status, message, origin) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: withCors(
      { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      origin
    ),
  })
}

/**
 * 校验 Supabase 真实用户 access_token：
 *   - 先用 JWKS（ES256/RS256/PS256，云托管新项目的用户 token 是 ES256）验证签名；
 *   - 若失败且配置了 JWT Secret，再回退 HS256（旧项目）；
 *   - 校验签发方 iss、受众 aud、过期 exp，并要求 role=authenticated 且 sub 存在，
 *     从而拒绝 anon / service_role API key。
 */
async function verifyUserToken(token, env) {
  if (!token) return null
  const url = baseUrl(env.SUPABASE_URL)
  const issuer = `${url}/auth/v1`
  let jwks = jwksByIssuer.get(issuer)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
    jwksByIssuer.set(issuer, jwks)
  }
  const check = (payload) =>
    payload?.role === 'authenticated' && typeof payload?.sub === 'string' && payload.sub
      ? payload
      : null

  try {
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ['ES256', 'RS256', 'PS256'],
      issuer,
      audience: 'authenticated',
      requiredClaims: ['exp', 'sub', 'role'],
    })
    return check(payload)
  } catch {
    if (env.SUPABASE_JWT_SECRET) {
      try {
        const { payload } = await jwtVerify(token, textEncoder.encode(env.SUPABASE_JWT_SECRET), {
          algorithms: ['HS256'],
          issuer,
          audience: 'authenticated',
          requiredClaims: ['exp', 'sub', 'role'],
        })
        return check(payload)
      } catch {
        return null
      }
    }
    return null
  }
}

/** 从消息请求体里提取所有引用到的文件 file_id。 */
function extractFileIds(bodyText) {
  const ids = new Set()
  try {
    const json = JSON.parse(bodyText)
    for (const message of json?.messages ?? []) {
      if (!Array.isArray(message?.content)) continue
      for (const block of message.content) {
        if (
          block &&
          (block.type === 'image' || block.type === 'document') &&
          block.source?.type === 'file' &&
          typeof block.source.file_id === 'string'
        ) {
          ids.add(block.source.file_id)
        }
      }
    }
  } catch {
    // 非法 JSON 交给 DeepSeek 返回错误。
  }
  return [...ids]
}

/** 调用 Supabase PostgREST（用用户自己的 token，RLS 自动限定到本人数据）。 */
async function supabaseRest(env, token, path, options = {}, privileged = false) {
  const url = `${baseUrl(env.SUPABASE_URL)}/rest/v1/${path}`
  const headers = new Headers(options.headers)
  const key = privileged ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_ANON_KEY
  headers.set('apikey', key)
  headers.set('Authorization', `Bearer ${privileged ? key : token}`)
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  return fetch(url, { signal: AbortSignal.timeout(15_000), ...options, headers, redirect: 'manual' })
}

/** 只有 Worker 写归属：userId 来自验证后的 JWT，fileId 来自 DeepSeek 上传响应。 */
async function recordFileOwnership(env, token, userId, fileId) {
  try {
    const res = await supabaseRest(
      env,
      token,
      'files',
      {
        method: 'POST',
        body: JSON.stringify({ id: fileId, user_id: userId }),
      },
      true
    )
    return res.ok
  } catch {
    return false
  }
}

/** 校验所有 file_id 都属于当前用户；返回不归属的 id 列表。 */
async function findForeignFiles(env, token, fileIds) {
  if (fileIds.length === 0) return []
  try {
    const ids = fileIds.map((id) => encodeURIComponent(id)).join(',')
    const res = await supabaseRest(env, token, `files?select=id&id=in.(${ids})`)
    if (!res.ok) return fileIds // 查询失败时按不归属处理，拒绝放行
    const rows = (await res.json()) ?? []
    const owned = new Set(rows.map((row) => row.id))
    return fileIds.filter((id) => !owned.has(id))
  } catch {
    return fileIds
  }
}

/** 删除 files 表里的归属记录（删除成功/失败都不影响主流程）。 */
async function forgetFileOwnership(env, token, fileId) {
  try {
    await supabaseRest(
      env,
      token,
      `files?id=eq.${encodeURIComponent(fileId)}`,
      { method: 'DELETE' },
      true
    )
  } catch {
    // 忽略。
  }
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env)
    // Preflight must work even before secrets are fully configured.
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: withCors(origin ? CORS_HEADERS : {}, origin),
      })
    }
    const missing = []
    if (!env.DEEPSEEK_API_KEY) missing.push('DEEPSEEK_API_KEY')
    if (!env.SUPABASE_URL) missing.push('SUPABASE_URL')
    if (!env.SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY')
    if (missing.length > 0) {
      return jsonResponse(500, `Worker 缺少配置：${missing.join('、')}。`, origin)
    }

    const url = new URL(request.url)
    const pathname = url.pathname
    // 健康检查。
    if (request.method === 'GET' && pathname === '/') {
      return new Response(JSON.stringify({ ok: true, service: 'edu-chat-worker' }), {
        status: 200,
        headers: withCors(
          { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
          origin
        ),
      })
    }

    // 1) 鉴权：必须是 Supabase 真实登录用户。
    const auth = request.headers.get('Authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const payload = await verifyUserToken(token, env)
    if (!payload) {
      return jsonResponse(401, '未登录或登录已过期，请重新登录', origin)
    }
    const userId = payload.sub

    // 2) 路由白名单。
    if (!matchRoute(request.method, pathname)) {
      return jsonResponse(404, '接口不存在', origin)
    }

    if (
      (pathname === '/anthropic/v1/files' || request.method === 'DELETE') &&
      !env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return jsonResponse(503, '附件服务尚未配置，请联系应用维护者', origin)
    }

    // 3) 尽力而为的按用户限流。
    const now = Date.now()
    for (const [id, value] of rateMap) {
      if (now - value.start >= RATE_WINDOW_MS) rateMap.delete(id)
    }
    const entry = rateMap.get(userId)
    if (entry && now - entry.start < RATE_WINDOW_MS) {
      entry.count += 1
      if (entry.count > RATE_LIMIT) {
        return jsonResponse(429, '请求过于频繁，请稍后再试', origin)
      }
    } else {
      rateMap.set(userId, { start: now, count: 1 })
    }

    // 4) 读取请求体（仅 POST）。
    let body
    if (request.method === 'POST') {
      const contentLength = Number(request.headers.get('content-length') || 0)
      if (contentLength > MAX_BODY_BYTES) {
        return jsonResponse(413, '附件或请求超过大小限制', origin)
      }
      body = await request.arrayBuffer()
      if (body.byteLength > MAX_BODY_BYTES) {
        return jsonResponse(413, '附件或请求超过大小限制', origin)
      }
    }

    // 5) 文件归属校验（共享 Key 下的多用户隔离）：
    //    - 消息引用：检查请求里的每个 file_id 是否属于当前用户；
    //    - 删除：删除前校验归属。
    if (request.method === 'POST' && pathname === '/anthropic/v1/messages') {
      const foreign = await findForeignFiles(env, token, extractFileIds(textDecoder.decode(body)))
      if (foreign.length > 0) {
        return jsonResponse(403, '消息引用了不属于你的文件，已拒绝', origin)
      }
    }
    if (request.method === 'DELETE' && pathname.startsWith('/anthropic/v1/files/')) {
      const fileId = decodeURIComponent(pathname.split('/').pop())
      const foreign = await findForeignFiles(env, token, [fileId])
      if (foreign.length > 0) {
        return jsonResponse(403, '文件不存在或不属于你', origin)
      }
    }

    // 6) 组装上游请求头，注入 DeepSeek Key（绝不把客户端 JWT 带给 DeepSeek）。
    const upstreamHeaders = new Headers()
    const contentType = request.headers.get('content-type')
    const accept = request.headers.get('accept')
    const anthropicBeta = request.headers.get('anthropic-beta')
    if (contentType) upstreamHeaders.set('content-type', contentType)
    if (accept) upstreamHeaders.set('accept', accept)
    if (anthropicBeta) upstreamHeaders.set('anthropic-beta', anthropicBeta)
    const isAnthropic = pathname.startsWith('/anthropic/')
    if (isAnthropic) {
      upstreamHeaders.set('x-api-key', env.DEEPSEEK_API_KEY)
    } else {
      upstreamHeaders.set('authorization', `Bearer ${env.DEEPSEEK_API_KEY}`)
    }

    // 7) 转发：把超时与客户端断开统一绑定到同一个 AbortController。
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), UPSTREAM_TIMEOUT_MS)
    const abortFromClient = () => abort.abort()
    request.signal.addEventListener('abort', abortFromClient, { once: true })
    if (request.signal.aborted) abort.abort()

    let upstream
    try {
      upstream = await fetch(new URL(pathname, DEEPSEEK_ORIGIN), {
        method: request.method,
        headers: upstreamHeaders,
        body,
        signal: abort.signal,
        redirect: 'manual',
      })
    } catch (error) {
      clearTimeout(timer)
      request.signal.removeEventListener('abort', abortFromClient)
      console.error('deepseek_fetch_failed', {
        name: error?.name,
        message: String(error?.message ?? error).slice(0, 200),
        upstreamAborted: abort.signal.aborted,
        clientAborted: request.signal.aborted,
        method: request.method,
        pathname,
      })
      return jsonResponse(502, '连接 DeepSeek 失败或超时，请稍后再试', origin)
    }

    if (upstream.type === 'opaqueredirect') {
      clearTimeout(timer)
      request.signal.removeEventListener('abort', abortFromClient)
      return jsonResponse(502, '连接 DeepSeek 失败或超时，请稍后再试', origin)
    }

    // 8) 非 2xx：只回传脱敏后的错误信息，绝不回显密钥。
    if (!upstream.ok) {
      let message = `DeepSeek 返回 ${upstream.status}，请检查密钥、余额、模型与扩展能力。`
      try {
        const parsed = JSON.parse(await upstream.text())
        if (typeof parsed?.error?.message === 'string') {
          message = parsed.error.message
            .replaceAll(env.DEEPSEEK_API_KEY, '[redacted]')
            .slice(0, 2000)
        }
      } catch {
        // 保留通用提示。
      }
      clearTimeout(timer)
      request.signal.removeEventListener('abort', abortFromClient)
      return jsonResponse(upstream.status, message, origin)
    }

    // 9) 文件上传成功后记录归属（拿到 file_id 后写 files 表）。
    if (request.method === 'POST' && pathname === '/anthropic/v1/files') {
      let fileBody
      try {
        fileBody = await upstream.arrayBuffer()
      } catch {
        clearTimeout(timer)
        request.signal.removeEventListener('abort', abortFromClient)
        return jsonResponse(502, '读取上传结果失败或超时，请重试', origin)
      }
      let fileId = null
      try {
        fileId = JSON.parse(textDecoder.decode(fileBody)).id
      } catch {
        // 无有效文件 ID 时拒绝返回成功，避免生成没有归属的附件。
      }
      if (
        typeof fileId !== 'string' ||
        !fileId ||
        !(await recordFileOwnership(env, token, userId, fileId))
      ) {
        clearTimeout(timer)
        request.signal.removeEventListener('abort', abortFromClient)
        return jsonResponse(502, '文件所有权记录失败，请重试上传', origin)
      }
      clearTimeout(timer)
      request.signal.removeEventListener('abort', abortFromClient)
      return new Response(fileBody, {
        status: upstream.status,
        headers: withCors(upstream.headers, origin),
      })
    }

    // 10) 删除成功后移除归属记录。
    if (request.method === 'DELETE' && pathname.startsWith('/anthropic/v1/files/')) {
      await upstream.arrayBuffer().catch(() => {})
      clearTimeout(timer)
      request.signal.removeEventListener('abort', abortFromClient)
      const fileId = decodeURIComponent(pathname.split('/').pop())
      await forgetFileOwnership(env, token, fileId)
      return new Response(null, {
        status: upstream.status,
        headers: withCors(upstream.headers, origin),
      })
    }

    // 11) 按客户端消费速度读取，保留 SSE，取消时关闭上游读取器。
    const upstreamHeaders2 = new Headers(upstream.headers)
    upstreamHeaders2.set('Cache-Control', 'no-store')
    upstreamHeaders2.set('X-Accel-Buffering', 'no')
    const reader = upstream.body?.getReader()
    const cleanup = () => {
      clearTimeout(timer)
      request.signal.removeEventListener('abort', abortFromClient)
    }
    if (!reader) cleanup()
    const stream = reader
      ? new ReadableStream({
          async pull(controller) {
            try {
              const { done, value } = await reader.read()
              if (done) {
                controller.close()
                cleanup()
              } else controller.enqueue(value)
            } catch {
              cleanup()
              controller.error(new Error('Upstream stream interrupted'))
            }
          },
          async cancel(reason) {
            abort.abort()
            cleanup()
            await reader.cancel(reason).catch(() => {})
          },
        })
      : null
    return new Response(stream, {
      status: upstream.status,
      headers: withCors(upstreamHeaders2, origin),
    })
  },
}
