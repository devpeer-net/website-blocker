/**
 * Prove that the extension Chrome installed from the Web Store is the build published here.
 *
 * The obvious check does not work. You cannot hash what the Web Store serves and compare it
 * to the released zip: Google unpacks the upload, repacks it as a CRX3 signed with its own
 * key, and adds a `_metadata/` directory of its own hashes. The bytes of the container
 * differ by construction, on every extension, always. Anyone who tells you to compare the
 * two digests has not tried it.
 *
 * What survives that repack is the payload. Google rewraps the extension's files; it does
 * not rewrite them. So the check that does work is per-file: every file in the release zip
 * must appear in the installed directory with identical bytes, and the installed directory
 * must contain nothing else except Google's `_metadata/`.
 *
 * This script reduces that comparison to a single hash — the *tree digest* — so a release
 * page can publish one line and anyone can regenerate it from their own Chrome profile:
 *
 *     for each file, sorted by path in byte order:
 *         line = "<sha256 of contents>  <path>\n"     # exactly `sha256sum` format
 *     tree digest = sha256(all lines concatenated)
 *
 * Nothing here is privileged. The same number falls out of coreutils, which is the point —
 * the trustworthy version of this check is the one that does not run my code:
 *
 *     find . -type f -not -path './_metadata/*' -printf '%P\n' \
 *       | LC_ALL=C sort | xargs -d '\n' sha256sum | sha256sum
 *
 * Usage:
 *
 *     node scripts/verify-install.mjs --zip website-blocker-1.0.0.zip
 *     node scripts/verify-install.mjs --installed ~/.config/google-chrome/Default/Extensions/<id>/1.0.0_0
 *     node scripts/verify-install.mjs --zip <zip> --installed <dir>    # compare the two
 *
 * With both, it exits non-zero and names every file that differs. See docs/RELEASING.md
 * for where Chrome keeps installed extensions on each platform.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'

/**
 * Google's own signed hashes of the extension, added at install time. It is the one thing
 * present in an install that was never in the upload, so it is excluded rather than
 * reported as an extra file.
 */
const GOOGLE_METADATA = '_metadata'

function fail(message) {
  console.error(`verify-install failed: ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const options = {}
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag !== '--zip' && flag !== '--installed') fail(`unknown argument "${flag}"`)
    if (value === undefined) fail(`${flag} needs a path`)
    options[flag.slice(2)] = value
  }
  return options
}

/** Every file under `dir`, as paths relative to it, `/`-separated, sorted in byte order. */
function walk(dir, skipMetadata) {
  const found = []
  const recurse = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      // Symlinks are not followed: an install containing one is already not a faithful
      // copy of a zip that cannot express them, and following it would let a link outside
      // the tree pass the comparison.
      if (entry.isDirectory()) recurse(full)
      else if (entry.isFile()) found.push(relative(dir, full).split(sep).join('/'))
    }
  }
  recurse(dir)
  return found
    .filter(
      (path) =>
        !(skipMetadata && (path === GOOGLE_METADATA || path.startsWith(`${GOOGLE_METADATA}/`))),
    )
    .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

/**
 * Hash every file, then hash the listing. Returns the per-file map as well as the digest,
 * because a mismatch is only actionable if it can name the file that moved.
 */
export function digestTree(dir, { skipMetadata = false } = {}) {
  const files = walk(dir, skipMetadata)
  if (files.length === 0) fail(`${dir} contains no files`)
  const hashes = new Map()
  let listing = ''
  for (const path of files) {
    const hash = sha256(readFileSync(join(dir, path)))
    hashes.set(path, hash)
    listing += `${hash}  ${path}\n`
  }
  return { digest: sha256(Buffer.from(listing, 'utf8')), hashes }
}

/** Unpack to a temp dir rather than parsing the container: `unzip` already reads zips. */
function digestZip(zipPath) {
  if (!existsSync(zipPath)) fail(`${zipPath} does not exist`)
  const scratch = mkdtempSync(join(tmpdir(), 'verify-install-'))
  try {
    execFileSync('unzip', ['-q', '-o', zipPath, '-d', scratch], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    return digestTree(scratch)
  } catch (error) {
    if (error?.code === 'ENOENT') fail('`unzip` is not installed')
    throw error
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

// scripts/package.mjs imports `digestTree` to publish the same number on the release page,
// so the CLI below runs only when this file is the entry point.
if (import.meta.url === `file://${process.argv[1]}`) main()

function main() {
  const options = parseArgs(process.argv.slice(2))

  if (!options.zip && !options.installed) {
    console.error('usage: node scripts/verify-install.mjs [--zip <file>] [--installed <dir>]')
    process.exit(1)
  }

  if (options.installed) {
    if (!existsSync(options.installed)) fail(`${options.installed} does not exist`)
    if (!statSync(options.installed).isDirectory()) {
      fail(`${options.installed} is not a directory — point at the unpacked extension, not the CRX`)
    }
    if (!existsSync(join(options.installed, 'manifest.json'))) {
      fail(`${options.installed} has no manifest.json — this is not an unpacked extension`)
    }
  }

  const released = options.zip ? digestZip(options.zip) : undefined
  const installed = options.installed
    ? digestTree(options.installed, { skipMetadata: true })
    : undefined

  if (released) {
    console.log(
      `released   ${released.digest}  (${released.hashes.size} files, from ${options.zip})`,
    )
  }
  if (installed) {
    console.log(
      `installed  ${installed.digest}  (${installed.hashes.size} files, _metadata/ excluded)`,
    )
  }

  if (!released || !installed) return

  if (released.digest === installed.digest) {
    console.log('\nmatch: the installed extension is the released build, file for file.')
    return
  }

  // Digests differ. A bare "no match" is useless, so say precisely how the trees disagree.
  console.error('\nMISMATCH — the installed extension is not the released build.\n')
  for (const [path, hash] of released.hashes) {
    const other = installed.hashes.get(path)
    if (other === undefined) console.error(`  missing from install  ${path}`)
    else if (other !== hash) console.error(`  contents differ       ${path}`)
  }
  for (const path of installed.hashes.keys()) {
    if (!released.hashes.has(path)) console.error(`  extra in install      ${path}`)
  }
  console.error('\nA difference here means the store build did not come from this release.')
  process.exit(1)
}
