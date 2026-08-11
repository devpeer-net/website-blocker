# Contributing

Issues and pull requests are welcome. Found a security problem? Don't open an issue —
[SECURITY.md](SECURITY.md) explains where it goes.

```bash
pnpm install
pnpm dev          # rebuild on change; press reload in chrome://extensions
pnpm test         # unit + end-to-end
pnpm lint         # Biome + tsc --noEmit
```

`pnpm lint` and `pnpm test` are what CI runs. Running them before you push is the whole
review checklist.

## Four invariants

These are not style preferences. Each one is load-bearing for a claim the extension makes
publicly, and a change that breaks one needs to argue for itself rather than slip through.

**No network calls.** Not analytics, not error reporting, not a font CDN, not a version
check. "No network calls of any kind" is on the store listing and in the privacy policy, so
the first one added makes both false. Inter and JetBrains Mono are bundled locally for this
reason and not as an optimisation.

**`src/core/` stays pure.** No `chrome.*` anywhere in it — `src/core/purity.test.ts`
enforces this by reading the source, so you will find out immediately. Anything touching
the browser belongs in `src/platform/`. This is what lets the core be unit-tested with no
mocks at all.

**No new permissions without a reason worth the warning.** The extension deliberately does
not request `tabs`; `public/manifest.json` says why, in the manifest itself. Every
permission is a line in an install prompt that people read and reject.

**Every tip cites a study that says what the tip says.** `src/core/tips.ts` holds 38 tips,
each with a DOI that resolves to the paper claimed. Twelve candidates were dropped in
fact-checking, including the familiar "23 minutes to refocus" figure, which traces to a
2006 press interview rather than to a paper, and the phone "brain drain" effect, which
failed a pre-registered replication. If you add a tip, read the paper. A plausible-sounding
citation that does not survive checking damages the one claim the project cannot recover.

## Pull requests

Small and single-purpose is much easier to review than complete. Say what breaks if the
change is wrong — that is the part I cannot work out from the diff.

If behaviour changes, add the test that would have caught the old behaviour. Unit tests for
anything in `src/core/`; Playwright for anything a user can see.

Add a `CHANGELOG.md` entry under `## [Unreleased]` for anything user-visible. Skip it for
refactors, tests and docs.

Commit messages: say what changed and why, in the imperative. The existing log is the
reference.

## What is unlikely to be merged

Focus timers, scheduled blocking, usage statistics, streaks, accounts, sync services, and
password-protected lockouts. These are not oversights — [`srs-website-blocker.md`](srs-website-blocker.md)
puts them out of scope on purpose. The product is one page with one decision on it, and
most of what it does not do is the point. Open an issue before building one of these.
