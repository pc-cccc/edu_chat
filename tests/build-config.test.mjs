import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serverlessConfig } from '../scripts/serverless-config.mjs'
const valid = {
  WORKER_ORIGIN: 'https://worker.example/',
  SUPABASE_URL: 'https://project.supabase.co/',
  SUPABASE_ANON_KEY: 'sb_publishable_test_only',
}
test('serverless build normalizes trailing slash and accepts public keys', () => {
  assert.equal(serverlessConfig(valid).WORKER_ORIGIN, 'https://worker.example')
  const anon = `header.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`
  assert.equal(serverlessConfig({ ...valid, SUPABASE_ANON_KEY: anon }).SUPABASE_ANON_KEY, anon)
})
test('serverless build rejects secrets and user tokens without echoing them', () => {
  for (const key of [
    'sk-private',
    'sb_secret_private',
    `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.private`,
    `header.${Buffer.from(JSON.stringify({ role: 'authenticated' })).toString('base64url')}.private`,
  ]) {
    assert.throws(
      () => serverlessConfig({ ...valid, SUPABASE_ANON_KEY: key }),
      (error) => !error.message.includes(key)
    )
  }
})
test('serverless build rejects insecure or ambiguous backend URLs', () => {
  for (const url of [
    'http://worker.example',
    'https://user:pass@worker.example',
    'https://worker.example/api',
    'https://worker.example/?key=secret',
    'https://worker.example/#hash',
    '',
  ]) {
    assert.throws(() => serverlessConfig({ ...valid, WORKER_ORIGIN: url }))
  }
})
