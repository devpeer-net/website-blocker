# Releasing

This extension asks people to hand it a list of the sites they can't stop visiting. The
only thing that makes that reasonable is being checkable — so releases are built in public,
by a workflow anyone can read, and the artifact that reaches the Chrome Web Store is the
same file, provably, that is attached to the GitHub Release.

Nothing is ever uploaded from a laptop.

## Cutting a release

```bash
pnpm release:bump 1.1.0        # package.json, manifest, and a dated CHANGELOG heading
$EDITOR CHANGELOG.md           # say what changed under the new heading
git commit -am "Release 1.1.0"
git tag v1.1.0
git push --follow-tags
```

The tag is the trigger. Everything below happens on its own, except the one step that
waits for you.

## What the tag sets off

```
push tag v1.1.0
      │
      ▼
 verify ─── the same lint / unit / end-to-end suite that guards main,
      │     called from ci.yml rather than copied, on the tagged commit
      ▼
 package ── check the tag, manifest and changelog agree
      │     build, then zip deterministically
      │     attest: GitHub signs "this zip came from this commit, via this workflow"
      ▼
 release ── GitHub Release with the zip, its SHA-256, and the changelog entry
      │
      ▼
 publish ── ⏸ WAITS FOR YOUR APPROVAL
            then uploads to the Chrome Web Store and submits for review
```

The GitHub Release is published *before* the store gate on purpose. The artifact and its
digest are public and inspectable before anyone decides whether to push it to users — and
if the answer is no, the release still stands as a record of what was built.

## The approval gate

The `publish-chrome-web-store` job runs in the `chrome-web-store` environment, which has a
required reviewer. Until that reviewer approves, the job does not start.

- The pending request appears on the workflow run, and in **Environments** in the
  repository sidebar.
- Approving takes a click: **Review deployments** → `chrome-web-store` → **Approve**.
- Who approved and when is kept in the deployment history. The decision is part of the
  public record, not a private act.
- Rejecting stops the release from reaching users. The GitHub Release stays.

Configured under **Settings → Environments → chrome-web-store**. Keep *Prevent self-review*
off: on a one-maintainer project the person who pushes the tag is also the person who
approves, and turning it on would deadlock every release.

## Verifying a release — for anyone, not just the maintainer

```bash
gh release download v1.1.0 --repo devpeer-net/website-blocker
sha256sum -c website-blocker-1.1.0.zip.sha256
gh attestation verify website-blocker-1.1.0.zip --repo devpeer-net/website-blocker
```

The last command is the one that matters. It checks a Sigstore signature binding the zip
to the commit, the workflow file and the run that produced it. It does not trust the
release page, the checksum file, or anything else in this repository — a forged artifact
cannot produce a valid signature, because the signing certificate is minted by GitHub's
OIDC provider against the running workflow's identity and cannot be obtained any other way.

Attestations are also browsable at **Actions → Attestations**.

The zip is built deterministically — sorted entries, all timestamps pinned to the zip
epoch, `TZ=UTC` — so `pnpm package` on the same commit with the same Node and Info-ZIP
versions reproduces the same bytes. Treat that as a useful cross-check rather than a
guarantee: compression output can shift between zlib versions. The attestation is the
claim that holds regardless.

## One-time Chrome Web Store setup

The publish job needs four values. It fails with a clear message if any are absent, so an
unconfigured repository cuts perfectly good GitHub Releases and simply stops at the gate.

