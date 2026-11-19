/** Every request checks the account it was created for, including requests queued before logout. */
export const accountAccessToken = async (
  expectedUserId: string,
  readSession: () => Promise<{ user: { id: string }; access_token: string } | null>
): Promise<string> => {
  const session = await readSession()
  if (!session || session.user.id !== expectedUserId) {
    throw new Error('Cloud account changed')
  }
  return session.access_token
}

const pending = new Map<string, Promise<void>>()

/** Saves, renames and deletes for one account/session execute in order. */
export const queueCloudMutation = (
  userId: string,
  sessionId: string,
  operation: () => Promise<void>
): Promise<void> => {
  const key = `${userId}:${sessionId}`
  const previous = pending.get(key) ?? Promise.resolve()
  const task = previous.catch(() => {}).then(operation)
  pending.set(key, task)
  // The rejection is still returned to the caller; the cleanup branch must not be unhandled.
  void task
    .finally(() => {
      if (pending.get(key) === task) {
        pending.delete(key)
      }
    })
    .catch(() => {})
  return task
}
