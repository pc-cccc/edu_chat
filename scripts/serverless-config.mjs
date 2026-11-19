/** Validate only public values that will be embedded in the web bundle / APK. */
export function serverlessConfig(env) {
  const result = {}
  for (const name of ['WORKER_ORIGIN', 'SUPABASE_URL']) {
    let url
    try {
      url = new URL(env[name])
    } catch {
      throw new Error(`${name} 必须填写完整 HTTPS 地址。`)
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/*$/.test(url.pathname)
    ) {
      throw new Error(`${name} 只能填写 HTTPS 根域名，不能带密码、路径、查询参数。`)
    }
    result[name] = url.origin
  }
  const key = String(env.SUPABASE_ANON_KEY ?? '').trim()
  let isAnon = false
  try {
    const parts = key.split('.')
    isAnon =
      parts.length === 3 &&
      JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role === 'anon'
  } catch {
    /* Not a legacy public JWT. */
  }
  if (!key.startsWith('sb_publishable_') && !isAnon) {
    throw new Error(
      'SUPABASE_ANON_KEY 必须是 publishable key 或 anon public key；禁止填写 service_role、secret key、用户 token 或 DeepSeek 密钥。'
    )
  }
  result.SUPABASE_ANON_KEY = key
  return result
}
