import http from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { demoReply } from './demo.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1'])
const digest = (s) => createHash('sha256').update(s).digest()
const allowed = (method, pathname) =>
  (method === 'GET' && pathname === '/models') ||
  (method === 'POST' && ['/anthropic/v1/messages', '/anthropic/v1/files', '/v1/tools/asr', '/v1/tools/tts'].includes(pathname)) ||
  (method === 'DELETE' && /^\/anthropic\/v1\/files\/[A-Za-z0-9_-]+$/.test(pathname))
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain; charset=utf-8', '.json': 'application/json' }
const fail = (res, status, message) => {
  if (res.headersSent) return res.destroy()
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify({ error: { message } }))
}

async function bodyBytes(req, maxBytes) {
  if (Number(req.headers['content-length'] ?? 0) > maxBytes) throw Object.assign(new Error('请求过大'), { status: 413 })
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) throw Object.assign(new Error('请求过大'), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/** A single-owner gateway. It is not a multi-tenant account/billing service. */
export function createAppServer(env = process.env, fetchUpstream = fetch) {
  const host = env.HOST || '127.0.0.1'
  const port = Number(env.PORT || 8090)
  const publicOrigin = env.PUBLIC_ORIGIN ? new URL(env.PUBLIC_ORIGIN) : null
  const publicMode = !LOOPBACK.has(host) || publicOrigin?.protocol === 'https:'
  // 对外提供服务需要 HTTPS origin；访问凭据可以是站点账号（浏览器 Basic）或应用令牌（App），二者至少一种。
  const hasBasicAuth = Boolean(env.APP_USER && (env.APP_PASSWORD?.length ?? 0) >= 16)
  const hasAppToken = (env.APP_TOKEN?.length ?? 0) >= 16
  if (publicMode && !hasBasicAuth && !hasAppToken) {
    throw new Error('对外提供服务必须配置 HTTPS PUBLIC_ORIGIN，并配置 APP_USER/APP_PASSWORD 或 APP_TOKEN（各至少 16 字符）。')
  }
  if (publicMode && publicOrigin?.protocol !== 'https:') {
    throw new Error('对外提供服务必须配置 HTTPS PUBLIC_ORIGIN。')
  }
  if (publicMode && env.APP_MODE === 'demo') throw new Error('演示模式仅允许本机使用。')
  const origin = new URL(env.DEEPSEEK_API_ORIGIN || 'https://api.deepseek.com')
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('DEEPSEEK_API_ORIGIN 必须是无路径、无凭据的 HTTPS origin。')
  }
  const auth = hasBasicAuth ? `Basic ${Buffer.from(`${env.APP_USER}:${env.APP_PASSWORD}`).toString('base64')}` : null
  const appToken = hasAppToken ? String(env.APP_TOKEN) : null
  // App 的 WebView 打包本地页面时 origin 为 https://localhost（或 iOS 的 capacitor://localhost），跨域调用云端时需放行。
  const appOrigins = new Set(['https://localhost', 'http://localhost', 'capacitor://localhost'])
  const maxBytes = Number(env.MAX_BODY_BYTES || 33554432)
  let active = 0
  let count = 0
  let resetAt = Date.now() + 60000
  const maxRequests = Number(env.RATE_LIMIT_PER_MINUTE || 60)
  const dist = path.join(ROOT, 'dist')
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Cache-Control', 'no-store')
    const address = server.address()
    const boundPort = typeof address === 'object' && address ? address.port : port
    const validHosts = new Set([`127.0.0.1:${boundPort}`, `localhost:${boundPort}`, `[::1]:${boundPort}`, publicOrigin?.host])
    if (!validHosts.has(req.headers.host)) return fail(res, 403, 'Host 不允许')
    // CORS 预检：App 的 WebView 跨域调用前先发 OPTIONS，仅对受信任的本地 App origin 放行。
    if (req.method === 'OPTIONS' && req.headers.origin && appOrigins.has(req.headers.origin)) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
      res.setHeader('Access-Control-Allow-Methods', req.headers['access-control-request-method'] || 'GET, POST, DELETE')
      res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'content-type, x-app-token, anthropic-beta, authorization')
      res.setHeader('Access-Control-Max-Age', '600')
      res.writeHead(204)
      return res.end()
    }
    if (Date.now() >= resetAt) { count = 0; resetAt = Date.now() + 60000 }
    // 首方 App 令牌鉴权：令牌正确即视为可信客户端，跳过站点账号与跨站校验，并为 App 放行跨域响应。
    const tokenValid = appToken ? timingSafeEqual(digest(req.headers['x-app-token'] || ''), digest(appToken)) : false
    const basicValid = auth ? timingSafeEqual(digest(req.headers.authorization || ''), digest(auth)) : false
    if (tokenValid && req.headers.origin && appOrigins.has(req.headers.origin)) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
    }
    // 只要配置了任一访问凭据，就必须通过令牌或站点账号校验，避免只配令牌时裸请求绕过。
    if ((auth || appToken) && !tokenValid && !basicValid) {
      if (++count > maxRequests) return fail(res, 429, '请求过于频繁，请稍后再试')
      res.setHeader('WWW-Authenticate', 'Basic realm="Edu_chat", charset="UTF-8"')
      return fail(res, 401, '请使用站点访问账号或应用访问令牌登录')
    }
    let url
    try { url = new URL(req.url, 'http://localhost') } catch { return fail(res, 400, '无效 URL') }
    if (!['GET', 'HEAD'].includes(req.method) && !tokenValid) {
      const acceptedOrigins = new Set(publicOrigin ? [publicOrigin.origin] : [`http://127.0.0.1:${boundPort}`, `http://localhost:${boundPort}`])
      if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && !acceptedOrigins.has(req.headers.origin))) return fail(res, 403, '跨站请求已拒绝')
    }
    if (url.pathname === '/api/status' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({ mode: env.APP_MODE === 'demo' ? 'demo' : 'server', configured: Boolean(env.DEEPSEEK_API_KEY) }))
    }
    if (url.pathname.startsWith('/api/')) {
      const upstreamPath = url.pathname.slice(4)
      if (url.search || !allowed(req.method, upstreamPath)) return fail(res, 404, '接口不存在')
      if (++count > maxRequests || active >= 4) {
        res.setHeader('Retry-After', '60')
        return fail(res, 429, '请求过于频繁，请稍后再试')
      }
      if (env.APP_MODE !== 'demo' && !env.DEEPSEEK_API_KEY) return fail(res, 503, '服务端尚未配置 DEEPSEEK_API_KEY，请按 README 配置 .env 并重启。')
      const abort = new AbortController()
      const onClose = () => abort.abort()
      res.on('close', onClose)
      req.on('aborted', onClose)
      const timeout = setTimeout(() => abort.abort(), 180000)
      active++
      try {
        const body = ['POST', 'PUT'].includes(req.method) ? await bodyBytes(req, maxBytes) : undefined
        if (env.APP_MODE === 'demo') {
          if (upstreamPath === '/models') { res.setHeader('Content-Type', 'application/json'); return res.end('{"data":[{"id":"demo-fixture"}]}') }
          if (upstreamPath !== '/anthropic/v1/messages') return fail(res, 501, '演示模式不提供文件上传或语音服务。请配置真实 API。')
          let parsed
          try { parsed = JSON.parse(body.toString()) } catch { return fail(res, 400, '无效 JSON') }
          if (!parsed || !Array.isArray(parsed.messages)) return fail(res, 400, 'messages 必须是数组')
          return await demoReply(parsed, res, abort.signal)
        }
        const headers = new Headers()
        if (req.headers['content-type']) headers.set('Content-Type', req.headers['content-type'])
        if (req.headers.accept) headers.set('Accept', req.headers.accept)
        if (upstreamPath.startsWith('/anthropic/')) {
          headers.set('x-api-key', env.DEEPSEEK_API_KEY)
          if (req.headers['anthropic-beta']) headers.set('anthropic-beta', 'files-api-2025-04-14')
        } else headers.set('Authorization', `Bearer ${env.DEEPSEEK_API_KEY}`)
        const upstream = await fetchUpstream(new URL(upstreamPath, origin), { method: req.method, headers, body, signal: abort.signal, redirect: 'error' })
        // Only accept a bounded structured message, redact credentials and never relay HTML.
        // Preserve file-id error text: upstream uses it for attachment recovery.
        if (!upstream.ok) {
          let message = `API 服务返回 ${upstream.status}。请检查密钥、余额、模型权限及搜索/文件等扩展能力。`
          if (upstream.body) {
            const reader = upstream.body.getReader()
            const chunks = []
            let size = 0
            try {
              while (size <= 8192) {
                const next = await reader.read()
                if (next.done) break
                size += next.value.length
                if (size <= 8192) chunks.push(next.value)
              }
              if (size <= 8192) {
                const parsed = JSON.parse(Buffer.concat(chunks).toString())
                if (typeof parsed.error?.message === 'string') message = parsed.error.message.replaceAll(env.DEEPSEEK_API_KEY, '[redacted]').slice(0, 2000)
              }
            } catch { /* Keep the generic safe message. */ }
            finally { await reader.cancel().catch(() => {}) }
          }
          return fail(res, upstream.status, message)
        }
        res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' })
        res.flushHeaders()
        if (upstream.body) {
          for await (const chunk of upstream.body) {
            if (abort.signal.aborted) break
            if (!res.write(chunk)) await new Promise((resolve) => {
              const done = () => { res.off('drain', done); res.off('close', done); resolve() }
              res.once('drain', done); res.once('close', done)
            })
          }
        }
        res.end()
      } catch (error) {
        if (!res.destroyed) fail(res, error.status === 413 ? 413 : abort.signal.aborted ? 504 : 502, error.status === 413 ? '附件或请求超过服务端大小限制' : 'API 连接失败或超时，请检查服务端配置和网络')
      } finally {
        clearTimeout(timeout)
        active--
        res.off('close', onClose)
        req.off('aborted', onClose)
      }
      return
    }
    if (!['GET', 'HEAD'].includes(req.method)) return fail(res, 405, '不支持的方法')
    try {
      const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
      const file = path.resolve(dist, `.${relative}`)
      if (!file.startsWith(`${dist}${path.sep}`) || !(await stat(file)).isFile()) return fail(res, 404, '文件不存在')
      if (!mime[path.extname(file)] && path.basename(file) !== 'LICENSE') return fail(res, 404, '文件不存在')
      res.setHeader('Content-Type', mime[path.extname(file)] || 'text/plain; charset=utf-8')
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://api.deepseek.com; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
      if (req.method === 'HEAD') return res.end()
      const stream = createReadStream(file)
      stream.on('error', () => res.destroy())
      res.on('close', () => stream.destroy())
      stream.pipe(res)
    } catch { fail(res, 404, '页面不存在。请先运行 pnpm build。') }
  })
  server.requestTimeout = 60000
  server.headersTimeout = 15000
  return server
}

export async function startServer(env = process.env) {
  if (env.APP_MODE === 'direct' && !LOOPBACK.has(env.HOST || '127.0.0.1')) throw new Error('直连模式仅用于个人开发。')
  const server = createAppServer(env)
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(env.PORT || 8090), env.HOST || '127.0.0.1', resolve) })
  console.log(`Edu_chat gateway: http://${env.HOST || '127.0.0.1'}:${server.address().port}`)
  return server
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
