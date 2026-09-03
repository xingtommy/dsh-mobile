#!/usr/bin/env node
/**
 * start-web.mjs — launch `dsh web` and the PIN gateway in one step.
 *
 * dsh web (alpha.3+) prints a per-process launch token as `?token=…` on startup
 * (its own browser-session auth). This script:
 *   1. starts `pnpm dsh web` in the harness and captures that token,
 *   2. starts the PIN gateway with DSH_GATEWAY_DSH_TOKEN=<token>, so a successful
 *      PIN login redirects to `/?token=…`, letting dsh web mint its browser-session
 *      cookie for the caller — public access becomes PIN-only (no manual token).
 *
 * Usage:
 *   node scripts/start-web.mjs <harnessDir> [--gw-port 3081] [--web-port 3080]
 *        [--gateway-dir <dir>] [--pin <pin>]
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const harness = args[0]
const opt = (flag, fallback) => {
  const at = args.indexOf(flag)
  return at === -1 ? fallback : args[at + 1]
}
const GW_PORT = opt('--gw-port', '3081')
const WEB_PORT = opt('--web-port', '3080')
const GATEWAY_DIR = opt('--gateway-dir', join(here, '..', 'gateway'))
const PIN = opt('--pin', null)

if (!harness) {
  console.error('usage: node scripts/start-web.mjs <harnessDir> [--gw-port 3081] [--web-port 3080] [--gateway-dir <dir>] [--pin <pin>]')
  process.exit(2)
}

const log = (...a) => console.log('[start-web]', ...a)
// Windows: pnpm must be invoked as pnpm.cmd (ExecutionPolicy blocks pnpm.ps1).
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

let token = null
let gateway = null
let dying = false

function shutdown() {
  if (dying) return
  dying = true
  log('shutting down…')
  if (gateway) gateway.kill()
  if (dsh.exitCode === null) dsh.kill()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

function startGateway() {
  const gwScript = join(GATEWAY_DIR, 'dsh-gateway.mjs')
  const env = {
    ...process.env,
    DSH_GATEWAY_DSH_TOKEN: token,
    ...(PIN ? { DSH_GATEWAY_PIN: PIN } : {}),
  }
  gateway = spawn('node', [gwScript, '--listen', GW_PORT, '--target', `127.0.0.1:${WEB_PORT}`], {
    env,
    stdio: 'inherit',
  })
  gateway.on('exit', (code) => {
    log(`gateway exited (${code})`)
    if (!dying && dsh.exitCode === null) dsh.kill()
    process.exit(code ?? 0)
  })
  log(`PIN gateway on 127.0.0.1:${GW_PORT} → http://127.0.0.1:${WEB_PORT}`)
  log('public access is PIN-only; point your NPS TCP tunnel at 127.0.0.1:' + GW_PORT)
  if (process.env.DSH_PUBLIC_HOST) {
    log('public URL: http://' + process.env.DSH_PUBLIC_HOST + ':' + GW_PORT + '/')
  }
}

// 1. Start dsh web, streaming its output and capturing the launch token.
const TOKEN_RE = /\/\?token=([A-Za-z0-9_-]+)/
const dsh = spawn(pnpm, ['dsh', 'web'], { cwd: harness, stdio: ['ignore', 'pipe', 'pipe'] })
let buf = ''
dsh.stdout.on('data', (c) => {
  const s = c.toString()
  process.stdout.write(s)
  buf += s
  if (token === null) {
    const m = TOKEN_RE.exec(buf)
    if (m) {
      token = m[1]
      log(`captured dsh web launch token: ${token}`)
      startGateway()
    }
  }
})
dsh.stderr.on('data', (c) => process.stderr.write(c.toString()))
dsh.on('exit', (code) => {
  log(`dsh web exited (${code})`)
  if (!dying && gateway) gateway.kill()
  process.exit(code ?? 0)
})
