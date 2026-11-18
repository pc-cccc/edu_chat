import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
const require = createRequire(import.meta.url)
const android = process.argv.includes('--android')
const mode = process.argv.includes('--direct')
  ? 'direct'
  : process.argv.includes('--serverless')
    ? 'serverless'
    : 'server'

// serverless 模式必须提供 Worker 地址与 Supabase 配置，缺失时明确报错。
if (mode === 'serverless') {
  const missing = ['WORKER_ORIGIN', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter(
    (key) => !process.env[key]
  )
  if (missing.length > 0) {
    console.error(`serverless 构建缺少环境变量：${missing.join('、')}。请在构建前设置它们。`)
    process.exit(1)
  }
}

const result = spawnSync(process.execPath, [path.join(path.dirname(require.resolve('@rspack/cli/package.json')), 'bin/rspack.js'), 'build', '-c', 'rspack.config.ts'], {
  stdio: 'inherit', env: {
    ...process.env,
    NODE_ENV: 'production',
    APP_MODE: mode,
    APP_TARGET: android ? 'android' : 'web',
  },
})
process.exit(result.status ?? 1)
