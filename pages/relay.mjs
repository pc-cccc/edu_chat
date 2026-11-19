// Pages advanced-mode relay. Upstream origins are fixed at build time, never supplied by callers.
export function createPagesRelay(config) {
  const workerOrigin = new URL(config.workerOrigin).origin
  const supabaseOrigin = new URL(config.supabaseOrigin).origin
  const authRoutes = new Set([
    'token',
    'user',
    'logout',
    'signup',
    'recover',
    'resend',
    'verify',
    'settings',
  ])
  const tables = new Set([
    'profiles',
    'chat_rooms',
    'room_members',
    'messages',
    'files',
    'user_preferences',
    'presence',
  ])
  const json = (status, message) =>
    Response.json(
      { error: { message } },
      {
        status,
        headers: { 'Cache-Control': 'no-store', 'X-Edu-Relay': '1' },
      }
    )
  return {
    async fetch(request, env) {
      const url = new URL(request.url)
      const api = url.pathname.startsWith('/api/')
      const supabase = url.pathname.startsWith('/supabase/')
      if (!api && !supabase) return env.ASSETS.fetch(request)
      // Browser callers use this website's origin. Do not create an open cross-origin proxy.
      const origin = request.headers.get('origin')
      if (origin && origin !== url.origin) return json(403, '请求来源不受支持')
      const path = url.pathname.slice(api ? 4 : 9)
      let allowed = false
      if (api) {
        allowed =
          (request.method === 'GET' && ['/health', '/models'].includes(path)) ||
          (request.method === 'POST' &&
            [
              '/anthropic/v1/messages',
              '/anthropic/v1/files',
              '/v1/tools/asr',
              '/v1/tools/tts',
            ].includes(path)) ||
          (request.method === 'DELETE' && /^\/anthropic\/v1\/files\/[A-Za-z0-9_-]+$/.test(path))
      } else {
        const parts = path.split('/')
        allowed =
          parts.length === 4 &&
          ((parts[1] === 'auth' &&
            parts[2] === 'v1' &&
            authRoutes.has(parts[3]) &&
            ['GET', 'POST', 'PUT'].includes(request.method)) ||
            (parts[1] === 'rest' &&
              parts[2] === 'v1' &&
              tables.has(parts[3]) &&
              ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'].includes(request.method)))
      }
      if (!allowed) return json(404, '接口不存在')
      const target = new URL(api ? workerOrigin : supabaseOrigin)
      target.pathname = api && path === '/health' ? '/' : path
      target.search = url.search
      const headers = new Headers()
      for (const name of [
        'authorization',
        'apikey',
        'content-type',
        'accept',
        'anthropic-beta',
        'prefer',
        'range',
        'range-unit',
        'x-client-info',
        'x-supabase-api-version',
      ]) {
        const value = request.headers.get(name)
        if (value) headers.set(name, value)
      }
      // Do not forward cookies, client API keys, or arbitrary destination headers.
      headers.set('origin', url.origin)
      try {
        const upstream = await fetch(target, {
          method: request.method,
          headers,
          body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
          duplex: 'half',
          signal: request.signal,
          redirect: 'manual',
        })
        if (
          upstream.type === 'opaqueredirect' ||
          (upstream.status >= 300 && upstream.status < 400)
        ) {
          await upstream.body?.cancel()
          return json(502, '服务地址发生重定向，请联系维护者')
        }
        const responseHeaders = new Headers({ 'Cache-Control': 'no-store', 'X-Edu-Relay': '1' })
        for (const name of ['content-type', 'content-range', 'retry-after', 'www-authenticate']) {
          const value = upstream.headers.get(name)
          if (value) responseHeaders.set(name, value)
        }
        // Pass SSE straight through; do not buffer or consume the response body.
        return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
      } catch {
        return json(502, '网页已连接，但云端服务暂时无法访问，请稍后重试')
      }
    },
  }
}
