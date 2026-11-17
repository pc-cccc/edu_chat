import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createAppServer } from '../server/index.mjs'

async function fixture(t, env = {}, upstream) {
  const server = createAppServer({ HOST: '127.0.0.1', PORT: '0', ...env }, upstream)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  return `http://127.0.0.1:${server.address().port}`
}
const post = (body = '{}', headers = {}) => ({ method: 'POST', body, headers: { 'Content-Type': 'application/json', ...headers } })

test('missing key is explicit; status never contains the key', async (t) => {
  const url = await fixture(t)
  assert.deepEqual(await (await fetch(`${url}/api/status`)).json(), { configured: false, mode: 'server' })
  assert.equal((await fetch(`${url}/api/anthropic/v1/messages`, post())).status, 503)
})
test('gateway injects server key, strips client credentials/cookies, and forwards SSE unchanged', async (t) => {
  const frames = ['event: message_start\ndata: {"type":"message_start"}\n\n', 'event: message_stop\ndata: {"type":"message_stop"}\n\n']
  let captured
  const url = await fixture(t, { DEEPSEEK_API_KEY: 'test-server-only' }, async (target, init) => {
    captured = { target, init }
    return new Response(new ReadableStream({ start(c) { for (const frame of frames) c.enqueue(new TextEncoder().encode(frame)); c.close() } }), { headers: { 'Content-Type': 'text/event-stream' } })
  })
  const response = await fetch(`${url}/api/anthropic/v1/messages`, post('{"stream":true}', { Authorization: 'Bearer browser-value', Cookie: 'private=1', 'x-api-key': 'client-value' }))
  assert.equal(await response.text(), frames.join(''))
  assert.equal(captured.target.href, 'https://api.deepseek.com/anthropic/v1/messages')
  assert.equal(captured.init.headers.get('x-api-key'), 'test-server-only')
  assert.equal(captured.init.headers.get('Authorization'), null)
  assert.equal(captured.init.headers.get('Cookie'), null)
  assert.equal(captured.init.body.toString(), '{"stream":true}')
  assert.equal(captured.init.redirect, 'error')
  assert.equal((await (await fetch(`${url}/api/status`)).text()).includes('test-server-only'), false)
})
test('multipart attachments pass byte-for-byte with the Files beta header', async (t) => {
  let captured
  const url = await fixture(t, { DEEPSEEK_API_KEY: 'fixture-only' }, async (_, init) => { captured = init; return Response.json({ id: 'file_fixture' }) })
  const bytes = '--abc\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\n\r\nhello\r\n--abc--\r\n'
  const response = await fetch(`${url}/api/anthropic/v1/files`, post(bytes, { 'Content-Type': 'multipart/form-data; boundary=abc', 'anthropic-beta': 'files-api-2025-04-14' }))
  assert.equal(response.status, 200)
  assert.equal(captured.body.toString(), bytes)
  assert.equal(captured.headers.get('anthropic-beta'), 'files-api-2025-04-14')
})
test('upstream failures cannot echo provider keys into browser responses', async (t) => {
  const url = await fixture(t, { DEEPSEEK_API_KEY: 'sensitive-fixture' }, async () => new Response('sensitive-fixture', { status: 401 }))
  const response = await fetch(`${url}/api/models`)
  assert.equal(response.status, 401)
  assert.ok(!(await response.text()).includes('sensitive-fixture'))
})
test('public binding requires authentication and an HTTPS origin', () => {
  assert.throws(() => createAppServer({ HOST: '0.0.0.0' }), /HTTPS/)
  assert.throws(() => createAppServer({ HOST: '127.0.0.1', PUBLIC_ORIGIN: 'https://chat.example.com' }), /HTTPS/)
  assert.throws(() => createAppServer({ DEEPSEEK_API_ORIGIN: 'http://evil.example' }), /HTTPS/)
})
test('structured file errors remain recoverable while echoed credentials are redacted', async (t) => {
  const url = await fixture(t, { DEEPSEEK_API_KEY: 'private-fixture' }, async () => Response.json({ error: { message: 'file_ids do not exist or are not created under your account: file-api-test private-fixture' } }, { status: 400 }))
  const response = await fetch(`${url}/api/anthropic/v1/messages`, post())
  const text = await response.text()
  assert.match(text, /file_ids do not exist/)
  assert.match(text, /file-api-test/)
  assert.ok(!text.includes('private-fixture'))
})
test('authentication protects both API and static content', async (t) => {
  const url = await fixture(t, { APP_USER: 'owner', APP_PASSWORD: 'test-password-long' })
  assert.equal((await fetch(url)).status, 401)
  assert.equal((await fetch(`${url}/api/status`)).status, 401)
  const response = await fetch(`${url}/api/status`, { headers: { Authorization: `Basic ${Buffer.from('owner:test-password-long').toString('base64')}` } })
  assert.equal(response.status, 200)
})
test('app token authenticates a cross-origin first-party client and enables CORS', async (t) => {
  const url = await fixture(t, { APP_TOKEN: 'app-token-long-secret' })
  // 只配令牌时，无凭据与错误令牌都被拒绝
  assert.equal((await fetch(`${url}/api/status`)).status, 401)
  assert.equal((await fetch(`${url}/api/status`, { headers: { 'x-app-token': 'wrong' } })).status, 401)
  // 正确令牌 + App 本地 origin 通过，并返回 CORS 头
  const response = await fetch(`${url}/api/status`, { headers: { 'x-app-token': 'app-token-long-secret', Origin: 'https://localhost' } })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://localhost')
  // 令牌不会进入响应正文
  assert.ok(!(await response.text()).includes('app-token-long-secret'))
  // OPTIONS 预检被放行
  const preflight = await fetch(`${url}/api/anthropic/v1/messages`, { method: 'OPTIONS', headers: { Origin: 'https://localhost', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-app-token, content-type' } })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://localhost')
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-app-token/)
})
test('token-only deployment still rejects unauthenticated mutations from non-browser clients', async (t) => {
  const url = await fixture(t, { APP_TOKEN: 'app-token-long-secret', DEEPSEEK_API_KEY: 'fixture-only' }, async () => Response.json({ id: 'x' }))
  // 无令牌的 POST（模拟无 Origin 的非浏览器客户端）被 401 拒绝
  assert.equal((await fetch(`${url}/api/anthropic/v1/messages`, post())).status, 401)
  // 带令牌的 POST 通过
  assert.equal((await fetch(`${url}/api/anthropic/v1/messages`, post('{}', { 'x-app-token': 'app-token-long-secret' }))).status, 200)
})

test('App can read invalid-token and rate-limit errors instead of receiving opaque CORS failures', async (t) => {
  const url = await fixture(t, { APP_TOKEN: 'app-token-long-secret', RATE_LIMIT_PER_MINUTE: '1' })
  const headers = { Origin: 'https://localhost', 'x-app-token': 'wrong' }
  const denied = await fetch(`${url}/api/status`, { headers })
  assert.equal(denied.status, 401)
  assert.equal(denied.headers.get('access-control-allow-origin'), 'https://localhost')
  assert.equal(denied.headers.get('www-authenticate'), null)
  const limited = await fetch(`${url}/api/status`, { headers })
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get('access-control-allow-origin'), 'https://localhost')
})

