# SRS: Website Blocker

> Status: Draft | Owner: Tom | Last updated: 2026-08-08
>
> Rules: every requirement gets an ID, a priority (M=must / S=should / C=could), and is
> testable. If you can't write a pass/fail check for it, it's not a requirement — it's a goal.
> Delete any line you can't fill in. Empty sections are better than filler.

## 1. Overview

- **Problem:** I tend to get distracted during work and visit websites only for entertainment. Especially when tackled issues feel overwhelming I tend to "run away".
- **Solution:** Block websites, which I decide that are pure distractions and harmful to binge-visit. Breaks are still important, but should be more healthy and effective.
- **Users:** Any white-collar worker that wants to increase his focus and productivity.
- **In scope:** Chrome extension that allows managing a list of websites to block - specific domains or subdomains.
- **Out of scope:** More advanced features like focus timers, time-based blocks etc.
- **Success looks like:** User can configure blocked websites. When user navigates to such website he is presented with an info page that website is blocked.

## 2. Context & Constraints

N/A

## 3. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | The extension shall allow managing blocked websites list. | H |
| F2 | Disabling blocking should not be too easy - there should be a popup that asks for confirmation before disabling. | H |
| F3 | The disabling blocking confirmation popup should ask "Are you sure?" with a tip below, e.g. "Tip: taking a walk is a great way to boost your productivity". | H |
| F4 | There should be a curated list of science-backed "tips", first focus on these related to doom-scrolling, internet addictions etc. and healthier way of stress reduction, taking work breaks etc. | M |

## 4. Quality & Interfaces

| ID | Requirement | Priority |
|----|-------------|----------|
| Q1 | The main interface should be only one UI page, e.g. only options page. No additional popups/popovers. Simple, intuitive, modern UI. | H |
| Q2 | The extension shall open options page when its item/icon in extensions menu/icons list is clicked (instead of popup). | M |
| Q3 | List of blocked websites should be a list view with fixed height, scrollable when items are overflowing. | M |
| Q4 | Navigations to blocked websites should display a 'blocked' page instead within ~1 second after enabling blocking. | M |
| Q5 | The UI should be built using modern design system. | H |
| Q6 | The app color theme should speak: productivity, focus, intelligence, clarity, health. | H |
| Q7 | Code will be open-sourced. It should be elegant, simple and follow software engineering best practices. | M |

## 5. Acceptance & Open Questions

**Acceptance:** how each requirement is proven. Default methods: Test (automated),
Demo (manual walkthrough), Inspection (read the code/config), Analysis (measurement/model).

| Req ID | Method | Evidence |
|--------|--------|----------|
| F1 | Unit tests | All tests pass |
| F2 | Playwright test suite | All tests pass |
| F3 | Isolated adversarial code review with code reviewer sub-agent | Review report |
