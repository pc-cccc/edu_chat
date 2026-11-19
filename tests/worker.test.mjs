import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import worker from '../workers/worker.js'

// 这些测试用 HS256 回退路径验证 Worker 的鉴权与 CORS：
// 通过 mock 让 JWKS 校验失败（token alg=HS256 不在 JWKS 白名单），落到 HS256 回退，
// 从而复用同一个 SUPABASE_JWT_SECRET 构造可控 token。
const SECRET = 'test-jwt-secret-32-bytes-minimum!!'
const SUPABASE_URL = 'https://test.supabase.co'
const env = {
  DEEPSEEK_API_KEY: 'sk-test-deepseek',
  SUPABASE_URL,
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_JWT_SECRET: SECRET,
  ALLOWED_ORIGINS: 'https://app.pages.dev',
}

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
const sign = (payload, secret = SECRET) => {
  const header = b64url({ alg: 'HS256', typ: 'JWT' })
  const body = b64url(payload)
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

const now = () => Math.floor(Date.now() / 1000)
const userToken = () =>
  sign({ role: 'authenticated', sub: 'u-1', iss: `${SUPABASE_URL}/auth/v1`, aud: 'authenticated', exp: now() + 3600 })
const anonToken = () => sign({ role: 'anon', ref: 'test', iss: 'supabase', exp: now() + 3600 })
const serviceToken = () => sign({ role: 'service_role', ref: 'test', iss: 'supabase', exp: now() + 3600 })
const expiredToken = () =>
  sign({ role: 'authenticated', sub: 'u-1', iss: `${SUPABASE_URL}/auth/v1`, aud: 'authenticated', exp: now() - 10 })

function mockFetch() {
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes('api.deepseek.com/models')) {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.includes('api.deepseek.com')) {
      return new Response(JSON.stringify({ id: 'file-api-1', filename: 'a.txt' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.includes('supabase.co/rest/v1')) {
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('.well-known/jwks.json')) {
      return new Response('{"keys":[]}', { status: 200, headers: { 'content-type': 'application/json' } })
    }
    throw new Error(`unexpected fetch: ${url}`)
  }
}

const call = (method, path, headers = {}) =>
  worker.fetch(
    new Request(`https://app.pages.dev${path}`, {
      method,
      headers: { origin: 'https://app.pages.dev', 'content-type': 'application/json', ...headers },
    }),
    env
  )

test.beforeEach(() => mockFetch())

test('401 无凭据，并带 CORS 头', async () => {
  const res = await call('POST', '/anthropic/v1/messages')
  assert.equal(res.status, 401)
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://app.pages.dev')
})

test('拒绝 anon 角色（有效签名）', async () => {
  const res = await call('POST', '/anthropic/v1/messages', {
    authorization: `Bearer ${anonToken()}`,
  })
  assert.equal(res.status, 401)
})

test('拒绝 service_role（有效签名）', async () => {
  const res = await call('POST', '/anthropic/v1/messages', {
    authorization: `Bearer ${serviceToken()}`,
  })
  assert.equal(res.status, 401)
})

test('拒绝过期凭据', async () => {
  const res = await call('POST', '/anthropic/v1/messages', {
    authorization: `Bearer ${expiredToken()}`,
  })
  assert.equal(res.status, 401)
})

test('接受真实登录用户', async () => {
  const res = await call('GET', '/models', { authorization: `Bearer ${userToken()}` })
  assert.equal(res.status, 200)
  await res.text()
})

test('未知路由 404 并带 CORS 头', async () => {
  const res = await call('GET', '/nope', { authorization: `Bearer ${userToken()}` })
  assert.equal(res.status, 404)
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://app.pages.dev')
})

test('OPTIONS 预检返回 CORS 允许方法与头', async () => {
  const res = await call('OPTIONS', '/anthropic/v1/messages', {
    'access-control-request-method': 'POST',
  })
  assert.equal(res.status, 204)
  assert.match(res.headers.get('access-control-allow-methods') ?? '', /POST/)
})
