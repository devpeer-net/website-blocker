# Website Blocker

[![CI](https://github.com/devpeer-net/website-blocker/actions/workflows/ci.yml/badge.svg)](https://github.com/devpeer-net/website-blocker/actions/workflows/ci.yml)
[![Release](https://github.com/devpeer-net/website-blocker/actions/workflows/release.yml/badge.svg)](https://github.com/devpeer-net/website-blocker/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A Chrome extension that blocks the websites you decide are pure distraction — and makes
turning it off a deliberate act rather than a reflex.

The problem it addresses is not *not knowing* a site is a distraction. It is the escape
you make when work feels overwhelming. So the design puts friction in exactly one place —
switching blocking off — and keeps everything else frictionless.

- One page. No popups, no dashboards, no accounts.
- Blocking a domain blocks its subdomains: `reddit.com` also covers `old.reddit.com`.
- Turning blocking off asks "Are you sure?" and shows a science-backed tip first.
- **No network calls, no telemetry, no analytics.** Your blocklist never leaves your
  browser except through Chrome's own settings sync.

## Install

Not yet on the Chrome Web Store. Take the zip from the
[latest release](https://github.com/devpeer-net/website-blocker/releases/latest) — or build
it yourself:

```bash
pnpm install
pnpm build
```

Either way, open `chrome://extensions`, turn on **Developer mode**, choose **Load
unpacked**, and select the `dist/` folder (or the unzipped release).

Two settings are worth changing right after installing:

- **Allow in Incognito** — otherwise an incognito window is a one-click bypass.
- **Site access: On all sites** — with anything narrower, blocked sites still get stopped,
  but you see Chrome's grey error page instead of the block page and its tip. The options
  page will warn you if this happens.

## How it works

```
options page ──writes──> chrome.storage
                              │ onChanged (fires in every context, incl. a cold worker)
                              ▼
                    background service worker ──> syncRules()
                              │ buildRules()  (pure, no chrome APIs)
                              ▼
                    declarativeNetRequest.updateDynamicRules()
                              │ rules now live in the browser
                              ▼
        navigation to a blocked site ──> blocked.html#<original url>
```

`chrome.storage` is the only channel between the UI and the blocking engine. That single
path serves local edits, settings pushed from another device, and cold start — which is
why there is no message passing anywhere in this codebase.

Blocking uses `declarativeNetRequest`, so the rules live in the browser rather than in the
extension process. The service worker can be suspended, as MV3 workers always are, with no
effect on blocking.

### Layout

| Path | What lives there |
|---|---|
| `src/core/` | Pure logic: domain canonicalisation, list semantics, rule construction, the tips corpus. No `chrome` APIs — a test enforces this by reading the source. |
| `src/platform/` | The only modules that touch `chrome.*`: storage, rule sync, permissions. |
| `src/background/` | The service worker. Listener registration only. |
| `src/options/` | The single UI surface (React + Tailwind). |
| `src/blocked/` | The block page. No framework, `textContent` only — see below. |
| `tests/e2e/` | Playwright suite driving a real Chromium with the extension side-loaded. |
| `public/manifest.json` | Hand-written and committed, not generated. It is the first file a reviewer should be able to read. |

### Two decisions worth knowing about

**Permissions.** The extension requests `declarativeNetRequest` and `<all_urls>`, which
shows the install warning *"Block content on any page."* The quieter alternative,
`declarativeNetRequestWithHostAccess`, has no warning — but Chrome's per-extension
"site access: on click" setting silently stops every such rule from applying, turning the
blocker into a no-op that still reports **ON**. So each blocked domain gets two rules: a
`redirect` to the block page, and a lower-priority `block` that Chrome honours with no
host permission at all. Restrict site access and the product degrades to a grey
interstitial instead of failing silently.

**The block page is treated as hostile input.** `blocked.html` runs on the extension's
origin, and anyone can link to it with any fragment. It parses the fragment through the
URL parser, accepts only `http(s)`, checks the host against your actual blocklist before
naming it, and writes through `textContent` exclusively. No `innerHTML`, and no link is
ever built from the fragment.

## Releases

Every version is built by [a workflow you can read](.github/workflows/release.yml), never
uploaded from a laptop. Pushing a tag runs the full test suite, packages the zip
deterministically, and asks GitHub to sign a statement binding that exact file to that
exact commit. The zip attached to the release is the same file that goes to the Web Store,
and you can prove it:

```bash
gh release download v1.0.0 --repo devpeer-net/website-blocker
sha256sum -c website-blocker-1.0.0.zip.sha256
gh attestation verify website-blocker-1.0.0.zip --repo devpeer-net/website-blocker
```

The last command trusts nothing in this repository — not the release page, not the
checksum. Publishing to the Chrome Web Store is a separate, human-approved step, and every
approval is recorded in the repository's deployment history.

### Checking what the Web Store is serving

The digest above identifies the upload, and nothing on your disk can be compared against
it. Google unpacks every upload and repacks it as a CRX signed with its own key, and Chrome
then rewrites files as it installs them — it re-serialises `manifest.json` and injects a
`key`, and re-encodes every icon through its own PNG encoder. Comparing a release zip to
the installed files reports tampering on a completely honest install. It is an appealing
check and it does not work.

Google does leave something usable behind. Beside every Web Store install, Chrome stores
`_metadata/verified_contents.json` — Google's **signed record of the hash of each file as
uploaded**, before any of that rewriting. Every release publishes a content digest over the
same hashes, so the two can be compared:

```bash
node scripts/verify-install.mjs --zip website-blocker-1.0.0.zip --installed <extension-dir>
```

If the digests agree, the package Google received and signed is this release, file for
file. If they do not, it names each file that differs.

What this proves is worth stating precisely: that **the package the store is serving was
built from this release**. It trusts `verified_contents.json` as Chrome wrote it — the
signature over it is Google's and is not checked here, though Chrome refuses to run an
extension whose files disagree with it. [docs/RELEASING.md](docs/RELEASING.md) has the
per-platform paths and how to cut a release.

## Development

```bash
pnpm dev          # rebuild on change; press reload in chrome://extensions
pnpm lint         # Biome + tsc --noEmit
pnpm test:unit    # Vitest over src/core (pure, no browser, no mocks)
pnpm test:e2e     # Playwright, headless, real Chromium with the extension loaded
pnpm test         # both
pnpm package      # dist/ -> a deterministic website-blocker-<version>.zip + .sha256
```

The E2E suite never touches the real internet: it runs a local HTTP server and points
`*.test` hostnames at it with Chrome's `--host-resolver-rules`. `distraction.test` is the
blocked subject and `allowed.test` is the control that proves a block was caused by a rule
rather than by DNS.

Extensions only side-load in Chromium, not branded Chrome — Chrome 137 removed
`--load-extension` and 139 removed `--disable-extensions-except`. The fixture therefore
pins `channel: 'chromium'`, which also works headless. Use `pnpm test:e2e:headed` to watch,
or `pnpm test:e2e:xvfb` on a Linux box with no display.

## Known limits

- **Back/forward and already-open tabs.** Rules only see network requests, so a tab
  already sitting on a site you just blocked is redirected by an explicit sweep. Pages
  restored from Chrome's back-forward cache issue no request at all and are not covered.
- **Only top-level navigations are blocked.** An embedded YouTube or Reddit iframe on
  another page still loads, deliberately: blocking those breaks unrelated pages in ways
  people find baffling.
- **`chrome://` pages, the Web Store, and other extensions' pages** cannot be intercepted
  by any extension.
- **List size.** Chrome syncs about 8 KB per settings item, which is a few hundred
  domains. Past that the options page offers to keep your list on this device only — that
  choice applies to that device alone, and your synced copy is left intact.
- **`www.` is stripped.** `www.google.com` is stored as `google.com`, which also covers
  `mail.google.com`. This is deliberate: keeping the `www` would mean blocking
  `www.reddit.com` left `old.reddit.com` and bare `reddit.com` reachable, which is a
  blocker that quietly fails to block. Over-blocking is the safe direction, and the list
  always shows you the canonical form that was actually stored.
- English only.

## The tips

The 38 tips in `src/core/tips.ts` each cite a real study, with a DOI that resolves to the
paper claimed. They were fact-checked, and twelve candidates were dropped — including the
familiar "it takes 23 minutes to refocus" figure, which traces to a 2006 press interview
rather than to a paper, and the phone "brain drain" effect, which failed a pre-registered
replication. Please do not add a tip without checking its citation.

## Credits

Inter and JetBrains Mono are used under the SIL Open Font License 1.1 and are bundled
locally — a website blocker should not report your IP to a font CDN every time you open
your blocklist.

## Licence

MIT — see [LICENSE](LICENSE).
