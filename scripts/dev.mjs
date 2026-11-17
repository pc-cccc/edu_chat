import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { startServer } from '../server/index.mjs'
const require = createRequire(import.meta.url)
const mode = process.argv.includes('--demo') ? 'demo' : process.argv.includes('--direct') ? 'direct' : 'server'
const port = mode === 'demo' ? 8092 : 8090
const gatewayPort = port + 1
const gateway = mode === 'direct' ? null : await startServer({
  ...process.env, HOST: '127.0.0.1', PORT: String(gatewayPort), APP_MODE: mode,
  PUBLIC_ORIGIN: `http://127.0.0.1:${port}`, APP_USER: '', APP_PASSWORD: '',
})
const child = spawn(process.execPath, [path.join(path.dirname(require.resolve('@rspack/cli/package.json')), 'bin/rspack.js'), 'serve', '-c', 'rspack.config.ts'], {
  stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development', APP_MODE: mode, DEV_PORT: String(port), GATEWAY_PORT: String(gatewayPort) },
})
let closing = false
function stop(code = 0) {
  if (closing) return
  closing = true
  child.kill()
  gateway?.closeAllConnections()
  gateway?.close()
  process.exitCode = code
}
child.on('error', () => stop(1))
child.on('exit', (code) => stop(code ?? 0))
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
