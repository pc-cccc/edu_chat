import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
const require = createRequire(import.meta.url)
const result = spawnSync(process.execPath, [path.join(path.dirname(require.resolve('@rspack/cli/package.json')), 'bin/rspack.js'), 'build', '-c', 'rspack.config.ts'], {
  stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production', APP_MODE: process.argv.includes('--direct') ? 'direct' : 'server' },
})
process.exit(result.status ?? 1)
