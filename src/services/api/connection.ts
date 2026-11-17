export type AppConnection = { origin: string | null; token: string | null }
type ConnectionErrorKey =
  | 'serverInvalidOrigin'
  | 'serverOriginRequired'
  | 'serverNewTokenRequired'
  | 'serverShortToken'
export class ConnectionError extends Error {
  readonly key: ConnectionErrorKey
  constructor(key: ConnectionErrorKey) {
    super(key)
    this.key = key
  }
}

/** Accept a root URL or a pasted /api URL, never credentials, queries or arbitrary paths. */
export const normalizeServerOrigin = (value: string, android = false): string | null => {
  const text = value.trim()
  if (!text) {
    if (android) {
      throw new ConnectionError('serverOriginRequired')
    }
    return null
  }
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new ConnectionError('serverInvalidOrigin')
  }
  const localHttp =
    !android &&
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !localHttp) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['/', '/api', '/api/'].includes(url.pathname)
  ) {
    throw new ConnectionError('serverInvalidOrigin')
  }
  return url.origin
}

export const prepareConnection = (
  address: string,
  tokenInput: string,
  saved: AppConnection,
  android = false
): AppConnection => {
  const origin = normalizeServerOrigin(address, android)
  let oldOrigin: string | null
  try {
    oldOrigin = normalizeServerOrigin(saved.origin ?? '', false)
  } catch {
    oldOrigin = saved.origin
  }
  const entered = tokenInput.trim()
  // A saved bearer token must never be silently sent to a different server.
  if (origin !== oldOrigin && saved.token && !entered) {
    throw new ConnectionError('serverNewTokenRequired')
  }
  const token = entered || (origin === oldOrigin ? saved.token : null)
  if (android && !token) {
    throw new ConnectionError('serverNewTokenRequired')
  }
  if (token && token.length < 16) {
    throw new ConnectionError('serverShortToken')
  }
  return { origin, token }
}
