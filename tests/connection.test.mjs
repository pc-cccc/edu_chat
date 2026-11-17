import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeServerOrigin, prepareConnection } from '../src/services/api/connection.ts'

test('server URL accepts root and /api without duplicating the API prefix', () => {
  for (const address of ['https://chat.example', ' https://chat.example/api ', 'https://chat.example/api/']) {
    assert.equal(normalizeServerOrigin(address, true), 'https://chat.example')
  }
  assert.equal(normalizeServerOrigin('http://localhost:8090'), 'http://localhost:8090')
  assert.equal(normalizeServerOrigin(''), null)
})

test('rejects cleartext Android URLs, credentials, parameters and ambiguous paths', () => {
  for (const address of ['http://localhost:8090', 'http://chat.example', 'https://user:pass@chat.example', 'https://chat.example/?token=x', 'https://chat.example/#x', 'https://chat.example/chat', 'chat.example']) {
    assert.throws(() => normalizeServerOrigin(address, true), { key: 'serverInvalidOrigin' })
  }
  assert.throws(() => normalizeServerOrigin('', true), { key: 'serverOriginRequired' })
  assert.throws(() => normalizeServerOrigin('http://chat.example'), { key: 'serverInvalidOrigin' })
})

test('changing servers requires a new token and never mutates the saved connection', () => {
  const saved = Object.freeze({ origin: 'https://old.example', token: 'old-token-fixture-123' })
  assert.throws(() => prepareConnection('https://new.example', '', saved, true), { key: 'serverNewTokenRequired' })
  assert.deepEqual(prepareConnection('https://new.example/api', 'new-token-fixture-456', saved, true), { origin: 'https://new.example', token: 'new-token-fixture-456' })
  assert.deepEqual(saved, { origin: 'https://old.example', token: 'old-token-fixture-123' })
  assert.deepEqual(prepareConnection('https://old.example/api/', '', saved, true), saved)
})

test('Android requires a token and rejects short tokens before any network request', () => {
  const empty = { origin: null, token: null }
  assert.throws(() => prepareConnection('https://chat.example', '', empty, true), { key: 'serverNewTokenRequired' })
  assert.throws(() => prepareConnection('https://chat.example', 'short', empty, true), { key: 'serverShortToken' })
  assert.deepEqual(prepareConnection('', '', empty), empty)
})
