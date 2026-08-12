/**
 * Prove that the package the Chrome Web Store is serving is the build published here.
 *
 * Two obvious approaches both fail, and it is worth knowing why before trusting this one.
 *
 * You cannot compare the released zip to the installed CRX: Google repacks every upload,
 * signing it with its own key, so the container bytes differ by construction.
 *
 * You cannot compare the released zip to the unpacked files on disk either — which is the
 * mistake that looks like it works. Chrome's unpacker *rewrites* files as it installs
 * them. It re-serialises `manifest.json` and injects the `key` field derived from the CRX
 * header; it decodes and re-encodes every manifest-referenced image through its own PNG
 * encoder; it re-serialises every `_locales` messages file. Measured against a real store
 * install of a 88-file extension, 61 files differed from what was uploaded. For this
 * extension it would be `manifest.json` plus all four icons, every time — and
 * `scripts/package.mjs` explicitly refuses to ship a `key`, so the manifest can never
 * match. A checker built that way reports tampering on every honest install.
 *
 * What does work is Google's own record. Chrome stores `_metadata/verified_contents.json`
 * next to every store-installed extension: a Google-signed manifest of the hash of each
 * file **as uploaded**, before any local rewriting. Comparing the release zip against that
 * answers exactly the right question — *is the package Google received the one published
 * here?* — and it is unaffected by whatever Chrome did to the files afterwards.
 *
 * The hashes are Chrome's "treehash": each file split into 4096-byte blocks, each block
 * SHA-256'd, then those hashes combined up a Merkle tree with a branch factor of
 * blockSize/32 = 128, base64url-encoded without padding. `treeHash()` below implements it,
 * and `--verify-self` checks that implementation against an install on this machine.
 *
 * Usage:
 *
 *     node scripts/verify-install.mjs --zip website-blocker-1.0.0.zip --installed <dir>
 *     node scripts/verify-install.mjs --zip website-blocker-1.0.0.zip      # digest only
 *     node scripts/verify-install.mjs --installed <dir>                    # digest only
 *     node scripts/verify-install.mjs --verify-self --installed <any-store-extension>
 *
 * With both inputs it names every file that differs and exits non-zero on any mismatch.
 * docs/RELEASING.md has the per-platform paths and the trust boundary.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Chrome's treehash parameters. Both are also stated in verified_contents.json itself. */
const BLOCK_SIZE = 4096
const BRANCH_FACTOR = BLOCK_SIZE / 32 // 32 = SHA-256 digest length

const sha256 = (buffer) => createHash('sha256').update(buffer).digest()
const b64url = (buffer) => buffer.toString('base64url')

function fail(message) {
  console.error(`verify-install failed: ${message}`)
  process.exit(1)
}

/**
 * Chrome's treehash root for a file's bytes, base64url without padding.
 *
 * An empty file still has one leaf — the hash of zero bytes — which is why the `||` is
 * there rather than an early return of the empty string.
 */
export function treeHash(data) {
  let level = []
  for (let i = 0; i < data.length; i += BLOCK_SIZE)
    level.push(sha256(data.subarray(i, i + BLOCK_SIZE)))
  if (level.length === 0) level = [sha256(Buffer.alloc(0))]

  while (level.length > 1) {
    const next = []
    for (let i = 0; i < level.length; i += BRANCH_FACTOR) {
      const group = level.slice(i, i + BRANCH_FACTOR)
      // A lone node is promoted unchanged rather than hashed again — matching Chrome.
      next.push(group.length === 1 ? group[0] : sha256(Buffer.concat(group)))
    }
    level = next
  }
  return b64url(level[0])
}

/**
 * One number standing for a whole set of (path, hash) pairs, so a release page can publish
 * a single line.
 *
 * The path is JSON-encoded rather than written raw. Delimiting with a bare separator and a
 * newline looks fine until a filename contains a newline, at which point one crafted entry
 * can impersonate two real ones and a file can be deleted without changing the digest.
 * JSON escaping makes every line unambiguous.
 */
export function contentDigest(hashesByPath) {
  const listing = [...hashesByPath.keys()]
    .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
    .map((path) => `${hashesByPath.get(path)}  ${JSON.stringify(path)}\n`)
    .join('')
  return createHash('sha256').update(listing, 'utf8').digest('hex')
}

/** Every file under `dir`, `/`-separated, with anything that is not a regular file flagged. */
function walk(dir) {
  const files = []
  const irregular = []
  const recurse = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      const rel = relative(dir, full).split(sep).join('/')
      if (entry.isDirectory()) recurse(full)
      else if (entry.isFile()) files.push(rel)
      // Symlinks, sockets and devices are neither followed nor ignored. Ignoring them is
      // how an extra file sneaks past a comparison that then reports a clean match.
      else irregular.push(rel)
    }
  }
  recurse(dir)
  return { files, irregular }
}

/**
 * Treehash every file in a directory. `scripts/package.mjs` uses this on `dist/` so the
 * digest published on the release page is produced by the same code that checks it.
 */
export function hashDirectory(dir) {
  const { files, irregular } = walk(dir)
  if (irregular.length > 0) fail(`${dir} contains non-regular entries: ${irregular.join(', ')}`)
  if (files.length === 0) fail(`${dir} contains no files`)
  return new Map(files.map((path) => [path, treeHash(readFileSync(join(dir, path)))]))
}

