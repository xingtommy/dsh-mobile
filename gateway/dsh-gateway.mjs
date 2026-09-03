#!/usr/bin/env node
/**
 * dsh-gateway — tiny zero-dependency local reverse proxy in front of `dsh web`.
 *
 * Public (NPS) access is a TCP tunnel, so NPS cannot apply HTTP auth, and the
 * dsh webserver ships no compression. This proxy provides both at the public
 * door without touching dsh core:
 *   • PIN login: a self-contained PIN page served by the gateway itself — no
 *     browser dialog, so it works in every mobile browser and in-app webview
 *     (incl. WeChat). Open the bare URL, type the PIN, you're in.
 *   • gzip / brotli for compressible responses.
 *
 * Loopback hosts (127.0.0.1 / localhost) bypass the PIN entirely and get an
 * extra /__setpin page — set the PIN on the desktop, type it on the phone.
 * Changing the PIN invalidates every active phone session (the session cookie
 * is HMAC-signed with the PIN).
 *
 * Point the NPS tunnel here (target_addr 127.0.0.1:3081) instead of dsh.
 * Desktop loopback use of 127.0.0.1:3080 is unaffected.
 *
 * Run:  node dsh-gateway.mjs [--listen 3081] [--target 127.0.0.1:3080]
 * PIN:  <dir>/auth.json →  {"pin":"1234"}   (4-12 digits; or DSH_GATEWAY_PIN env)
 *       change it at http://127.0.0.1:3081/__setpin — or, on the desktop app,
 *       设置 → 插件 → 可配置 → 访问 PIN card (posts here with Accept: json).
 *       auth.json is watched, so hand edits also reload the running PIN.
 */
import http from 'node:http'
import net from 'node:net'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { readFileSync, existsSync, writeFileSync, renameSync, watchFile } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// ── PIN ────────────────────────────────────────────────────────────────────
const AUTH_FILE = join(here, 'auth.json')
if (!existsSync(AUTH_FILE)) {
  console.error(`[dsh-gateway] missing ${AUTH_FILE} — create {"pin":"1234"}`)
  process.exit(1)
}
let pin = process.env.DSH_GATEWAY_PIN ?? (JSON.parse(readFileSync(AUTH_FILE, 'utf8')).pin ?? null)
if (!pin) {
  console.error('[dsh-gateway] auth.json must set "pin" (4-12 digits) — or set DSH_GATEWAY_PIN')
  process.exit(1)
}
// Follow external edits to auth.json (hand editing, or another writer) so the
// in-memory PIN always reflects the file. The /__setpin handler writes the file
// itself, so its own write reloads to the same value — a harmless no-op.
watchFile(AUTH_FILE, { persistent: true, interval: 2000 }, () => {
  try {
    const next = JSON.parse(readFileSync(AUTH_FILE, 'utf8')).pin
    if (typeof next === 'string' && next !== pin) {
      pin = next
      console.log(`  ${now()} auth.json changed externally → PIN reloaded (all phone sessions invalidated)`)
    }
  } catch (e) {
    console.log(`  ${now()} auth.json watch error: ${e.message}`)
  }
})

