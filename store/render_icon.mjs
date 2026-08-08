#!/usr/bin/env node
/**
 * render_icon.mjs — render frames/icon-128.html to a 128x128 PNG *with* an
 * alpha channel.
 *
 * Why this exists rather than another entry in frames/manifest.json: the
 * skill's render.mjs screenshots without `omitBackground`, so every pixel it
 * produces is opaque. That is exactly right for the five screenshots — the
 * store wants them flattened and full bleed — and exactly wrong for the store
 * icon, which is specified as 96x96 of artwork inside a 128x128 canvas with
 * 16px of *transparent* padding on each side.
 *
 * Everything else matches render.mjs: supersample at 4x, resample once with
 * Lanczos, then assert the file really is 128x128 before anyone uploads it.
 *
 *   node store/render_icon.mjs
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = path.join(here, 'frames', 'icon-128.html')
const out = path.resolve(process.argv[2] ?? path.join(here, 'build', 'store-icon-128.png'))
const SIZE = 128
const SUPERSAMPLE = 4

const require_ = createRequire(path.join(process.cwd(), '__resolve__.js'))
let chromium
for (const id of ['playwright', '@playwright/test', 'playwright-core']) {
  try {
    const spec = require_.resolve(id)
    const mod = await import(pathToFileURL(spec).href)
    chromium = mod.chromium ?? mod.default?.chromium
    if (chromium) break
  } catch {
    /* try the next one */
  }
}
if (!chromium) {
  console.error('render_icon: Playwright is required (npm i -D playwright).')
  process.exit(1)
}

fs.mkdirSync(path.dirname(out), { recursive: true })

let browser
for (const options of [{ channel: 'chromium' }, {}, { channel: 'chrome' }]) {
  try {
    browser = await chromium.launch(options)
    break
  } catch {
    /* next */
  }
}
if (!browser) {
  console.error('render_icon: could not launch a browser. Try: npx playwright install chromium')
  process.exit(1)
}

const big = SIZE * SUPERSAMPLE
const page = await browser.newPage({
  viewport: { width: SIZE, height: SIZE },
  deviceScaleFactor: SUPERSAMPLE,
})
await page.goto(pathToFileURL(src).href, { waitUntil: 'load' })
const buf = await page.locator('.icon').screenshot({ type: 'png', omitBackground: true })
await browser.close()

const tmp = path.join(os.tmpdir(), `cws-icon-${process.pid}.png`)
fs.writeFileSync(tmp, buf)
const r = spawnSync(
  'convert',
  [tmp, '-filter', 'Lanczos', '-resize', `${SIZE}x${SIZE}!`, '-strip', 'PNG32:' + out],
  { stdio: 'inherit' },
)
fs.rmSync(tmp, { force: true })
if (r.status !== 0) {
  console.error('render_icon: ImageMagick resize failed')
  process.exit(1)
}

const probe = spawnSync('identify', ['-format', '%wx%h %[channels]', out], { encoding: 'utf8' })
const [dims, channels] = probe.stdout.trim().split(' ')
if (dims !== `${SIZE}x${SIZE}`) {
  console.error(`render_icon: ${out} came out ${dims}, expected ${SIZE}x${SIZE}`)
  process.exit(1)
}
console.log(`✓ ${out}  ${dims}  ${channels}  (supersampled ${big}x${big})`)
