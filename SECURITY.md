# Security

This extension asks people to hand it a list of the sites they cannot stop visiting, and it
runs with `<all_urls>` host access. Both facts make a quiet vulnerability report more
valuable to me than a loud one.

## Reporting

**Use [private vulnerability reporting](https://github.com/devpeer-net/website-blocker/security/advisories/new).**
It is enabled on this repository and goes only to the maintainer. If you would rather use
email, <tom@devpeer.net> reaches the same place.

Please do not open a public issue for anything that looks exploitable. Everything else —
crashes, a domain that fails to block, a rule that misfires — belongs in a normal issue,
and is genuinely more useful there.

What helps, in rough order: the version, what an attacker gains, and the smallest input
that shows it. A URL that reproduces it is worth more than a description of the class.

I am one person, so I will not promise a response time I might miss. Expect an
acknowledgement within a few days, and expect me to tell you honestly if a fix will be
slow. Fixes ship as a normal release; the advisory credits you unless you ask otherwise.

## Supported versions

The latest release. There are no maintained branches behind it.

## What is worth looking at

The block page is the sharpest edge and is documented as such. `blocked.html` runs on the
extension's origin, is web-accessible, and renders a fragment that any site can control.
It parses through the URL parser, accepts only `http(s)`, checks the host against the
stored blocklist before naming it, and writes exclusively through `textContent`. An
`innerHTML`, `href`, CSS or `window.name` sink reachable from that fragment would be an
extension-privileged XSS. `docs/review-f3.md` records a prior review of exactly this path.

Also worth attention: rule construction in `src/core/rules.ts`, where a domain that
normalises to something the user did not intend becomes a blocking rule; and
`src/core/domain.ts`, where the canonicalisation that `covers()` depends on lives.

## Known and accepted

`blocked.html` is web-accessible at a static extension ID, so any page can detect that this
extension is installed and can render a spoofed "this site is blocked" page. The
`use_dynamic_url` fix breaks the redirect, whose target is resolved when rules are built.
Extension-ID fingerprinting is a platform-level issue that both Chrome and Firefox have
declined to change ([w3c/webextensions#604](https://github.com/w3c/webextensions/issues/604)).
Reports of this are welcome but will be closed as known.

## Out of scope

Bypasses available to the person who installed the extension — disabling it, removing a
domain, using another browser. Blocking here is a self-imposed commitment, not an
adversarial control, and the threat model says so explicitly in
[`srs-website-blocker.md`](srs-website-blocker.md). A bypass that works *without* the
user's involvement is very much in scope.
