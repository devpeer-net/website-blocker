# SRS: Website Blocker

> Status: Approved — implemented in v1.0.0 | Owner: Tom | Last updated: 2026-08-08
>
> Rules: every requirement gets an ID, a priority (H=high / M=medium / L=low), and is
> testable. If you can't write a pass/fail check for it, it's not a requirement — it's a goal.
> Delete any line you can't fill in. Empty sections are better than filler.

## 1. Overview

- **Problem:** Knowledge workers lose focus to entertainment websites during working hours. The pull is strongest precisely when a task feels overwhelming, so the visit functions as avoidance rather than as a genuine break — and once started, it tends to run long.
- **Solution:** Let the user nominate the sites that are pure distraction for them, and put those sites out of reach. Breaks remain necessary; the aim is to make them restorative rather than compulsive.
- **Users:** Knowledge workers who want to protect their focus. No technical expertise assumed beyond installing a browser extension.
- **In scope:** A Chrome extension for managing a list of blocked websites, by domain or subdomain.
- **Out of scope:** Focus timers, scheduled or time-based blocking, usage statistics, and any form of account or backend service.
- **Success looks like:** The user can configure the blocked list without instruction, and navigating to a blocked site presents an informational page stating that the site is blocked.

### 1.1 Core values

These four values resolve trade-offs that the requirements below leave open. Where two requirements pull against each other, the earlier value wins.

| Value | What it means here |
|---|---|
| **Productivity** | The product exists to protect attention. A blocker that fails silently is worse than none, so blocking must hold even when a supporting feature is unavailable, and the state of protection must always be reported honestly. |
| **Simplicity** | One surface, one decision, no configuration the user did not ask for. Every added option is an added way to get it wrong. |
| **Trust** | The user is handing over a list of their own weak points. No accounts, no telemetry, no network calls, no data leaving the browser except through the user's own browser-settings sync. The source is open so this is verifiable rather than merely claimed. |
| **Mental health** | The tone is supportive, never shaming. Friction is applied once, at the point of relapse, and is paired with a constructive alternative rather than a reprimand. |

## 2. Context & Constraints

- **Assumptions:** The user works primarily in one Chrome profile on the desktop. Blocking is a self-imposed commitment, not an externally enforced control — the user is presumed to be a willing participant rather than an adversary.
- **Dependencies:** Chrome's extension platform, in particular the Manifest V3 declarative blocking and extension-settings-sync APIs. No third-party service.
- **Constraints:**
  - Manifest V3 only; no persistent background page, and no remotely hosted code.
  - Chromium-based desktop browsers. Mobile Chrome does not support extensions.
  - Pages the browser reserves to itself (`chrome://`, the Web Store, other extensions' pages) cannot be intercepted by any extension.
  - No server component, therefore no cross-device state beyond what browser settings sync provides.
- **Glossary:**
  - **Blocklist** — the user's list of blocked entries.
  - **Entry** — one domain; blocking a domain also blocks its subdomains.
  - **Blocking disabled** — a global off switch. The blocklist is retained.

## 3. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | The extension shall allow the user to manage the blocklist: add an entry, view all entries, and remove an entry. | H |
| F2 | Disabling blocking shall not be a single unguarded action. When the user attempts to disable blocking, the extension shall require an explicit confirmation before the change takes effect. | H |
| F3 | The confirmation shall ask "Are you sure?" and shall present a supporting tip beneath it — for example, "Tip: taking a walk is a great way to boost your productivity". | H |
| F4 | Tips shall be drawn from a curated, evidence-based corpus. Coverage shall prioritise doom-scrolling and internet addiction, and healthier approaches to stress reduction and taking work breaks. | M |

## 4. Quality & Interfaces

| ID | Requirement | Priority |
|----|-------------|----------|
| Q1 | The extension shall present a single user interface surface — the options page. No browser-action popup and no second extension surface. The interface shall be simple, intuitive and modern. | H |
| Q2 | Activating the extension's toolbar icon shall open the options page, rather than a popup. | M |
| Q3 | The blocklist shall be displayed as a fixed-height list that scrolls when entries overflow, so the page does not grow with the list. | M |
| Q4 | A navigation to a blocked website shall present the blocked page instead, taking effect within approximately 1 second of the user enabling blocking. | M |
| Q5 | The interface shall be built on a modern design system. | H |
| Q6 | The colour theme shall convey productivity, focus, intelligence, clarity and health. | H |
| Q7 | The source will be published openly. It shall be elegant and simple, and follow established software engineering practice. | M |

**Note on Q1 and F2.** F2 requires a confirmation dialog while Q1 forbids additional popups. These are reconciled as follows: Q1 governs *extension surfaces* — there shall be no browser-action popup and no second page. The F2 confirmation is a modal dialog rendered within the options page, and is therefore consistent with both.

## 5. Acceptance & Open Questions

**Acceptance:** how each requirement is proven. Default methods: Test (automated),
Demo (manual walkthrough), Inspection (read the code/config), Analysis (measurement/model).

| Req ID | Method | Evidence |
|--------|--------|----------|
| F1 | Test — unit and end-to-end | Blocklist and domain-canonicalisation unit suites; end-to-end add, normalise and remove |
| F2 | Test — Playwright end-to-end | Confirmation suite: dialog shown, resists dismissal, cancel preserves blocking, confirm withdraws it |
| F3 | Inspection — isolated adversarial code review by a reviewer sub-agent | Review report, `docs/review-f3.md` |
| F4 | Test — automated corpus checks | Every tip carries a resolving citation; sourcing verified by an independent fact-checking pass |
| Q1, Q2 | Test — manifest assertions | No browser-action popup declared; toolbar activation opens the options page |
| Q3 | Test — end-to-end | List content overflows a container of fixed height |
| Q4 | Analysis — measured in the end-to-end suite | Time from user edit to rule taking effect asserted below 1 second |
| Q5, Q6 | Inspection | Design tokens and component review |
| Q7 | Inspection and Test | Public repository; linting, type checking and the full test suite enforced in continuous integration |

**Open questions:** none outstanding for v1.0.