test('CORS preflights allow only supported endpoints, methods, headers and App origins', async (t) => {
  const url = await fixture(t, { APP_TOKEN: 'app-token-long-secret' })
  for (const [endpoint, method, headers, origin] of [
    ['/status', 'DELETE', 'x-app-token', 'https://localhost'],
    ['/status', 'GET', 'x-arbitrary', 'https://localhost'],
    ['/admin', 'GET', 'x-app-token', 'https://localhost'],
    ['/status', 'GET', 'x-app-token', 'https://evil.example'],
  ]) {
    const response = await fetch(`${url}/api${endpoint}`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': headers } })
    assert.equal(response.status, 403)
    if (origin === 'https://evil.example') assert.equal(response.headers.get('access-control-allow-origin'), null)
  }
})
test('cross-origin mutations, unexpected Host and arbitrary proxy paths are rejected', async (t) => {
  const url = await fixture(t)
  assert.equal((await fetch(`${url}/api/anthropic/v1/messages`, post('{}', { Origin: 'https://evil.example' }))).status, 403)
  const hostStatus = await new Promise((resolve, reject) => {
    http.get(`${url}/api/status`, { headers: { Host: 'evil.example' } }, (response) => { response.resume(); resolve(response.statusCode) }).on('error', reject)
  })
  assert.equal(hostStatus, 403)
  assert.equal((await fetch(`${url}/api/admin`)).status, 404)
  assert.equal((await fetch(`${url}/api/models?url=https://evil.example`)).status, 404)
  assert.equal((await fetch(`${url}/.env`)).status, 404)
})
test('request size and global rate limits are enforced', async (t) => {
  const url = await fixture(t, { APP_MODE: 'demo', MAX_BODY_BYTES: '20', RATE_LIMIT_PER_MINUTE: '2' })
  assert.equal((await fetch(`${url}/api/anthropic/v1/messages`, post('x'.repeat(21)))).status, 413)
  assert.equal((await fetch(`${url}/api/models`)).status, 200)
  assert.equal((await fetch(`${url}/api/models`)).status, 429)
})
test('demo streams thinking, formula and completion; unsupported uploads fail honestly', async (t) => {
  const url = await fixture(t, { APP_MODE: 'demo' })
  const response = await fetch(`${url}/api/anthropic/v1/messages`, post(JSON.stringify({ messages: [], thinking: { type: 'enabled' } })))
  assert.match(response.headers.get('content-type'), /text\/event-stream/)
  const reader = response.body.getReader()
  const first = await reader.read()
  assert.match(new TextDecoder().decode(first.value), /message_start/)
  const chunks = [first.value]
  while (true) { const next = await reader.read(); if (next.done) break; chunks.push(next.value) }
  const text = Buffer.concat(chunks).toString()
  assert.match(text, /thinking_delta/)
  assert.match(text, /message_stop/)
  assert.match(text, /theta/)
  assert.equal((await fetch(`${url}/api/anthropic/v1/files`, post())).status, 501)
})
test('client cancellation aborts the upstream request', async (t) => {
  let resolveAborted
  const aborted = new Promise((resolve) => { resolveAborted = resolve })
  const url = await fixture(t, { DEEPSEEK_API_KEY: 'fixture-only' }, async (_, init) => new Response(new ReadableStream({ start(c) {
    c.enqueue(new TextEncoder().encode(': connected\n\n'))
    init.signal.addEventListener('abort', () => { resolveAborted(true); c.close() }, { once: true })
  } }), { headers: { 'Content-Type': 'text/event-stream' } }))
  const controller = new AbortController()
  const response = await fetch(`${url}/api/anthropic/v1/messages`, { ...post(), signal: controller.signal })
  await response.body.getReader().read()
  controller.abort()
  const result = await Promise.race([aborted, new Promise((resolve) => { const timeout = setTimeout(() => resolve(false), 2000); timeout.unref() })])
  assert.equal(result, true)
})
