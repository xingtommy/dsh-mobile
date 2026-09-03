// Standalone end-to-end check for the dsh mobile UI plugin against the LIVE
// `dsh web` server. Not part of the repo's vitest suite: it drives the real
// booted server at 127.0.0.1:3080 through desktop and mobile viewports and
// asserts the mobile shell shadows the frame only on small screens.
//
// Usage: node e2e/mobile.mjs   (expects `dsh web` already running on :3080)
import { createRequire } from 'node:module'
// Resolve playwright through the repo's apps/web install so this script runs
// from anywhere inside the checkout without its own dependency tree.
const require = createRequire(new URL('../../../../apps/web/package.json', import.meta.url))
const { chromium } = require('playwright')

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
// DSH_GATEWAY=1 exercises the dsh-gateway reverse proxy (auth + compression)
// in front of dsh instead of hitting the server directly.
const GATEWAY = process.env.DSH_GATEWAY === '1'
// DSH_BASE overrides the target entirely (e.g. the public NPS URL).
const BASE = process.env.DSH_BASE || (GATEWAY ? 'http://127.0.0.1:3081' : 'http://127.0.0.1:3080')
const CRED = GATEWAY
  ? { username: process.env.DSH_GATEWAY_USER ?? 'dsh', password: process.env.DSH_GATEWAY_PASS ?? '' }
  : undefined
const newPage = (opts) => browser.newPage({ ...opts, httpCredentials: CRED })

