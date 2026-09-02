// Patch a deepseek-harness checkout to accept the ui-mobile overlay, mirroring
// INSTALL.md §1-2. Robust against shell quoting (use from any shell; no inline
// -e). Lenient: a missing tsconfig anchor warns and continues — the overlay
// still builds as a workspace member via tsdown's own package globs.
//
// Usage: node compat-patch.mjs <harnessDir> <overlayDir>

import { cpSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [harness, overlay] = process.argv.slice(2)
if (!harness || !overlay) {
  console.error('usage: node compat-patch.mjs <harnessDir> <overlayDir>')
  process.exit(2)
}

// 1. Copy the overlay package into the harness workspace.
const src = join(overlay, 'ui-mobile')
const dst = join(harness, 'packages/client/ui-mobile')
if (!existsSync(src)) {
  console.error(`overlay ui-mobile not found at ${src}`)
  process.exit(3)
}
mkdirSync(join(harness, 'packages/client'), { recursive: true })
cpSync(src, dst, { recursive: true })
console.log(`copied ui-mobile -> ${dst}`)

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