/** Unpack to a temp dir rather than parsing the container: `unzip` already reads zips. */
function hashesFromZip(zipPath) {
  if (!existsSync(zipPath)) fail(`${zipPath} does not exist`)
  const scratch = mkdtempSync(join(tmpdir(), 'verify-install-'))
  try {
    try {
      execFileSync('unzip', ['-q', '-o', zipPath, '-d', scratch], {
        stdio: ['ignore', 'ignore', 'pipe'],
      })
    } catch (error) {
      if (error?.code === 'ENOENT') fail('`unzip` is not installed')
      fail(`could not unpack ${zipPath}: ${String(error.stderr ?? error.message).trim()}`)
    }
    return hashDirectory(scratch)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/**
 * Google's signed record of what was uploaded, as Chrome stored it beside the install.
 *
 * The signature over this payload is not checked here — that would need Google's key, and
 * Chrome already refuses to run an extension whose files disagree with it. The trust
 * boundary is therefore "this file as Chrome wrote it", which docs/RELEASING.md states.
 */
function hashesFromInstall(dir) {
  const path = join(dir, '_metadata', 'verified_contents.json')
  if (!existsSync(path)) {
    fail(
      `${path} does not exist — only extensions installed from the Chrome Web Store carry ` +
        'one. An unpacked or developer-mode install cannot be checked this way.',
    )
  }
  let payload
  try {
    const outer = JSON.parse(readFileSync(path, 'utf8'))
    const encoded = outer?.[0]?.signed_content?.payload
    if (typeof encoded !== 'string') throw new Error('no signed_content.payload')
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch (error) {
    fail(`could not read ${path}: ${error.message}`)
  }

  const hashes = payload?.content_hashes?.[0]
  if (hashes?.format !== 'treehash') fail(`unexpected hash format ${hashes?.format} in ${path}`)
  if (hashes.block_size !== BLOCK_SIZE) {
    fail(`${path} uses block size ${hashes.block_size}; this script implements ${BLOCK_SIZE}`)
  }
  return {
    version: payload.item_version,
    itemId: payload.item_id,
    hashes: new Map(hashes.files.map((file) => [file.path, file.root_hash])),
  }
}

function report(label, digest, count, extra = '') {
  console.log(`${label.padEnd(10)} ${digest}  (${count} files${extra})`)
}

// argv[1] is undefined under `node -e` and in some loaders, and pathToFileURL throws on
// undefined — which would crash package.mjs's import rather than skipping the CLI.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()

function main() {
  const options = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--verify-self') {
      options.verifySelf = true
      continue
    }
    if (flag !== '--zip' && flag !== '--installed') fail(`unknown argument "${flag}"`)
    const name = flag.slice(2)
    if (options[name] !== undefined) fail(`${flag} given more than once`)
    const value = argv[++i]
    if (value === undefined || value.startsWith('--')) fail(`${flag} needs a path`)
    options[name] = value
  }

  if (!options.zip && !options.installed) {
    console.error(
      'usage: node scripts/verify-install.mjs [--zip <file>] [--installed <dir>] [--verify-self]',
    )
    process.exit(1)
  }

  if (options.installed) {
    if (!existsSync(options.installed)) fail(`${options.installed} does not exist`)
    if (!statSync(options.installed).isDirectory()) {
      fail(`${options.installed} is not a directory — point at the unpacked extension, not the CRX`)
    }
  }

  // Self-check: recompute the signed hashes from files Chrome demonstrably did not rewrite.
  // If none of them match, this script's treehash is wrong and every other result is noise.
  if (options.verifySelf) {
    if (!options.installed) fail('--verify-self needs --installed <any store-installed extension>')
    const { hashes } = hashesFromInstall(options.installed)
    let agree = 0
    let rewritten = 0
    for (const [path, expected] of hashes) {
      const file = join(options.installed, path)
      if (!existsSync(file)) continue
      if (treeHash(readFileSync(file)) === expected) agree++
      else rewritten++
    }
    console.log(
      `treehash self-check: ${agree} of ${hashes.size} on-disk files reproduce the signed hash`,
    )
    console.log(
      `${rewritten} differ, which is expected — Chrome rewrites manifest.json, images and locale files`,
    )
    if (agree === 0)
      fail('no file reproduced its signed hash — the treehash implementation is wrong')
    return
  }

  const released = options.zip ? hashesFromZip(options.zip) : undefined
  const install = options.installed ? hashesFromInstall(options.installed) : undefined

  if (released) report('released', contentDigest(released), released.size, `, from ${options.zip}`)
  if (install) {
    report(
      'store',
      contentDigest(install.hashes),
      install.hashes.size,
      `, signed for v${install.version}`,
    )
  }

  if (!released || !install) return

  const differences = []
  for (const [path, hash] of released) {
    const other = install.hashes.get(path)
    if (other === undefined) differences.push(`  not in the store package  ${path}`)
    else if (other !== hash) differences.push(`  contents differ           ${path}`)
  }
  for (const path of install.hashes.keys()) {
    if (!released.has(path)) differences.push(`  extra in store package    ${path}`)
  }

  if (differences.length === 0) {
    console.log(
      `\nmatch: the Web Store package for v${install.version} is this release, file for file.`,
    )
    return
  }

  console.error('\nMISMATCH — the Web Store is not serving this release.\n')
  for (const line of differences) console.error(line)
  console.error('\nGoogle signed the hashes above when the package was uploaded, so a difference')
  console.error('means the uploaded package was not built from this release.')
  process.exit(1)
}
