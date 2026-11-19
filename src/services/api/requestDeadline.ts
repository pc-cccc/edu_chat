/** Bound the pre-fetch session lookup as well as the fetch itself. */
export const waitForSession = <T>(
  pending: Promise<T>,
  signal?: AbortSignal | null,
  timeoutMs = 12000
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
    const abort = () => {
      cleanup()
      reject(signal?.reason ?? new DOMException('Cancelled', 'AbortError'))
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new DOMException('登录状态检查超时，请退出后重新登录', 'TimeoutError'))
    }, timeoutMs)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {abort()}
    pending.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error) => {
        cleanup()
        reject(error)
      }
    )
  })