/** Failures collected across the run. */
const failures = []
const ok = (name, detail = '') => console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`)
const bad = (name, detail = '') => {
  failures.push(name)
  console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
}
const assert = (cond, name, detail) => (cond ? ok(name, detail) : bad(name, detail))

function launchBrowser() {
  if (process.env.DSH_PLAYWRIGHT_EXECUTABLE_PATH) {
    return chromium.launch({ executablePath: process.env.DSH_PLAYWRIGHT_EXECUTABLE_PATH })
  }
  return chromium.launch({ channel: 'msedge' })
    .catch(() => chromium.launch({ executablePath: EDGE }))
}

/** Collect page errors + console errors into `seen`; return a summary. */
function tripwire(page, seen) {
  page.on('pageerror', e => seen.push(`pageerror: ${e.message}`))
  page.on('console', msg => {
    if (msg.type() === 'error') seen.push(`console.error: ${msg.text().slice(0, 240)}`)
  })
}

/** Wait until location.hash equals/contains a target (e.g. '#/mobile'). */
async function waitForHash(page, target, ms = 15000) {
  await page.waitForFunction(h => window.location.hash.startsWith(h), target, { timeout: ms })
}

const seen = []
const browser = await launchBrowser()
try {
  // ── 1. Desktop viewport: the frame must stay, the mobile shell must NOT fire ──
  console.log('\n[desktop 1440×900]')
  const d = await newPage({ viewport: { width: 1440, height: 900 } })
  tripwire(d, seen)
  await d.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  // The desktop frame restores sessions from disk; wait for its real chrome
  // (workspace/session list) rather than a fixed timeout.
  await d.waitForFunction(() => document.body.innerText.includes('工作区'), undefined, { timeout: 20000 })
  await d.waitForTimeout(500)
  const dUrl = d.url()
  const dMobileHash = dUrl.includes('#/mobile')
  const dBrand = await d.evaluate(() => document.body.innerText.includes('移动端任务中心'))
  const dText = await d.evaluate(() => document.body.innerText)
  const dTextLen = dText.length
  assert(!dMobileHash, 'desktop did not redirect to #/mobile', dUrl)
  assert(!dBrand, 'desktop did not render the mobile brand', dBrand ? 'brand text present' : '')
  assert(dText.includes('工作区') && dText.includes('新会话') && dText.includes('设置'),
    'desktop three-column frame rendered', `${dTextLen} chars`)
  assert(!seen.some(s => s.includes('ui-mobile') || s.includes('MobileShell')), 'desktop console clean of mobile-shell errors',
    seen.filter(s => /ui-mobile|MobileShell|slots/i.test(s)).slice(0, 3).join(' | ') || 'none')
  await d.close()

  // ── 2. Mobile 375×667: normalize to #/mobile, Home renders ──
  console.log('\n[mobile 375×667]')
  const m = await newPage({ viewport: { width: 375, height: 667 } })
  tripwire(m, seen)
  await m.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await waitForHash(m, '#/mobile')
  ok('normalized to #/mobile', m.url())
  await m.waitForTimeout(800)

  const bodyText = await m.evaluate(() => document.body.innerText)
  assert(bodyText.includes('DeepSeek'), 'home shows the brand', '')
  assert(bodyText.includes('移动端任务中心'), 'home subtitle (mobile locale active)', '')
  assert(bodyText.includes('会话'), 'sessions section heading', '')

  const hasSessions = await m.evaluate(() => !!document.querySelector('[aria-label="新建会话"]') ||
    document.body.innerText.includes('暂无会话'))
  assert(hasSessions, 'new-session entry present (FAB or empty-state)', '')

  // Gateway mode: prove the proxy actually compressed the bundles (transferSize
  // = bytes on the wire, decodedBodySize = uncompressed; compressed ⇒ <).
  if (GATEWAY) {
    const ratio = await m.evaluate(() => {
      const js = performance.getEntriesByType('resource').filter(r => r.initiatorType === 'script' && r.decodedBodySize > 0)
      const saved = js.reduce((a, r) => a + (r.decodedBodySize - r.transferSize), 0)
      const total = js.reduce((a, r) => a + r.decodedBodySize, 0)
      return { n: js.length, saved, total, pct: total ? Math.round((saved / total) * 100) : 0 }
    })
    assert(ratio.total > 0 && ratio.saved > 0, 'gateway compressed the script bundles',
      `${ratio.n} bundles, ${ratio.saved}/${ratio.total}B saved (${ratio.pct}%)`)
  }

  // Settings round-trip.
  const gear = m.getByRole('button', { name: '设置' })
  assert(await gear.count() > 0, 'settings gear button present', '')
  await gear.first().click()
  await waitForHash(m, '#/mobile/settings')
  await m.waitForTimeout(500)
  const setText = await m.evaluate(() => document.body.innerText)
  assert(setText.includes('主题') && setText.includes('语言'), 'settings page renders theme + language', '')
  const backBtn = m.getByRole('button', { name: '返回' })
  assert(await backBtn.count() > 0, 'settings back button present', '')
  await backBtn.first().click()
  await waitForHash(m, '#/mobile')
  await m.waitForTimeout(400)
  assert((await m.evaluate(() => document.body.innerText)).includes('DeepSeek'), 'back returned to home', '')

  // Session round-trip: wait for the list (sessions restore from disk like the
  // desktop frame does), then walk chat → details → back → home.
  const sessionRow = m.locator('button').filter({ hasText: /天|小时|分钟|秒/ })
  try {
    await sessionRow.first().waitFor({ state: 'visible', timeout: 20000 })
  } catch {
    console.log('  ...no session appeared within 20s (skipping chat flow)')
  }
  if (await sessionRow.count() > 0) {
    console.log('  ...session row found, exercising chat → details → back → home')
    await sessionRow.first().click()
    await m.waitForFunction(() => /#\/mobile\/chat\//.test(window.location.hash), undefined, { timeout: 15000 })
    // On a slow public link the chat page's bundle + session snapshot can take a
    // few seconds to arrive; wait for the composer instead of a fixed sleep.
    await m.waitForFunction(() => {
      const send = [...document.querySelectorAll('button')].find(b => b.innerText.includes('发送'))
      return !!send || document.body.innerText.includes('输入消息')
    }, undefined, { timeout: 30000 })
    const chatText = await m.evaluate(() => document.body.innerText)
    assert(await m.getByRole('button', { name: '返回' }).count() > 0, 'chat has back button', '')
    assert(await m.getByRole('button', { name: '详情' }).count() > 0, 'chat has details entry', '')
    assert((await m.getByRole('button', { name: '发送' }).count()) > 0 || chatText.includes('输入消息'), 'chat composer present', '')
    await m.getByRole('button', { name: '详情' }).first().click()
    await m.waitForFunction(() => /\/details$/.test(window.location.hash), undefined, { timeout: 15000 })
    await m.waitForTimeout(500)
    assert((await m.evaluate(() => document.body.innerText)).includes('任务详情'), 'details page renders', '')
    await m.getByRole('button', { name: '返回' }).first().click()
    await waitForHash(m, '#/mobile/chat')
    ok('details → back to chat', '')
    await m.getByRole('button', { name: '返回' }).first().click()
    await waitForHash(m, '#/mobile')
    assert((await m.evaluate(() => document.body.innerText)).includes('DeepSeek'), 'chat → back to home', '')
  } else {
    console.log('  ...no sessions to exercise chat flow (empty list is the expected fresh state)')
  }

  // ── 3. New Session: tapping + must give feedback and land on a fresh chat ──
  console.log('  ...tapping the New Session FAB (create flow)')
  const fab = m.getByRole('button', { name: '新建会话' })
  // Wait until the workspace baseline is ready so startSession has a target.
  await m.waitForFunction(() => {
    const fabEl = document.querySelector('button[aria-label="新建会话"]')
    return fabEl !== null && !fabEl.disabled
  }, undefined, { timeout: 20000 })
  await fab.first().click()
  await m.waitForFunction(() => /#\/mobile\/chat\//.test(window.location.hash), undefined, { timeout: 30000 })
  assert(/^session-[0-9a-f-]+$/i.test(new URL(m.url()).hash.split('/').pop() ?? ''), 'create landed on a fresh chat route', m.url())
  // The fresh chat page renders on a slow link too — wait for its chrome.
  await m.waitForFunction(() =>
    [...document.querySelectorAll('button')].some(b => b.innerText.includes('发送') || b.innerText.includes('返回')),
    undefined, { timeout: 30000 })
  assert(await m.getByRole('button', { name: '返回' }).count() > 0, 'fresh chat has back button', '')
  await m.close()

  // ── 3. Summary ──
  const realErrors = seen.filter(s => !/net::|favicon|DevTools listening/i.test(s))
  console.log(`\n[summary] console/page errors: ${realErrors.length}`)
  for (const e of realErrors.slice(0, 10)) console.log('   · ' + e)
  if (failures.length) {
    console.log(`\nFAILED: ${failures.length} assertion(s):\n - ` + failures.join('\n - '))
    process.exit(1)
  }
  console.log('\nALL CHECKS PASSED')
} finally {
  await browser.close().catch(() => {})
}
