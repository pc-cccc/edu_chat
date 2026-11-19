import { test } from 'node:test'
import assert from 'node:assert/strict'
import { waitForSession } from '../src/services/api/requestDeadline.ts'
test('session lookup cannot hang indefinitely before a network request', async () => {
  await assert.rejects(waitForSession(new Promise(() => {}), undefined, 5), {
    name: 'TimeoutError',
  })
})
test('session lookup respects cancellation including pre-aborted callers', async () => {
  const controller = new AbortController()
  const pending = waitForSession(new Promise(() => {}), controller.signal)
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  await assert.rejects(waitForSession(Promise.resolve('unused'), controller.signal), {
    name: 'AbortError',
  })
})
test('session lookup preserves success/errors and cleans up deadlines', async () => {
  assert.equal(await waitForSession(Promise.resolve('test-token')), 'test-token')
  await assert.rejects(waitForSession(Promise.reject(new Error('login expired'))), /login expired/)
})
