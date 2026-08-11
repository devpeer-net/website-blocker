/**
 * Compose the body of a GitHub Release: what changed, followed by everything a reader
 * needs to check the artifact without taking the release page's word for anything.
 *
 *   node scripts/release-notes.mjs <version> <zip-name> <sha256> <content-digest> > notes.md
 *
 * Run inside Actions it picks the repository, commit and run URL out of the environment.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [version, zipName, sha256, content] = process.argv.slice(2)

if (!version || !zipName || !sha256 || !content) {
  console.error('usage: node scripts/release-notes.mjs <version> <zip-name> <sha256> <content>')
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
  '',
  '### Verify what the Web Store is serving',
  '',
  'The digest above identifies the *upload*, and nothing on your disk can be compared',
  'against it. Google repacks the zip into a CRX signed with its own key, and Chrome then',
  'rewrites `manifest.json` and re-encodes every image as it installs them — so comparing',
  'this release to the installed files reports tampering on a perfectly honest install.',
  '',
  'Google does leave something usable behind. `_metadata/verified_contents.json`, stored',
  'beside every Web Store install, is its **signed record of each file as uploaded**,',
  "before any of that rewriting. Hashing that record gives this release's content digest:",
  '',
  '```',
  content,
  '```',
  '',
  'From a clone of this repository at this tag:',
  '',
  '```bash',
  `node scripts/verify-install.mjs --zip ${zipName} --installed <extension-dir>`,
  '```',
  '',
  'It prints both digests and names any file that differs. `docs/RELEASING.md` has the',
  'per-platform paths to `<extension-dir>`, and is explicit about what this does and does',
  'not prove.',
]

if (trail) lines.push('', trail)

console.log(lines.join('\n'))
