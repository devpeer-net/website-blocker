/**
 * Assert that every place a version number lives agrees.
 *
 * There are three: package.json, the extension manifest, and the git tag a release is
 * cut from. When they drift you get a release page labelled v1.1.0 carrying a zip that
 * installs as 1.0.0 — a discrepancy nobody notices until someone is trying to work out
 * which build they are actually running. Making that impossible is cheaper than
 * explaining it later.
 *
 *   node scripts/check-version.mjs           # package.json vs manifest
 *   node scripts/check-version.mjs v1.1.0    # ...and the tag as well
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => JSON.parse(readFileSync(join(root, relativePath), 'utf8'))

/**
 * Chrome's rule: one to four dot-separated integers, each 0-65535, no leading zeros.
 * Note what this rejects — semver pre-release tags such as `1.1.0-rc.1`. There is no
 * point discovering that at the upload step, after a release has already been published.
 */
const CHROME_VERSION = /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){0,3}$/

function fail(message) {
  console.error(`version check failed: ${message}`)
  process.exit(1)
}

const pkg = read('package.json').version
const manifest = read('public/manifest.json').version

if (!CHROME_VERSION.test(pkg) || pkg.split('.').some((part) => Number(part) > 65535)) {
  fail(
    `"${pkg}" is not a valid Chrome extension version ` +
      '(one to four dot-separated integers, each 0-65535, no leading zeros)',
  )
}

if (pkg !== manifest) {
  fail(`package.json says ${pkg}, public/manifest.json says ${manifest}`)
}

const tag = process.argv[2]
if (tag !== undefined && tag !== '') {
  const tagged = tag.replace(/^v/, '')
  if (tagged !== pkg) fail(`tag ${tag} does not match version ${pkg}`)

  // The changelog entry becomes the release notes, so a missing section means a release
  // page that says nothing about what changed. Catch it before anything is built.
  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
  if (!new RegExp(`^## \\[${pkg.replace(/\./g, '\\.')}\\]`, 'm').test(changelog)) {
    fail(`CHANGELOG.md has no "## [${pkg}]" section`)
  }
}

console.log(`version ${pkg} agrees across package.json, manifest${tag ? `, and tag ${tag}` : ''}`)
