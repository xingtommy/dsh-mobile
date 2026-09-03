// Patch a deepseek-harness checkout to accept the ui-mobile overlay, mirroring
// INSTALL.md §1-2. Robust against shell quoting (use from any shell; no inline
// -e). Lenient: a missing tsconfig anchor warns and continues — the overlay
// still builds as a workspace member via tsdown's own package globs.
//
// The overlay line is chosen by the harness version: the alpha.3 client layer
// (which removed @deepseek-ai/dsh-client-runtime and split the client model)
// begins at 0.1.2, so a harness at >= 0.1.2 pulls ui-mobile-v2 and an older
// harness (0.1.1 / rc.2) pulls ui-mobile-v1.
//
// Usage: node compat-patch.mjs <harnessDir> <overlayDir>

import { cpSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [harness, overlay] = process.argv.slice(2)
if (!harness || !overlay) {
  console.error('usage: node compat-patch.mjs <harnessDir> <overlayDir>')
  process.exit(2)
}

/** Read the harness's own version from its root package.json (the dsh-root package). */
function harnessVersion(harnessDir) {
  try {
    const pkg = JSON.parse(readFileSync(join(harnessDir, 'package.json'), 'utf8'))
    return pkg.version ?? '0'
  } catch {
    return '0'
  }
}

/** Numeric [major, minor, patch] tuple from a semantic-ish version string. */
function versionTuple(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version ?? '')
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [0, 0, 0]
}

/** Whether tuple `a` is >= tuple `b`. */
function gte(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true
    if (a[i] < b[i]) return false
  }
  return true
}

const V2_MIN = [0, 1, 2]
const version = harnessVersion(harness)
const variant = gte(versionTuple(version), V2_MIN) ? 'ui-mobile-v2' : 'ui-mobile-v1'
console.log(`harness version ${version} -> selecting ${variant}`)

// 1. Copy the selected overlay package into the harness workspace.
const src = join(overlay, variant)
const dst = join(harness, 'packages/client/ui-mobile')
if (!existsSync(src)) {
  console.error(`overlay ${variant} not found at ${src}`)
  process.exit(3)
}
mkdirSync(join(harness, 'packages/client'), { recursive: true })
cpSync(src, dst, { recursive: true })
console.log(`copied ${variant} -> ${dst}`)

// 2. Add the ui-mobile project reference to the client typecheck aggregate (JSONC).
const tsPath = join(harness, 'tsconfig.client.json')
let ts = readFileSync(tsPath, 'utf8')
if (!ts.includes('./packages/client/ui-mobile')) {
  const anchor = '{ "path": "./packages/client/ui-message-feedback" },'
  if (ts.includes(anchor)) {
    ts = ts.replace(anchor, `${anchor}\n    { "path": "./packages/client/ui-mobile" },`)
    writeFileSync(tsPath, ts)
    console.log('added ui-mobile to tsconfig.client.json references')
  } else {
    console.warn(`tsconfig anchor "${anchor}" not found; skipping reference (build still picks the package up)`)
  }
}

// 3. Declare the overlay as a web-app bundle dependency (plain JSON).
const wpPath = join(harness, 'packages/bundle/web-app/package.json')
const wp = JSON.parse(readFileSync(wpPath, 'utf8'))
wp.dependencies['@deepseek-ai/dsh-client-ui-mobile'] = 'workspace:^'
writeFileSync(wpPath, JSON.stringify(wp, null, 2) + '\n')
console.log('declared dsh-client-ui-mobile in web-app bundle dependencies')

console.log('overlay patched into', harness)
