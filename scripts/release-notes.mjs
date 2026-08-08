/**
 * Compose the body of a GitHub Release: what changed, followed by everything a reader
 * needs to check the artifact without taking the release page's word for anything.
 *
 *   node scripts/release-notes.mjs <version> <zip-name> <sha256> > notes.md
 *
 * Run inside Actions it picks the repository, commit and run URL out of the environment.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [version, zipName, sha256] = process.argv.slice(2)

if (!version || !zipName || !sha256) {
  console.error('usage: node scripts/release-notes.mjs <version> <zip-name> <sha256>')
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const server = process.env.GITHUB_SERVER_URL ?? 'https://github.com'
const repo = process.env.GITHUB_REPOSITORY ?? 'devpeer-net/website-blocker'
const commit = process.env.GITHUB_SHA ?? ''
const runId = process.env.GITHUB_RUN_ID ?? ''

/** Everything under `## [1.2.3]` up to the next `##` heading. */
function changelogSection(forVersion) {
  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
  const heading = new RegExp(`^## \\[${forVersion.replace(/\./g, '\\.')}\\].*$`, 'm')
  const start = changelog.search(heading)
  if (start === -1) {
    console.error(`CHANGELOG.md has no "## [${forVersion}]" section`)
    process.exit(1)
  }
  const body = changelog.slice(start).split('\n').slice(1).join('\n')
  // Stop at the next version heading, or at the block of link-reference definitions
  // Keep a Changelog puts at the end of the file — those are invisible once rendered.
  const end = body.search(/^(?:## |\[[^\]]+\]:\s)/m)
  return (end === -1 ? body : body.slice(0, end)).trim()
}

const workflowUrl = `${server}/${repo}/blob/main/.github/workflows/release.yml`

const provenance = [
  `It was built by [\`release.yml\`](${workflowUrl}) from the tagged commit, and GitHub`,
  'signed a statement saying so. The signature checks against the file you downloaded,',
  'so nothing above has to be taken on faith:',
].join('\n')

const trail = [
  commit && `built from [\`${commit.slice(0, 7)}\`](${server}/${repo}/commit/${commit})`,
  runId && `[workflow run](${server}/${repo}/actions/runs/${runId})`,
]
  .filter(Boolean)
  .join(' · ')

const lines = [
  changelogSection(version),
  '',
  '---',
  '',
  '### Verify this build',
  '',
  `\`${zipName}\` is byte-for-byte the file uploaded to the Chrome Web Store.`,
  '',
  '```',
  `${sha256}  ${zipName}`,
  '```',
  '',
  provenance,
  '',
  '```bash',
  `gh attestation verify ${zipName} --repo ${repo}`,
  '```',
]

if (trail) lines.push('', trail)

console.log(lines.join('\n'))
