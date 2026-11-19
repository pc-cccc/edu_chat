import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createPagesRelay } from '../pages/relay.mjs'
import { supabaseFetch } from '../src/services/supabase/transport.ts'
const nativeFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = nativeFetch
})
const relay = createPagesRelay({
  workerOrigin: 'https://worker.example',
  supabaseOrigin: 'https://project.supabase.co',
})
const call = (path, options = {}) =>
  relay.fetch(new Request(`https://app.pages.dev${path}`, options), {
    ASSETS: { fetch: async () => new Response('static page') },
  })

test('Pages forwards authenticated chat as a stream; strips cookies and client provider keys', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://worker.example/anthropic/v1/messages')
    assert.equal(init.redirect, 'manual')
    assert.equal(init.headers.get('authorization'), 'Bearer test-user-token')
    assert.equal(init.headers.get('cookie'), null)
    assert.equal(init.headers.get('x-api-key'), null)
    assert.equal(await new Response(init.body).text(), '{"messages":[]}')
    return new Response('data: test\n\n', {
      headers: { 'Content-Type': 'text/event-stream', 'Set-Cookie': 'discard=1' },
    })
  }
  const res = await call('/api/anthropic/v1/messages', {
    method: 'POST',
    body: '{"messages":[]}',
    headers: {
      authorization: 'Bearer test-user-token',
      cookie: 'secret-cookie',
      'x-api-key': 'discard',
      origin: 'https://app.pages.dev',
    },
  })
  assert.equal(res.headers.get('x-edu-relay'), '1')
  assert.equal(res.headers.get('set-cookie'), null)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.equal(await res.text(), 'data: test\n\n')
})

test('Pages relays login and history to the fixed Supabase origin, retaining query and public API key', async () => {
  let urls = []
  globalThis.fetch = async (url, init) => {
    urls.push(String(url))
    assert.equal(init.headers.get('apikey'), 'public-test')
    return new Response('[]')
  }
  for (const path of ['/auth/v1/token?grant_type=refresh_token', '/rest/v1/chat_rooms?select=id']) {
    const res = await call(`/supabase${path}`, {
      headers: { apikey: 'public-test' },
      method: path.includes('token') ? 'POST' : 'GET',
    })
    await res.text()
  }
  assert.deepEqual(urls, [
    'https://project.supabase.co/auth/v1/token?grant_type=refresh_token',
    'https://project.supabase.co/rest/v1/chat_rooms?select=id',
  ])
})

test('Pages does not expose arbitrary routes, admin auth, RPC, or cross-origin requests', async () => {
  globalThis.fetch = async () => assert.fail('unexpected upstream call')
  for (const path of [
    '/api/https://evil.example',
    '/api//evil.example',
    '/supabase/auth/v1/admin/users',
    '/supabase/rest/v1/rpc/danger',
  ]) {
    assert.equal((await call(path)).status, 404)
  }
  assert.equal(
    (await call('/api/models', { headers: { origin: 'https://other.example' } })).status,
    403
  )
  assert.equal(await (await call('/')).text(), 'static page')
})

test('Pages never follows redirects or exposes internal fetch errors', async () => {
  globalThis.fetch = async () =>
    new Response(null, { status: 302, headers: { location: 'https://evil.example' } })
  assert.equal((await call('/api/models')).status, 502)
  globalThis.fetch = async () => {
    throw new Error('private-internal-value')
  }
  const response = await call('/api/models')
  assert.equal(response.status, 502)
  assert.doesNotMatch(await response.text(), /private-internal-value/)
})

test('Pages preserves authentication failures and cancellation', async () => {
  let signal,
    cancelled = false
  globalThis.fetch = async (_url, init) => {
    signal = init.signal
    return new Response(
      new ReadableStream({
        cancel() {
          cancelled = true
        },
      }),
      { status: 401 }
    )
  }
  const controller = new AbortController()
  const res = await call('/api/models', { signal: controller.signal })
  assert.equal(res.status, 401)
  controller.abort()
  assert.equal(signal.aborted, true)
  await res.body.cancel()
  assert.equal(cancelled, true)
})

test('web Supabase transport uses Pages without changing storage project identity; Android stays remote', async () => {
  globalThis.__SUPABASE_URL__ = 'https://project.supabase.co'
  globalThis.__APP_TARGET__ = 'web'
  globalThis.window = { location: { origin: 'https://app.pages.dev' } }
  const urls = []
  globalThis.fetch = async (input) => {
    urls.push(input instanceof Request ? input.url : String(input))
    return new Response('ok')
  }
  await supabaseFetch('https://project.supabase.co/auth/v1/token?grant_type=refresh_token')
  await supabaseFetch(new Request('https://project.supabase.co/rest/v1/messages?select=id'))
  globalThis.__APP_TARGET__ = 'android'
  await supabaseFetch('https://project.supabase.co/auth/v1/user')
  assert.deepEqual(urls, [
    'https://app.pages.dev/supabase/auth/v1/token?grant_type=refresh_token',
    'https://app.pages.dev/supabase/rest/v1/messages?select=id',
    'https://project.supabase.co/auth/v1/user',
  ])
  delete globalThis.window
})
