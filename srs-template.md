# SRS: <Product Name>

> Status: Draft | Owner: <name> | Last updated: <YYYY-MM-DD>
>
> Rules: every requirement gets an ID, a priority (M=must / S=should / C=could), and is
> testable. If you can't write a pass/fail check for it, it's not a requirement — it's a goal.
> Delete any line you can't fill in. Empty sections are better than filler.

## 1. Overview

- **Problem:** <what's broken today, in 1–2 sentences>
- **Solution:** <what this product does, in 1–2 sentences>
- **Users:** <who uses it, and what they know/can't be expected to know>
- **In scope:** <bullet list of what ships>
- **Out of scope:** <bullet list of what explicitly does not ship — this is the important half>
- **Success looks like:** <1–3 measurable outcomes, e.g. "user blocks a site in <10s">

## 2. Context & Constraints

- **Assumptions:** <things taken as true; if one breaks, requirements change>
- **Dependencies:** <systems, APIs, teams, data you don't control>
- **Constraints:** <platform, language, budget, deadline, legal/regulatory, existing systems>
- **Glossary:** <only terms a new reader would misread — 5 entries max>

## 3. Functional Requirements

What the system does. One row per behavior, phrased as "The system shall …".

| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | The system shall <observable behavior>. | M |
| F2 | When <trigger>, the system shall <response>. | M |
| F3 | If <error condition>, the system shall <recovery/message>. | S |

Group with subheadings (`### 3.1 <Area>`) once you pass ~15 rows.

## 4. Quality & Interfaces

Only the attributes that actually constrain the design. Numbers, not adjectives.

| ID | Requirement | Priority |
|----|-------------|----------|
| Q1 | <Action> shall complete in under <N> ms at <load>. | M |
| Q2 | The system shall <security requirement: authn, authz, data at rest/in transit>. | M |
| Q3 | The system shall run on <platforms/versions>. | M |
| Q4 | The system shall expose/consume <interface: UI, API, file format, hardware>. | S |
| Q5 | The system shall comply with <standard/regulation> — <specific clause>. | M |

## 5. Acceptance & Open Questions

**Acceptance:** how each requirement is proven. Default methods: Test (automated),
Demo (manual walkthrough), Inspection (read the code/config), Analysis (measurement/model).

| Req ID | Method | Evidence |
|--------|--------|----------|
| F1 | Test | <test name or file> |
| Q1 | Analysis | <benchmark / load-test report> |

**Open questions:** <question — owner — needed by date>. Resolve or delete before sign-off.
