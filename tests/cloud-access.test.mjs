import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accountAccessToken, queueCloudMutation } from '../src/services/chat/cloudAccess.ts'

test('pending cloud request never borrows the next account token', async () => {
  let finish
  const pendingSession = new Promise((resolve) => {
    finish = resolve
  })
  const pendingToken = accountAccessToken('alice', () => pendingSession)
  finish({ user: { id: 'bob' }, access_token: 'bob-token' })
  await assert.rejects(pendingToken, /account changed/)
  await assert.rejects(
    accountAccessToken('alice', async () => null),
    /account changed/
  )
  assert.equal(
    await accountAccessToken('alice', async () => ({
      user: { id: 'alice' },
      access_token: 'alice-token',
    })),
    'alice-token'
  )
})

test('delete waits for outstanding saves; independent users are not blocked', async () => {
  const events = []
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const save = queueCloudMutation('alice', 'room', async () => {
    await gate
    events.push('save')
  })
  const remove = queueCloudMutation('alice', 'room', async () => {
    events.push('delete')
  })
  await queueCloudMutation('bob', 'room', async () => {
    events.push('bob')
  })
  assert.deepEqual(events, ['bob'])
  release()
  await Promise.all([save, remove])
  assert.deepEqual(events, ['bob', 'save', 'delete'])
})

test('failed save does not prevent subsequent retry/delete', async () => {
  const first = queueCloudMutation('alice', 'retry', async () => {
    throw new Error('offline')
  })
  let retried = false
  const next = queueCloudMutation('alice', 'retry', async () => {
    retried = true
  })
  await assert.rejects(first, /offline/)
  await next
  assert.equal(retried, true)
})