**1. Create the store item manually, once.** The API can update an existing item but cannot
create one. Upload `website-blocker-1.0.0.zip` by hand at the
[developer dashboard](https://chrome.google.com/webstore/devconsole), fill in the listing,
and note the extension ID from the item's URL.

**2. Enable the API.** In a Google Cloud project, enable the **Chrome Web Store API**.

**3. Create an OAuth client** of type *Desktop app*. Keep the client ID and secret.

**4. Mint a refresh token.** Authorise the scope
`https://www.googleapis.com/auth/chromewebstore`, take the resulting `code`, and exchange
it:

```bash
curl -sS -X POST https://oauth2.googleapis.com/token \
  -d client_id="$CLIENT_ID" \
  -d client_secret="$CLIENT_SECRET" \
  -d code="$CODE" \
  -d grant_type=authorization_code \
  -d redirect_uri=http://localhost
```

> **The trap.** While the OAuth consent screen is in *Testing*, Google expires refresh
> tokens after seven days and the publish job starts failing for no visible reason. Set the
> consent screen to *In production* before minting the token you intend to keep.

**5. Store them.** Tier by sensitivity, not for uniformity:

| Kind | Where | Name | Value |
|---|---|---|---|
| Secret | Environment `chrome-web-store` | `CWS_CLIENT_ID` | OAuth client ID |
| Secret | Environment `chrome-web-store` | `CWS_CLIENT_SECRET` | OAuth client secret |
| Secret | Environment `chrome-web-store` | `CWS_REFRESH_TOKEN` | the refresh token from step 4 |
| Variable | Repository | `CWS_EXTENSION_ID` | the 32-character item ID |

```bash
gh secret set CWS_CLIENT_ID     --env chrome-web-store --repo devpeer-net/website-blocker
gh secret set CWS_CLIENT_SECRET --env chrome-web-store --repo devpeer-net/website-blocker
gh secret set CWS_REFRESH_TOKEN --env chrome-web-store --repo devpeer-net/website-blocker
gh variable set CWS_EXTENSION_ID --repo devpeer-net/website-blocker
```

Environment scope is what turns the approval gate into access control rather than a pause
in the UI. A repository secret is readable by any job in any workflow on any branch;
anyone with write access could push a branch whose workflow prints it. An environment
secret is injected only into a job that declares `environment: chrome-web-store`, and that
job cannot start until a required reviewer approves it — and the environment's deployment
policy admits only `v*` tags, so a branch cannot reach the credentials at all.

Organization scope would be wrong twice over: these keys publish one specific extension,
so sharing them across `devpeer-net` widens the blast radius for no benefit, and
organization secrets cannot be environment-scoped, which is precisely the protection worth
having.

The extension ID is deliberately the odd one out. It is public the moment the listing
exists, and it is a repository *variable* so it stays unmasked in logs and resolves in the
job's `environment.url` — an environment-scoped value would be a chicken-and-egg for the
very deployment that defines it.

## Why it is built this way

**No third-party actions handle credentials.** The release is created with `gh`, which
ships on the runner, and the store upload is four `curl` calls you can read in
`release.yml`. Convenient marketplace actions exist for both; each one would be unaudited
code holding either a token with write access to this repository or the keys to publish to
every user. For a project whose entire proposition is *you don't have to trust me*, that is
the wrong trade.

**Every action is pinned to a commit SHA.** `@v7` is a branch that its owner can move, so a
tag reference is a standing instruction to run whatever that account publishes next. The
version stays in a trailing comment because a bare SHA tells a reader nothing.

The job that matters is `package`. It holds `id-token: write` and `attestations: write`,
which together are the authority to have GitHub sign a statement about what a build
contains. An action that could change under it could alter the zip *and* have that
alteration attested — the attestation would be valid and would be vouching for the wrong
bytes. That is a worse outcome than losing the store credentials, because it is the failure
the attestation exists to rule out, and nothing downstream would look wrong.

Pinning alone would rot, so `.github/dependabot.yml` opens a weekly PR moving the pins
forward. Review those the way you would review any other code that runs with those
permissions.

**Verification is called, not copied.** `release.yml` invokes `ci.yml` through
`workflow_call`, so a release can never be verified more loosely than a pull request.

**The version is checked before anything is built.** `scripts/check-version.mjs` fails the
run if the tag, `package.json`, `public/manifest.json` and `CHANGELOG.md` disagree.
`scripts/package.mjs` additionally refuses to ship a `dist/` carrying the E2E test `key`,
which would pin the published extension to the test ID and orphan every existing install.

## What is deliberately not here

**GitHub Packages.** It hosts npm, container and similar registries, none of which any
consumer of a browser extension would fetch from. Publishing there would create a second
copy of the artifact in a second place, and "which one is canonical" is a question an
audit trail should never have to answer. One artifact, one digest, one signature.

**Automatic publication without approval.** Blocking is a self-imposed commitment; a bad
release breaks something people are relying on to hold. The gate is the point.
