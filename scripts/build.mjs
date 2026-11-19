import { serverlessConfig } from './serverless-config.mjs'
import { readFile, writeFile } from 'node:fs/promises'
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

// Refuse private credentials and normalize origins before embedding public config.
if (mode === 'serverless') {
  try {
    Object.assign(process.env, serverlessConfig(process.env))
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

const result = spawnSync(
  process.execPath,
  [
    path.join(path.dirname(require.resolve('@rspack/cli/package.json')), 'bin/rspack.js'),
    'build',
    '-c',
    'rspack.config.ts',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      APP_MODE: mode,
      APP_TARGET: android ? 'android' : 'web',
    },
  }
)
if (result.status !== 0) process.exit(result.status ?? 1)
if (mode === 'serverless' && !android) {
  const relay = await readFile(new URL('../pages/relay.mjs', import.meta.url), 'utf8')
  const config = {
    workerOrigin: process.env.WORKER_ORIGIN,
    supabaseOrigin: process.env.SUPABASE_URL,
  }
  await writeFile(
    new URL('../dist/_worker.js', import.meta.url),
    relay + '\nexport default createPagesRelay(' + JSON.stringify(config) + ')\n'
  )
  await writeFile(
    new URL('../dist/_routes.json', import.meta.url),
    JSON.stringify({
      version: 1,
      include: ['/api/*', '/supabase/*'],
      exclude: [],
    })
  )
}
