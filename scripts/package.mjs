/**
 * Build the Chrome Web Store upload artifact — and build the same bytes every time.
 *
 * Determinism is not housekeeping here. Each release publishes a SHA-256 alongside a
 * build provenance attestation, so anyone can check that the zip attached to the release
 * is the one the workflow built from that commit. Both claims are worth less if two
 * builds of one commit disagree, so every source of entropy a zip normally carries is
 * pinned: entries are sorted, every timestamp is the zip epoch, and TZ is fixed because
 * Info-ZIP converts mtimes through localtime on the way in. Same inputs and same
 * toolchain, same bytes.
 *
 * Run it after `pnpm build`, or just use `pnpm package`.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digestTree } from './verify-install.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

/** DOS timestamps in the zip format cannot express anything earlier than this. */
const ZIP_EPOCH = new Date('1980-01-01T00:00:00Z')

/** If any of these is missing the extension is broken in a way the store will not catch. */
const REQUIRED = [
  'manifest.json',
  'background.js',
  'options.html',
  'blocked.html',
  'icons/16.png',
  'icons/32.png',
  'icons/48.png',
  'icons/128.png',
]

function fail(message) {
  console.error(`package failed: ${message}`)
  process.exit(1)
}

function walk(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...walk(full))
    else if (entry.isFile()) found.push(full)
  }
  return found
}

if (!existsSync(dist)) fail('dist/ does not exist — run `pnpm build` first')

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'))

if (manifest.version !== version) {
  fail(`dist/manifest.json is version ${manifest.version}, package.json is ${version}`)
}

// scripts/inject-test-key.mjs writes a `key` for the E2E suite. Shipping it would pin the
// published extension to the test ID, orphaning every existing install.
if ('key' in manifest) {
  fail('dist/manifest.json carries a `key` — this is an E2E build, rebuild with `pnpm build`')
}

const files = walk(dist)
  .map((absolute) => relative(dist, absolute).split(sep).join('/'))
  .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))

const missing = REQUIRED.filter((name) => !files.includes(name))
if (missing.length > 0) fail(`dist/ is missing ${missing.join(', ')}`)

for (const name of files) utimesSync(join(dist, name), ZIP_EPOCH, ZIP_EPOCH)

const zipName = `website-blocker-${version}.zip`
const zipPath = join(root, zipName)
rmSync(zipPath, { force: true }) // zip appends to an existing archive rather than replacing it

// -X drops uid/gid and extended timestamps; -@ takes the sorted file list on stdin, which
// fixes entry order; TZ=UTC fixes how the pinned mtimes are encoded.
execFileSync('zip', ['-X', '-9', '-q', '-@', zipPath], {
  cwd: dist,
  input: `${files.join('\n')}\n`,
  env: { ...process.env, TZ: 'UTC' },
})

const digest = createHash('sha256').update(readFileSync(zipPath)).digest('hex')
writeFileSync(`${zipPath}.sha256`, `${digest}  ${zipName}\n`) // `sha256sum -c` format

// The digest above identifies the upload. It cannot identify the install: the Web Store
// repacks the zip into a CRX signed with Google's key, so those bytes never match again.
// The tree digest hashes the payload instead of the container, which is what survives the
// repack — and is therefore the number someone can regenerate from their own Chrome
// profile to prove the store is serving this build. See scripts/verify-install.mjs.
const { digest: tree } = digestTree(dist)

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${version}\nzip=${zipName}\nsha256=${digest}\ntree=${tree}\n`,
  )
}

console.log(`${zipName}  (${files.length} files)`)
console.log(`sha256  ${digest}`)
console.log(`tree    ${tree}`)
