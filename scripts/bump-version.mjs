/**
 * Move the version forward in the three files that have to agree, in one step.
 *
 * `check-version.mjs` exists to catch drift between package.json, the manifest and the
 * changelog. This exists so the drift is unlikely in the first place — hand-editing three
 * files is exactly the chore people get wrong at 6pm on a Friday.
 *
 *   node scripts/bump-version.mjs 1.1.0     # or: pnpm release:bump 1.1.0
 *
 * It edits files and stops. Reviewing the diff, writing the changelog entry, committing
 * and tagging stay deliberate acts — see docs/RELEASING.md.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const next = process.argv[2]
const CHROME_VERSION = /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){0,3}$/

if (!next || !CHROME_VERSION.test(next.replace(/^v/, ''))) {
  console.error('usage: node scripts/bump-version.mjs <version>   e.g. 1.1.0')
  process.exit(1)
}

const version = next.replace(/^v/, '')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Replace the version line rather than reserialising the JSON: public/manifest.json is
 * hand-written, blank-line grouped and meant to be read, and JSON.stringify would flatten
 * it. `"manifest_version"` and `"minimum_chrome_version"` are safe — neither has a quote
 * immediately before `version`.
 */
function setJsonVersion(relativePath) {
  const path = join(root, relativePath)
  const text = readFileSync(path, 'utf8')
  const current = text.match(/^\s*"version"\s*:\s*"([^"]*)"/m)?.[1]
  if (current === undefined) {
    console.error(`bump failed: ${relativePath} has no version line`)
    process.exit(1)
  }
  if (current === version) {
    console.error(`bump failed: ${relativePath} is already at ${version}`)
    process.exit(1)
  }
  writeFileSync(path, text.replace(/^(\s*"version"\s*:\s*)"[^"]*"/m, `$1"${version}"`))
}

setJsonVersion('package.json')
setJsonVersion('public/manifest.json')

const changelogPath = join(root, 'CHANGELOG.md')
const changelog = readFileSync(changelogPath, 'utf8')

if (new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm').test(changelog)) {
  console.error(`bump failed: CHANGELOG.md already has a "## [${version}]" section`)
  process.exit(1)
}

const today = new Date().toISOString().slice(0, 10)
const opened = changelog.replace(
  /^## \[Unreleased\]\s*$/m,
  `## [Unreleased]\n\n## [${version}] — ${today}`,
)

if (opened === changelog) {
  console.error('bump failed: CHANGELOG.md has no "## [Unreleased]" heading')
  process.exit(1)
}

writeFileSync(changelogPath, opened)

console.log(`bumped to ${version}`)
console.log('next: describe the change under the new CHANGELOG heading, then')
console.log(
  `  git commit -am "Release ${version}" && git tag v${version} && git push origin HEAD v${version}`,
)
