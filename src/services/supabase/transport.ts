/** Web uses Pages to reach Supabase; native builds retain their configured remote origin. */
export const supabaseFetch: typeof fetch = (input, init) => {
  // This module runs in the browser; narrow the ambient Node fetch overloads.
  const requestInput = input as RequestInfo | URL
  const options = init as RequestInit | undefined
  const original = new URL(
    typeof requestInput === 'string'
      ? requestInput
      : requestInput instanceof URL
        ? requestInput.href
        : requestInput.url
  )
  const project = new URL(__SUPABASE_URL__)
  if (
    __APP_TARGET__ === 'web' &&
    original.origin === project.origin &&
    (original.pathname.startsWith('/auth/v1/') || original.pathname.startsWith('/rest/v1/'))
  ) {
    const target = new URL(
      `/supabase${original.pathname}${original.search}`,
      window.location.origin
    )
    return fetch(
      requestInput instanceof Request ? new Request(target, requestInput) : target,
      options
    )
  }
  return fetch(requestInput, options)
}
