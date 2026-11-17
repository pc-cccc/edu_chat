/**
 * Edu_chat Cloudflare Worker —— DeepSeek 轻量 API 代理
 *
 * 唯一职责：
 *   1. 校验请求携带的 Supabase 登录态（JWT，HS256）；
 *   2. 在 Worker 内部注入你的 DeepSeek API Key（前端 / Supabase 都拿不到）；
 *   3. 把请求转发给 DeepSeek 官方接口，并把（流式）响应原样返回。
 *
 * 密钥只存在于 Cloudflare 的 Secret 里（DEEPSEEK_API_KEY / SUPABASE_JWT_SECRET），
 * 不写进源码、不写进 Git、不写进前端产物。
 *
 * 与前端 src/services/api/client.ts 的路由保持一致：
 *   GET  /models
 *   POST /anthropic/v1/messages      （流式聊天）
 *   POST /anthropic/v1/files         （上传附件）
 *   POST /v1/tools/asr               （语音转文字）
 *   POST /v1/tools/tts               （文字转语音）
 *   DELETE /anthropic/v1/files/:id   （删除附件）
 */
const DEEPSEEK_ORIGIN = 'https://api.deepseek.com'
const MAX_BODY_BYTES = 32 * 1024 * 1024 // 32 MiB，与前端 MAX_BODY_BYTES 一致
const UPSTREAM_TIMEOUT_MS = 180_000 // 180 秒，大于流式回答上限

// Android WebView 与本地开发固定放行；你的 Pages 域名请通过 ALLOWED_ORIGINS 配置。
const DEFAULT_ORIGINS = ['https://localhost', 'http://localhost', 'capacitor://localhost']

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, accept, anthropic-beta',
  'Access-Control-Max-Age': '600',
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/** 简单的按 IP 限流（尽力而为；更强限流可在 Cloudflare 控制台配置）。 */
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 60
const rateMap = new Map()

function base64UrlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bytes = atob(b64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i)
  return arr
}

/**
 * 校验 Supabase access_token（HS256，用项目 JWT Secret）。
 * 校验通过返回 payload，失败返回 null。
 */
async function verifyJwt(token, secret) {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, signature] = parts
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      textEncoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(signature),
      textEncoder.encode(`${header}.${payload}`)
    )
    if (!valid) return null
    const decoded = JSON.parse(textDecoder.decode(base64UrlDecode(payload)))
    const now = Math.floor(Date.now() / 1000)
    if (decoded.exp && now >= decoded.exp) return null
    return decoded
  } catch {
    return null
  }
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

function jsonResponse(status, message) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin')
  if (!origin) return null
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const allowed = [...DEFAULT_ORIGINS, ...configured]
  return allowed.includes(origin) ? origin : null
}

export default {
  async fetch(request, env) {
    if (!env.DEEPSEEK_API_KEY || !env.SUPABASE_JWT_SECRET) {
      return jsonResponse(500, 'Worker 尚未配置 DEEPSEEK_API_KEY 或 SUPABASE_JWT_SECRET，请用 wrangler secret 设置。')
    }

    const url = new URL(request.url)
    const pathname = url.pathname
    const origin = allowedOrigin(request, env)

    // CORS 预检：Authorization 属于非简单头，浏览器会先发 OPTIONS。
    if (request.method === 'OPTIONS') {
      if (!origin) return new Response(null, { status: 204 })
      return new Response(null, {
        status: 204,
        headers: { 'Access-Control-Allow-Origin': origin, ...CORS_HEADERS },
      })
    }

    // 健康检查（可选，方便确认部署成功）。
    if (request.method === 'GET' && pathname === '/') {
      return new Response(JSON.stringify({ ok: true, service: 'edu-chat-worker' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    }

    // 1) 鉴权：必须是 Supabase 登录用户。
    const auth = request.headers.get('Authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const payload = await verifyJwt(token, env.SUPABASE_JWT_SECRET)
    if (!payload) {
      return jsonResponse(401, '未登录或登录已过期，请重新登录')
    }

    // 2) 路由白名单。
    if (!matchRoute(request.method, pathname)) {
      return jsonResponse(404, '接口不存在')
    }

    // 3) 简单限流（按 IP，尽力而为）。
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
    const now = Date.now()
    const entry = rateMap.get(ip)
    if (entry && now - entry.start < RATE_WINDOW_MS) {
      entry.count += 1
      if (entry.count > RATE_LIMIT) {
        return jsonResponse(429, '请求过于频繁，请稍后再试')
      }
    } else {
      rateMap.set(ip, { start: now, count: 1 })
    }

    // 4) 转发：组装上游请求头，注入 DeepSeek Key（绝不把客户端 JWT 带给 DeepSeek）。
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

    let body
    if (request.method === 'POST') {
      const contentLength = Number(request.headers.get('content-length') || 0)
      if (contentLength > MAX_BODY_BYTES) {
        return jsonResponse(413, '附件或请求超过大小限制')
      }
      body = await request.arrayBuffer()
      if (body.byteLength > MAX_BODY_BYTES) {
        return jsonResponse(413, '附件或请求超过大小限制')
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

    let upstream
    try {
      upstream = await fetch(new URL(pathname, DEEPSEEK_ORIGIN), {
        method: request.method,
        headers: upstreamHeaders,
        body,
        signal: controller.signal,
        redirect: 'error',
      })
    } catch {
      clearTimeout(timer)
      return jsonResponse(502, '连接 DeepSeek 失败或超时，请稍后再试')
    }

    clearTimeout(timer)

    // 5) 非 2xx：只回传脱敏后的错误信息，绝不回显密钥。
    if (!upstream.ok) {
      let message = `DeepSeek 返回 ${upstream.status}，请检查密钥、余额、模型与扩展能力。`
      try {
        const text = await upstream.text()
        const parsed = JSON.parse(text)
        if (typeof parsed?.error?.message === 'string') {
          message = parsed.error.message
            .replaceAll(env.DEEPSEEK_API_KEY, '[redacted]')
            .slice(0, 2000)
        }
      } catch {
        // 保留通用提示。
      }
      const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      if (origin) headers.set('Access-Control-Allow-Origin', origin)
      return new Response(JSON.stringify({ error: { message } }), { status: upstream.status, headers })
    }

    // 6) 成功：原样流式返回（保留 text/event-stream，关闭缓冲）。
    const headers = new Headers(upstream.headers)
    headers.set('Cache-Control', 'no-store')
    headers.set('X-Accel-Buffering', 'no')
    if (origin) {
      headers.set('Access-Control-Allow-Origin', origin)
      headers.set('Vary', 'Origin')
    }
    return new Response(upstream.body, { status: upstream.status, headers })
  },
}
