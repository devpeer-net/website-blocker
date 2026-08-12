# Changelog

Every released version has a [GitHub Release](https://github.com/devpeer-net/website-blocker/releases)
carrying the exact `.zip` that is uploaded to the Chrome Web Store, its SHA-256, a build
provenance attestation, and a content digest you can regenerate from an installed copy to
check that the store is serving that same build. See [docs/RELEASING.md](docs/RELEASING.md)
for how a release is cut and how to verify one.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions
follow Chrome's extension version rule — one to four dot-separated integers — rather than
full semver, because Chrome rejects pre-release suffixes such as `1.1.0-rc.1`.

## [Unreleased]

## [1.0.1] — 2026-08-12

No change to the extension itself. Every file under `src/` and `public/` is byte-identical
to 1.0.0 apart from the version string, and the built `dist/` reproduces the same content
digest 1.0.0 was built from.

What changes is that this is the first version you can check. 1.0.0 was uploaded to the
Chrome Web Store by hand, with nothing published to compare it against. 1.0.1 is built by
[the release workflow](.github/workflows/release.yml) and arrives with a GitHub Release
carrying the zip, its SHA-256, a Sigstore build provenance attestation, and a content
digest that [`scripts/verify-install.mjs`](scripts/verify-install.mjs) can check against
the copy Chrome installed from the store.

### Fixed

- `scripts/verify-install.mjs` no longer crashes when imported from a context with no
  `process.argv[1]`, such as `node -e` — `pathToFileURL(undefined)` throws, which took
  down `scripts/package.mjs` rather than skipping the CLI branch.

## [1.0.0] — 2026-08-08

First release. Published to the Chrome Web Store as
`Website Blocker - Block Distracting Sites, Private & Simple`.

### Added

- Blocklist management on a single options page: add an entry, view the list, remove an
  entry. Blocking a domain covers its subdomains, so `reddit.com` also covers
  `old.reddit.com`.
- Blocking via `declarativeNetRequest`, so rules live in the browser and survive the
  service worker being suspended. Top-level navigations only — embedded iframes still
  load, deliberately.
- A confirmation dialog on the master off switch. It resists Escape and backdrop
  dismissal, and shows a tip before the choice is made.
- 38 tips, each citing a study by DOI. Twelve candidates were dropped in fact-checking.
- A block page that names the blocked site and shows a tip. It treats its own URL
  fragment as hostile input: `textContent` only, host validated against the stored
  blocklist, no link ever built from the fragment.
- Degraded-mode reporting. If Chrome's per-extension site access is narrowed, a
  lower-priority `block` rule still stops the navigation and the options page says so,
  rather than reporting ON while doing nothing.
- Storage overflow handling. Past Chrome's ~8 KB sync quota the options page offers to
  keep the list on this device only, leaving the synced copy intact.
- Light and dark themes following the system setting.

[unreleased]: https://github.com/devpeer-net/website-blocker/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/devpeer-net/website-blocker/releases/tag/v1.0.0