// ── Session cookie ─────────────────────────────────────────────────────────
// HMAC-signed with the PIN as the key: changing the PIN revokes every cookie
// already issued (rotation is revocation). HttpOnly, SameSite=Lax, 90 days.
const COOKIE_NAME = 'dsh_tok'
const SESSION_MAXAGE_S = 90 * 24 * 3600
const cookieDigest = (exp) => crypto.createHmac('sha256', pin).update(String(exp)).digest('base64url')
const cookieOk = (cookieHeader) => {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`).exec(cookieHeader ?? '')
  if (!m) return false
  const dot = m[1].indexOf('.')
  if (dot < 0) return false
  const exp = m[1].slice(0, dot)
  const sig = m[1].slice(dot + 1)
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false
  const expect = Buffer.from(cookieDigest(exp))
  const got = Buffer.from(sig)
  return expect.length === got.length && crypto.timingSafeEqual(expect, got)
}
const issueCookie = () => {
  const exp = Date.now() + SESSION_MAXAGE_S * 1000
  return `${COOKIE_NAME}=${exp}.${cookieDigest(exp)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAXAGE_S}`
}
const strEq = (a, b) => {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

// ── CLI ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const arg = (flag, fallback) => {
  const at = argv.indexOf(flag)
  return at === -1 ? fallback : argv[at + 1]
}
const LISTEN = Number(arg('--listen', '3081'))
const TARGET = arg('--target', '127.0.0.1:3080').split(':')
const TARGET_HOST = TARGET[0]
const TARGET_PORT = Number(TARGET[1])

// ── Crypto polyfill for non-secure contexts ───────────────────────────────
// The dsh RPC client mints every request id via crypto.randomUUID, which only
// exists in secure contexts (HTTPS or loopback). Over the plain-HTTP public
// tunnel the page is NOT a secure context, so host.describe (part of the
// connection readiness handshake) throws on mint, the controller aborts its own
// WebSockets, and sessions never load. Inject the standard RFC4122 v4 shim into
// the served index.html so the whole app works over plain HTTP.
const RANDOM_UUID_POLYFILL = '<script>if(typeof crypto!=="undefined"&&typeof crypto.randomUUID!=="function"){try{Object.defineProperty(crypto,"randomUUID",{value:function(){return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){var r=Math.random()*16|0;return(c==="x"?r:(r&0x3|0x8)).toString(16)})},configurable:true,writable:true})}catch(e){}}</script>'

// ── Compression rules ─────────────────────────────────────────────────────
const COMPRESSIBLE = /^text\/|application\/(json|javascript|xml|x-javascript)|image\/svg\+xml/
const ALREADY_BINARY = /^image\/(?!svg)|^audio\/|^video\/|^font\/|^application\/(pdf|octet-stream|wasm)/
const now = () => new Date().toISOString().slice(11, 19)

// Loopback hosts are trusted (the desktop): no PIN needed, plus the admin
// /__setpin page. Everything else (the public NPS host) needs a PIN session.
function isLoopbackHost(req) {
  const h = (req.headers.host ?? '').toLowerCase()
  return h === '127.0.0.1' || h.startsWith('127.0.0.1:') ||
    h === 'localhost' || h.startsWith('localhost:') ||
    h === '[::1]' || h.startsWith('[::1]:')
}

/** Insert the randomUUID shim before the app's first <script> (or </head>). */
function injectRandomUuidPolyfill(html) {
  const text = html.toString('utf8')
  const at = text.indexOf('<script')
  if (at !== -1) return Buffer.from(text.slice(0, at) + RANDOM_UUID_POLYFILL + text.slice(at), 'utf8')
  const head = text.indexOf('</head>')
  if (head !== -1) return Buffer.from(text.slice(0, head) + RANDOM_UUID_POLYFILL + text.slice(head), 'utf8')
  return html
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const PAGE_CSS = `:root{color-scheme:light dark}*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
font-family:system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:#f2f3f5}
.card{width:min(90vw,360px);background:#fff;border-radius:16px;padding:30px 24px 22px;box-shadow:0 8px 30px rgba(0,0,0,.08)}
.brand{font-size:22px;font-weight:700;text-align:center;letter-spacing:.5px}.brand small{display:block;font-size:12px;font-weight:400;color:#8a8f98;margin-top:5px}
form{margin-top:22px;display:grid;gap:12px}
input{width:100%;padding:12px 14px;border:1px solid #d8dce2;border-radius:10px;font-size:16px;background:#fff;color:#111}
input:focus{outline:2px solid #155eef;border-color:transparent}
button{padding:12px;border:0;border-radius:10px;background:#155eef;color:#fff;font-size:16px;font-weight:600;cursor:pointer}
button:active{opacity:.85}
.err{color:#d92d20;font-size:13px;text-align:center;margin-top:10px;min-height:18px}
.hint{font-size:12px;color:#9aa0a6;text-align:center;margin-top:16px;line-height:1.6}
@media (prefers-color-scheme:dark){body{background:#16181d}.card{background:#1f2329}input{background:#16181d;border-color:#2e3440;color:#e8eaed}.brand small,.hint{color:#7a8089}}`

// ── Phone login page (single PIN field) ───────────────────────────────────
// Served for top-level navigations on the public host. Any browser / in-app
// webview renders it — no native Basic-Auth dialog involved anywhere.
const PIN_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>dsh 登录</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="card">
  <div class="brand">dsh<small>DeepSeek 会话工作台</small></div>
  <form method="post" action="/__login" autocomplete="off">
    <input type="password" name="pin" placeholder="输入 PIN 码" inputmode="numeric" autocomplete="one-time-code" required autofocus>
    <button type="submit">登 录</button>
    <div class="err">{ERR}</div>
  </form>
  <div class="hint">PIN 由设备管理员设置</div>
</div>
</body>
</html>`
const pinPage = (err) => PIN_PAGE.replace('{ERR}', err)

// ── Desktop /__setpin page (loopback only) ────────────────────────────────
const setPinPage = (err) => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>dsh 网关 · 设置 PIN</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="card">
  <div class="brand">dsh 网关<small>设置手机访问 PIN</small></div>
  <form method="post" action="/__setpin" autocomplete="off">
    <input type="password" name="current" placeholder="当前 PIN" required>
    <input type="password" name="new" placeholder="新 PIN（4-12 位数字）" inputmode="numeric" autocomplete="new-password" required>
    <input type="password" name="confirm" placeholder="确认新 PIN" inputmode="numeric" autocomplete="new-password" required>
    <button type="submit">保存 PIN</button>
    <div class="err">${err}</div>
  </form>
  <div class="hint">手机访问公网地址时输入此 PIN 即可登录。修改后所有已登录手机立即失效。</div>
</div>
</body>
</html>`

function handleLogin(req, res) {
  let body = ''
  req.on('data', (c) => { if ((body += c).length > 1e6) req.destroy() })
  req.on('end', () => {
    const given = new URLSearchParams(body).get('pin') ?? ''
    if (strEq(given, pin)) {
      console.log(`  ${now()} POST /__login ok`)
      res.writeHead(303, { Location: '/', 'Set-Cookie': issueCookie(), 'Cache-Control': 'no-store' })
      res.end()
    } else {
      console.log(`  ${now()} POST /__login failed`)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(pinPage('<span>PIN 码错误</span>'))
    }
  })
}

// Public + unauthenticated: /__login POST accepts a PIN; a request carrying
// the dsh web launch-token query must reach dsh web (it mints the dsh-auth
// session cookie for this authority — the token IS dsh web's own auth), so
// proxy it through even before the PIN; a top-level GET / gets the PIN login
// page (any Accept); everything else a plain 401 (no dialog).
function handleUnauthorized(req, res) {
  const pathname = (req.url ?? '/').split('?')[0]
  if (pathname === '/__login' && req.method === 'POST') return handleLogin(req, res)
  try {
    const query = new URL(req.url ?? '/', 'http://dsh.invalid').searchParams
    if (query.has('token')) {
      console.log(`  ${now()} ${req.method} ${req.url} → dsh web (launch-token exchange)`)
      return proxy(req, res)
    }
  } catch { /* malformed url → fall through to 401 */ }
  if (pathname === '/' && req.method === 'GET') {
    console.log(`  ${now()} ${req.method} ${req.url} → PIN login page`)
    const page = pinPage('')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(page) })
    res.end(page)
    return
  }
  console.log(`  ${now()} ${req.method} ${req.url} 401`)
  const text = '401 Unauthorized — dsh requires the PIN\n'
  res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(text) })
  res.end(text)
}

function handleSetPin(req, res) {
  // The desktop plugins card posts with Accept: application/json and reads a
  // machine verdict; a plain browser navigation gets the HTML form.
  const wantsJson = /\bapplication\/json\b/i.test(req.headers.accept ?? '')
  if (req.method !== 'POST') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(setPinPage(''))
    return
  }
  let body = ''
  req.on('data', (c) => { if ((body += c).length > 1e6) req.destroy() })
  req.on('end', () => {
    const p = new URLSearchParams(body)
    const cur = p.get('current') ?? ''
    const np = p.get('new') ?? ''
    const okCur = strEq(cur, pin)
    const okLen = /^\d{4,12}$/.test(np)
    const okMatch = np === (p.get('confirm') ?? '')
    if (okCur && okLen && okMatch) {
      pin = np
      try {
        const tmp = AUTH_FILE + '.tmp'
        writeFileSync(tmp, JSON.stringify({ pin: np }, null, 2) + '\n')
        renameSync(tmp, AUTH_FILE)
        console.log(`  ${now()} POST /__setpin → PIN updated (all phone sessions invalidated)`)
      } catch (e) {
        console.log(`  ${now()} /__setpin write failed: ${e.message}`)
      }
      if (wantsJson) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify({ ok: true }))
      } else {
        res.writeHead(303, { Location: '/__setpin' })
        res.end()
      }
      return
    }
    const err = !okCur ? '当前 PIN 不正确' : !okLen ? '新 PIN 需为 4-12 位数字' : '两次输入的新 PIN 不一致'
    if (wantsJson) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ ok: false, error: err }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(setPinPage(`<span>${err}</span>`))
  })
}

// Hop-by-hop headers are for the browser↔gateway hop only; never forward them.
const HOP = /^(connection|keep-alive|proxy-connection|proxy-authenticate|proxy-authorization|te|trailer|transfer-encoding|upgrade|authorization)$/i
function forwardHeaders(headers) {
  const out = {}
  for (const [k, v] of Object.entries(headers)) {
    if (!HOP.test(k)) out[k] = v
  }
  return out
}

// ── HTTP ──────────────────────────────────────────────────────────────────
function proxy(req, res) {
  const upstream = http.request(
    // Ask dsh web for identity (uncompressed): the client's own Accept-Encoding
    // would otherwise make dsh web compress AND the gateway compress again
    // (double-gzip → browsers show raw gzip bytes). The gateway owns the only
    // compression hop.
    { host: TARGET_HOST, port: TARGET_PORT, method: req.method, path: req.url, headers: { ...forwardHeaders(req.headers), 'accept-encoding': 'identity' } },
    (up) => {
      const status = up.statusCode ?? 502
      const type = up.headers['content-type'] ?? ''
      const enc = up.headers['content-encoding'] ?? ''
      const accept = req.headers['accept-encoding'] ?? ''
      const wantGz = /\bgzip\b/i.test(accept)

      // Buffer the (small, static/text) body, re-send with a real Content-Length
      // so the client sees exactly what it pays for. Compress with gzip ONLY when
      // the client asked for it (gzip is universally supported; brotli produced
      // streams some clients could not decode).
      const chunks = []
      up.on('data', (c) => chunks.push(c))
      up.on('end', () => {
        const raw = Buffer.concat(chunks)
        // The public HTTP page is a non-secure context: inject the
        // crypto.randomUUID shim into the app's own HTML shell before compressing.
        const isHtmlShell = type.startsWith('text/html') && req.url.split('?')[0] === '/'
        const body = isHtmlShell ? injectRandomUuidPolyfill(raw) : raw
        const headers = { ...up.headers }
        delete headers['content-length']
        // The upstream is decompressed (or chunked) before we re-encode: a
        // leftover transfer-encoding alongside our content-length is an HTTP
        // framing violation strict parsers (undici) refuse.
        delete headers['transfer-encoding']
        delete headers['content-encoding']
        if (wantGz) {
          const zip = zlib.gzipSync(body, { level: 6 })
          headers['content-encoding'] = 'gzip'
          headers['vary'] = (headers['vary'] ? `${headers['vary']}, ` : '') + 'Accept-Encoding'
          headers['content-length'] = zip.length
          res.writeHead(status, headers)
          res.end(zip)
          console.log(`  ${now()} ${req.method} ${req.url} ${status} ${body.length}B → gzip ${zip.length}B (${Math.round((1 - zip.length / body.length) * 100)}% saved)${isHtmlShell ? ' +uuid-polyfill' : ''}`)
        } else {
          headers['content-length'] = body.length
          res.writeHead(status, headers)
          res.end(body)
          console.log(`  ${now()} ${req.method} ${req.url} ${status} ${body.length}B (uncompressed)${isHtmlShell ? ' +uuid-polyfill' : ''}`)
        }
      })
      up.on('error', () => res.destroy())
    },
  )
  upstream.on('error', () => {
    res.writeHead(502)
    res.end()
  })
  req.on('error', () => upstream.destroy())
  req.pipe(upstream)
}

const server = http.createServer((req, res) => {
  // Desktop (loopback): trusted — admin page to set the PIN, else straight through.
  if (isLoopbackHost(req)) {
    if ((req.url ?? '/').split('?')[0] === '/__setpin') return handleSetPin(req, res)
    return proxy(req, res)
  }
  // Public host: PIN session required.
  if (!cookieOk(req.headers.cookie)) return handleUnauthorized(req, res)
  return proxy(req, res)
})

// ── WebSocket upgrade ─────────────────────────────────────────────────────
// The two dsh event streams (events.mux / events.host) come over a WS upgrade.
// NPS TCP tunnels forward the raw bytes, so the gateway must re-check the PIN
// session cookie on the handshake and then relay the socket verbatim.
server.on('upgrade', (req, socket, head) => {
  if (!isLoopbackHost(req) && !cookieOk(req.headers.cookie)) {
    console.log(`  ${now()} WS ${req.url} 401 (no/invalid PIN session)`)
    socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
    return
  }
  const upstream = net.connect(TARGET_PORT, TARGET_HOST, () => {
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`)
    const rh = req.rawHeaders
    for (let i = 0; i < rh.length; i += 2) upstream.write(`${rh[i]}: ${rh[i + 1]}\r\n`)
    upstream.write('\r\n')
    if (head && head.length) upstream.write(head)
    console.log(`  ${now()} WS ${req.url} → dsh (head ${head?.length ?? 0}B)`)
  })
  let c2u = 0, u2c = 0
  upstream.on('data', (d) => { u2c += d.length })
  socket.on('data', (d) => { c2u += d.length })
  socket.on('error', () => upstream.destroy())
  upstream.on('error', () => socket.destroy())
  const done = () => console.log(`  ${now()} WS ${req.url} socket closed (c2u ${c2u}B u2c ${u2c}B)`)
  socket.on('close', done)
  upstream.on('close', done)
  socket.pipe(upstream)
  upstream.pipe(socket)
})

server.listen(LISTEN, '127.0.0.1', () => {
  console.log(`[dsh-gateway] http://127.0.0.1:${LISTEN} → http://${TARGET_HOST}:${TARGET_PORT}`)
  console.log(`[dsh-gateway] set/change the phone PIN at http://127.0.0.1:${LISTEN}/__setpin`)
  console.log('[dsh-gateway] point the NPS tunnel target_addr at this port.')
})
