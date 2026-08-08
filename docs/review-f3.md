# Adversarial code review — confirmation flow and block page

Acceptance evidence for **F3** ("The disabling blocking confirmation popup should ask
'Are you sure?' with a tip below"), which the SRS specifies is proven by *isolated
adversarial code review with a code reviewer sub-agent*.

- **Date:** 2026-08-08
- **Reviewed at commit:** 7cb8e2d
- **Scope:** the switch → confirmation → pause path (`src/options/`, `src/platform/`,
  `src/core/`), and the block page (`src/blocked/`, `blocked.html`) as a security surface.
- **Method:** an isolated reviewer with no involvement in the implementation, instructed
  to find defects rather than to approve, and to produce a concrete failing scenario for
  every claim or else mark it speculative.

## Verdict

F3 is met, and structurally so: `confirmTip` is simultaneously the tip and the dialog's
open condition, so the dialog cannot render without a tip. F2 was met at the switch, but
the reviewer found a second, unconfirmed path that turned blocking off — see CRITICAL
below. The block page was found safe: every fragment-derived value was traced and no
HTML, `href`, CSS or `window.name` sink was reachable.

## Findings and disposition

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | CRITICAL | `storeLocally` was written to **synced** storage, so choosing "keep my list on this device only" propagated to every other device, where `local.blocked` is empty — each silently dropped all rules and stopped blocking. It also deleted the synced list. | **Fixed.** `storeLocally` moved to `chrome.storage.local`; the synced copy is no longer deleted. |
| 2 | HIGH | `normalizeDomain('reddit.com..')` returned `reddit.com.`, which is not its own canonical form, so `removeSite` could never match it: the row's ✕ silently did nothing, forever, while the site stayed blocked. | **Fixed.** All trailing dots are stripped. A second instance of the same class (`www.www.example.com`) was found by the new idempotency test and fixed by stripping `www.` exhaustively. |
| 3 | MEDIUM | `refresh()` had no staleness guard, so a slow early refresh could land last and leave the switch reading "blocking is on" while blocking was off, with no later event to correct it. | **Fixed.** Generation counter; stale results are discarded. Optimistic state removed entirely — storage is now the only driver. |
| 4 | MEDIUM | Blocklist writes were read-modify-write against React state, so two tabs (or a synced device) could silently drop each other's entries. | **Fixed.** Mutations re-read storage before computing the next list. |
| 5 | MEDIUM | `void`-ed storage writes: a failed `setPaused` left the UI claiming blocking was on, as an unhandled rejection. | **Fixed.** All writes have a rejection handler that logs and resyncs from storage. |
| 6 | MEDIUM | `syncRules()` was an unserialized read-modify-write fired from five listeners; overlapping runs could orphan rules that kept blocking removed domains. | **Fixed.** Runs are serialized behind a promise chain. |
| 7 | MEDIUM | Stripping `www.` widens `www.google.com` to all of `google.com`. | **Accepted, documented.** Not stripping would leave `old.reddit.com` reachable after blocking `www.reddit.com` — a blocker that quietly fails to block. Over-blocking is the safe direction, and the canonical form is shown in the list immediately. Rationale recorded in `src/core/domain.ts` and the README. |
| 8 | LOW | The worker watched `lastSyncError`/`invalidEntries`, which `syncRules()` itself writes — a self-trigger edge guarded only by Chrome's identical-value de-duplication. | **Fixed.** The worker now watches rule inputs only; the options page still watches everything. |
| 9 | LOW | A non-string in stored `blocked` threw inside `addSite`, leaving the Add button disabled for the life of the page. | **Fixed.** `getBlocklist()` filters to strings; `AddSiteForm` clears `busy` in a `finally`. |
| 10 | LOW | `-.com`, `--.com` and `a-.b.com` were accepted as domains and reached `requestDomains`, where they never match — an entry the user believes is live. | **Fixed.** Per-label host validation. |
| 11 | LOW | `history.replaceState` ran *after* an `await`, so the full blocked URL (query string and all) stayed in the omnibox and history for the round trip, and permanently on any error. | **Fixed.** The fragment is captured and stripped before any await; `render()` has a catch. |
| 12 | LOW | `blocked.html` is web-accessible at a static ID, allowing fingerprinting and a spoofed "X is blocked" page. | **Not fixed, deliberate.** The suggested `use_dynamic_url: true` breaks the DNR redirect, whose target is resolved at rule-build time. The residual risk is fingerprinting, which is a known platform-level wontfix (w3c/webextensions#604). |
| 13 | LOW/SPEC | The "Cancel holds focus" claim — load-bearing for F2 — was asserted by no test. | **Fixed.** Two E2E tests added: Cancel is focused on open and Enter does not disable; keyboard activation of the switch still routes through the dialog. |
| 14 | NIT | `pickTip` could return `undefined` behind an `as Tip` cast for a non-finite seed. | **Fixed.** `pickTip` is now total. |
| 15 | NIT | The IPv6 branch returned before the charset gate. | **Fixed.** Bracketed literals are validated explicitly. |

## What the reviewer checked and found sound

- No way to defeat the confirmation via the switch: `handleToggle` never pauses directly;
  the switch is fully controlled by stored state; Space and Enter both merely open the
  dialog; a held key cycles switch → Cancel → switch and never reaches the destructive
  button.
- Dialog dismissal: Escape and outside-interaction are both prevented, there is no
  built-in close button, and every unhandled path is fail-safe (blocking stays on).
- Two open options tabs cannot disable blocking without each confirming.
- Block page XSS: the full path is `decodeURIComponent` → `new URL` → http(s) only →
  `normalizeDomain` (charset-gated) → `covers` against the stored list → `textContent`.
  Attempts with `www.reddit.com.evil.com`, suffix extension, IPv6 literals,
  credential-bearing URLs (`https://user:pass@www.evil.com@reddit.com/`) and mangled
  percent-encoding all failed to yield an uncovered or non-`[a-z0-9.-]` string.
- Rule construction: `main_frame` scoping present, redirect/block priority pair degrades
  correctly when host access is withheld, pausing emits zero rules, ids are deterministic.
- MV3 listener registration is synchronous and top-level.

## Follow-up

Regression coverage added with the fixes: `normalizeDomain` idempotency over every
accepted input, "every entry addSite stores can be removed again", and the two keyboard
tests above. Unit tests 81 → 96; E2E 16 → 18.
