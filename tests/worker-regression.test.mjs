import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:http'
import worker from '../workers/worker.js'
const require = createRequire(new URL('../workers/package.json', import.meta.url))
const { SignJWT, generateKeyPair, exportJWK } = await import(
  pathToFileURL(require.resolve('jose')).href
)
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})
const env = {
  SUPABASE_URL: 'https://regression.supabase.co',
  SUPABASE_ANON_KEY: 'public-test',
  SUPABASE_SERVICE_ROLE_KEY: 'private-test-service-role',
  SUPABASE_JWT_SECRET: 'only-a-test-signing-secret-not-production',
  DEEPSEEK_API_KEY: 'sk-only-test',
  ALLOWED_ORIGINS: 'https://app.pages.dev',
}
async function token(payload = {}, config = env) {
  return new SignJWT({ role: 'authenticated', ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    .setIssuer(`${config.SUPABASE_URL}/auth/v1`)
    .setAudience('authenticated')
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(config.SUPABASE_JWT_SECRET))
}
async function request(path, { method = 'GET', body, auth, signal } = {}, config = env) {
  return worker.fetch(
    new Request(`https://worker.example${path}`, {
      method,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        origin: 'https://app.pages.dev',
        authorization: `Bearer ${auth ?? (await token({}, config))}`,
        'content-type': 'application/json',
      },
    }),
    config
  )
}

test('JWT must have an expiration, even with a valid signature', async () => {
  const signed = await new SignJWT({
    role: 'authenticated',
    sub: 'alice',
    iss: `${env.SUPABASE_URL}/auth/v1`,
    aud: 'authenticated',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(new TextEncoder().encode(env.SUPABASE_JWT_SECRET))
  const res = await request('/models', { auth: signed })
  assert.equal(res.status, 401)
})

test('ES256 and RS256 validate against real HTTP JWKS and reuse cached keys', async () => {
  const ec = await generateKeyPair('ES256')
  const rsa = await generateKeyPair('RS256')
  const ecJwk = { ...(await exportJWK(ec.publicKey)), kid: 'ec', alg: 'ES256' }
  const rsaJwk = { ...(await exportJWK(rsa.publicKey)), kid: 'rsa', alg: 'RS256' }
  let jwksReads = 0
  const server = createServer((_req, res) => {
    jwksReads++
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ keys: [ecJwk, rsaJwk] }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const config = {
    ...env,
    SUPABASE_URL: `http://127.0.0.1:${server.address().port}`,
    SUPABASE_JWT_SECRET: undefined,
  }
  globalThis.fetch = async () => new Response('{"data":[]}')
  try {
    for (const [alg, kid, key] of [
      ['ES256', 'ec', ec.privateKey],
      ['RS256', 'rsa', rsa.privateKey],
    ]) {
      const signed = await new SignJWT({ role: 'authenticated' })
        .setProtectedHeader({ alg, kid })
        .setSubject('alice')
        .setIssuer(`${config.SUPABASE_URL}/auth/v1`)
        .setAudience('authenticated')
        .setExpirationTime('1h')
        .sign(key)
      const res = await request('/models', { auth: signed }, config)
      assert.equal(res.status, 200)
      await res.text()
    }
    assert.equal(jwksReads, 1)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('preflight works without secrets; config errors retain CORS', async () => {
  const config = { ALLOWED_ORIGINS: env.ALLOWED_ORIGINS }
  const preflight = await worker.fetch(
    new Request('https://worker.example/models', {
      method: 'OPTIONS',
      headers: { origin: env.ALLOWED_ORIGINS },
    }),
    config
  )
  assert.equal(preflight.status, 204)
  const res = await worker.fetch(
    new Request('https://worker.example/models', { headers: { origin: env.ALLOWED_ORIGINS } }),
    config
  )
  assert.equal(res.status, 500)
  assert.equal(res.headers.get('access-control-allow-origin'), env.ALLOWED_ORIGINS)
})

test('successful upload records only provider file ID and verified user with server-only credential', async () => {
  let recorded
  globalThis.fetch = async (input, options) => {
    if (String(input).includes('api.deepseek.com')) {
      assert.equal(options.headers.get('x-api-key'), env.DEEPSEEK_API_KEY)
      assert.equal(options.headers.get('authorization'), null)
      return Response.json({ id: 'file-real-provider' })
    }
    recorded = { headers: options.headers, body: JSON.parse(options.body) }
    return new Response(null, { status: 201 })
  }
  const res = await request('/anthropic/v1/files', { method: 'POST', body: { id: 'forged' } })
  assert.equal(res.status, 200)
  assert.equal(recorded.headers.get('authorization'), `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`)
  assert.deepEqual(recorded.body, {
    id: 'file-real-provider',
    user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  })
  assert.doesNotMatch(await res.text(), /private-test-service-role/)
})

test('missing file service credential refuses upload before spending provider quota', async () => {
  globalThis.fetch = async () => {
    assert.fail('must not contact provider')
  }
  const res = await request(
    '/anthropic/v1/files',
    { method: 'POST', body: {} },
    { ...env, SUPABASE_SERVICE_ROLE_KEY: undefined }
  )
  assert.equal(res.status, 503)
})

test('foreign file references are rejected using user-scoped lookup', async () => {
  globalThis.fetch = async (input, options) => {
    assert.match(String(input), /rest\/v1\/files/)
    assert.equal(options.headers.get('apikey'), env.SUPABASE_ANON_KEY)
    return Response.json([])
  }
  const res = await request('/anthropic/v1/messages', {
    method: 'POST',
    body: {
      messages: [
        {
          content: [{ type: 'document', source: { type: 'file', file_id: 'someone-elses-file' } }],
        },
      ],
    },
  })
  assert.equal(res.status, 403)
})

test('cancelling SSE closes upstream reader and aborts fetch', async () => {
  let upstreamSignal,
    cancelled = false
  globalThis.fetch = async (_input, options) => {
    upstreamSignal = options.signal
    return new Response(
      new ReadableStream({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode('data: hello\n\n'))
        },
        cancel() {
          cancelled = true
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } }
    )
  }
  const res = await request('/anthropic/v1/messages', { method: 'POST', body: {} })
  const reader = res.body.getReader()
  assert.match(new TextDecoder().decode((await reader.read()).value), /data: hello/)
  await reader.cancel()
  assert.equal(upstreamSignal.aborted, true)
  assert.equal(cancelled, true)
})
