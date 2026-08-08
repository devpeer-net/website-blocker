# Website Blocker — Implementation Brief (Chrome MV3, open source)

Authoritative decisions. Everything the fact-checkers refuted has been dropped or corrected. Claims that survived only as mailing-list folklore are marked **[VERIFY]** and are assigned to a spike, not to the design.

---

## 1. Architecture

### Modules

| File | Responsibility |
|---|---|
| `public/manifest.json` | Hand-written, committed, greppable. The single source of truth for permissions. Copied verbatim by Vite. |
| `src/core/domain.ts` | **Pure.** `normalizeDomain(input) -> Domain \| null`, `covers(parent, host)`. No `chrome.*`. |
| `src/core/blocklist.ts` | **Pure.** `addSite`, `removeSite`, dedupe, subdomain absorption, `willFitInSyncQuota`. |
| `src/core/rules.ts` | **Pure.** `buildRules(domains, {paused, blockedPageUrl}) -> chrome.declarativeNetRequest.Rule[]`. Plain objects in, plain objects out. |
| `src/core/tips.ts` | **Pure.** Frozen tips corpus (§5) + `pickTip(seed)`. |
| `src/platform/storage.ts` | Thin `chrome.storage` wrapper. `getBlocklist`, `setBlocklist`, `getPaused`, `setPaused`, `getStatus`. |
| `src/platform/sync.ts` | `syncRules()` — the only writer of dynamic rules. Validation, `try/catch`, error surfacing, open-tab sweep. |
| `src/platform/permissions.ts` | `hasHostAccess()`, `onHostAccessChanged()`. Drives the degraded-mode banner. |
| `src/background/index.ts` | Service worker. Top-level synchronous listener registration only. |
| `src/options/index.html` + `main.tsx` | The UI surface. Preact. Writes storage; never messages the SW. |
| `src/options/components/{BlockList,AddSiteForm,BlockingToggle,ConfirmDialog,StatusBanner}.tsx` | |
| `src/blocked/index.html` + `main.ts` | The block page. No framework, no bundler magic, `textContent` only. |
| `src/styles/tokens.css`, `src/styles/app.css` | Design tokens + `@import "tailwindcss"`. |

**Hard boundary:** `src/core/**` must not contain the identifier `chrome`. Enforced by a Vitest purity test (§4), not by a lint config — it also catches `globalThis.chrome` and polyfill imports.

### Data flow: options edit → navigation blocked

```
1. User types "https://WWW.Reddit.com/r/all" and clicks Add
       │
2. AddSiteForm -> blocklist.addSite(list, input)
       │  normalizeDomain -> "reddit.com"; absorbs "old.reddit.com" if present
       │  throws InvalidDomainError -> inline field error, nothing written
       ▼
3. storage.setBlocklist(next)  ->  chrome.storage.sync.set({ blocked: next })
       │  (debounced 250 ms; sync allows only 120 writes/min)
       ▼
4. chrome.storage.onChanged fires in EVERY extension context, including a
   cold-started service worker. No runtime.sendMessage anywhere.
       ▼
5. background/index.ts -> sync.syncRules()
       a. read storage.sync.blocked + storage.local.paused
       b. partition entries into valid / invalid (per-entry, before the API call)
       c. rules = core/rules.buildRules(valid, {paused, blockedPageUrl})
       d. existing = getDynamicRules()
       e. updateDynamicRules({ removeRuleIds: existing.map(r=>r.id), addRules: rules })
          — atomic; removals processed before additions; ids are index-derived,
            so reuse in one call is safe
       f. on rejection: storage.local.lastSyncError = message  (options page renders it)
       g. sweepOpenTabs(): any open tab whose host is now covered is redirected
          to blocked.html — covers SPA/pushState pages that issue no request
       ▼
6. Rules now live in the BROWSER, not the extension process. The service worker
   may terminate (30 s idle) with zero effect on blocking.
       ▼
7. User navigates to https://old.reddit.com/
       │  main_frame request hits the network stack
       │  redirect rule (priority 2) matches requestDomains ["reddit.com"]
       ▼
8. chrome-extension://<id>/blocked.html#https://old.reddit.com/
       blocked/main.ts parses the hash, validates it against the blocklist,
       renders the host with textContent, shows a tip.
```

The options page's **only** channel to the blocking engine is `chrome.storage`. This gives one code path for local edits, sync-pushed edits from another device, and startup — and it is why no message passing exists in this codebase.

---

## 2. Blocking mechanism

### 2.1 Permission strategy — `declarativeNetRequest` (plain), not `WithHostAccess`

This is the most consequential decision and it inverts the naive answer.

- `declarativeNetRequestWithHostAccess` has no install warning, but grants nothing on its own: rules apply only where you hold host permission. Chrome lets the user set an extension to **"on click" / "on specific sites"** at any moment. In that state every `WithHostAccess` rule — including the pause `allow` rule — silently stops applying. No error, no event. The blocker becomes a no-op.
- Plain `declarativeNetRequest` triggers the install warning **"Block content on any page."** and grants *implicit* access for `allow`, `allowAllRequests`, and `block` rules — with **zero** host permissions. (`upgradeScheme` is in the *safe-rules* set, not the implicit-access set; the two lists differ.)

**Decision:** declare `declarativeNetRequest` **plus** `host_permissions: ["<all_urls>"]`, and emit **two rules per domain chunk**:

| Rule | Priority | Action | Needs host permission? | Effect |
|---|---|---|---|---|
| Redirect | 2 | `redirect` (unsafe, 5 000 cap) | yes | Custom block page with the original URL |
| Block | 1 | `block` (safe, 30 000 cap) | **no** (implicit) | `ERR_BLOCKED_BY_CLIENT` fallback |

With host access, the priority-2 redirect wins. With host access withheld, the redirect cannot apply and the priority-1 `block` still fires. The product degrades to an ugly interstitial instead of dying silently. **[VERIFY-1]** that an inapplicable higher-priority redirect falls through to the lower-priority block rather than suppressing it; if it does not, invert to two rule *sets* toggled by `permissions.contains()`.

Additionally: `permissions.onRemoved` / `onAdded` listeners flip a `StatusBanner` in the options page ("Blocking is degraded — Chrome site access is restricted to *on click*. Set it back to *On all sites*.").

`optional_host_permissions` + per-site prompts was considered and rejected: it costs a prompt per added site and requires reconciling granted origins against the stored list forever.

### 2.2 Exact rule shape

One redirect rule and one block rule per **chunk of 500 domains** — not one rule per entry. `requestDomains` and `regexFilter` coexist in a single condition, so the full original URL is carried by `regexSubstitution` at a cost of one unsafe rule per 500 sites.

```json
[
  {
    "id": 1,
    "priority": 100,
    "action": { "type": "allow" },
    "condition": { "resourceTypes": ["main_frame"] },
    "_comment": "present ONLY while paused"
  },
  {
    "id": 1000,
    "priority": 2,
    "action": {
      "type": "redirect",
      "redirect": {
        "regexSubstitution": "chrome-extension://abcdefghijklmnopabcdefghijklmnop/blocked.html#\\0"
      }
    },
    "condition": {
      "requestDomains": ["reddit.com", "news.ycombinator.com", "x.com"],
      "regexFilter": "^https?://.*",
      "resourceTypes": ["main_frame"]
    }
  },
  {
    "id": 1001,
    "priority": 1,
    "action": { "type": "block" },
    "condition": {
      "requestDomains": ["reddit.com", "news.ycombinator.com", "x.com"],
      "resourceTypes": ["main_frame"]
    }
  }
]
```

Notes that are load-bearing:

- **`resourceTypes: ["main_frame"]` is mandatory.** Verbatim from the docs: *"If neither of them is specified, all resource types except 'main_frame' are blocked."* Omitting it produces a blocker that blocks images and XHR but not pages. This is the single highest-value line in the whole design.
- `requestDomains` does true label-boundary suffix matching: `reddit.com` matches `reddit.com`, `www.reddit.com`, `old.reddit.com`; it does **not** match `notreddit.com` or `reddit.com.evil.com`. Entries **must** be lowercase ASCII / punycode; an uppercase character causes `updateDynamicRules` to *reject the whole atomic call*, not to under-match.
- `urlFilter` is not used. If it ever is, only `"||reddit.com^"` is correct — `"||reddit.com"` matches `reddit.com.evil.com`.
- `regexFilter: "^https?://.*"` makes `\0` the entire URL, so the substitution result is exactly `<blocked.html>#<original url>`. A fragment, not a query param: `?url=https://reddit.com/?a=b&c=d` would silently split `&c=d` into a separate parameter of *your* page. `location.hash.slice(1)` is lossless, and the matched URL never contains a fragment (fragments are not sent on the wire).
- `redirect.extensionPath` with a query string is **not** used. The docs say only *"Path relative to the extension directory. Should start with '/'."* — query-string support is mailing-list folklore. `regexSubstitution` is documented.
- Regex rules have their own cap (`MAX_NUMBER_OF_REGEX_RULES` = 1 000). At 500 domains/chunk that is 500 000 domains — irrelevant.
- Do **not** add `sub_frame`. An embedded Reddit iframe on an unrelated page would be replaced by a full-page block screen. If embed suppression is wanted later, add a separate `block` rule scoped to `sub_frame` — `block` is safe and free.

### 2.3 Domain normalization rule (stated once, obeyed everywhere)

> **The canonical form of an entry is the WHATWG-parsed hostname, lowercased and punycoded by the platform URL parser, with a trailing root dot removed and exactly one leading `www.` label stripped. No other label is ever stripped. No Public Suffix List.**

```ts
// src/core/domain.ts
export type Domain = string; // canonical: lowercase ASCII/punycode host, no port, no trailing dot

export function normalizeDomain(input: string): Domain | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^\*\.?/, "");                                  // "*.reddit.com" -> "reddit.com"
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = "https://" + s;

  let u: URL;
  try { u = new URL(s); } catch { return null; }                // no URL.parse -> Chrome floor stays 121
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  let h = u.hostname.replace(/\.$/, "");
  if (h.startsWith("www.")) h = h.slice(4);
  if (h.startsWith("[")) return h;                              // IPv6 literal, already canonical
  if (!h.includes(".")) return null;                            // reject "reddit", "localhost"
  if (!/^[a-z0-9.-]+$/.test(h)) return null;                    // DNR demands lowercase ASCII
  return h;
}

export const covers = (parent: Domain, host: Domain): boolean =>
  host === parent || host.endsWith("." + parent);
```

Why this is sufficient: `new URL()` lowercases the host, converts IDN to Punycode (`münchen.de` → `xn--mnchen-3ya.de`), brackets and canonicalizes IPv6, and strips scheme/port/credentials/path/query/fragment. That is exactly the form `requestDomains` demands. Shipping a punycode library or a 200 KB PSL would be disproportionate; the only thing a PSL buys is refusing `co.uk`, which is the user typing precisely what they asked for.

List semantics, stated so the tests can assert them:

```ts
// src/core/blocklist.ts
export function addSite(list: Domain[], input: string): Domain[] {
  const d = normalizeDomain(input);
  if (!d) throw new InvalidDomainError(input);
  if (list.some(p => covers(p, d))) return list;                 // already covered by a parent
  return [...list.filter(c => !covers(d, c)), d].sort();         // adding a parent absorbs children
}
export const removeSite = (list: Domain[], input: string): Domain[] => {
  const d = normalizeDomain(input);
  return d ? list.filter(x => x !== d) : list;
};
```

### 2.4 Rule construction and the sync loop

```ts
// src/core/rules.ts  — PURE
export const PAUSE_RULE_ID = 1;
export const RULE_ID_BASE = 1000;
export const CHUNK_SIZE = 500;

export function buildRules(
  domains: Domain[],
  o: { paused: boolean; blockedPageUrl: string },
): chrome.declarativeNetRequest.Rule[] {
  const rules: chrome.declarativeNetRequest.Rule[] = [];

  if (o.paused) {
    rules.push({
      id: PAUSE_RULE_ID, priority: 100,
      action: { type: "allow" },
      condition: { resourceTypes: ["main_frame"] },
    });
  }

  for (let i = 0; i * CHUNK_SIZE < domains.length; i++) {
    const requestDomains = domains.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    rules.push({
      id: RULE_ID_BASE + i * 2, priority: 2,
      action: { type: "redirect",
                redirect: { regexSubstitution: `${o.blockedPageUrl}#\\0` } },
      condition: { requestDomains, regexFilter: "^https?://.*", resourceTypes: ["main_frame"] },
    });
    rules.push({
      id: RULE_ID_BASE + i * 2 + 1, priority: 1,
      action: { type: "block" },
      condition: { requestDomains, resourceTypes: ["main_frame"] },
    });
  }
  return rules;
}
```

```ts
// src/platform/sync.ts
export async function syncRules(): Promise<void> {
  const { blocked = [] } = await chrome.storage.sync.get("blocked");
  const { paused = false } = await chrome.storage.local.get("paused");

  // Per-entry validation BEFORE the atomic call. One bad entry would otherwise
  // reject the whole update, leaving the previous rule set live and the user's
  // edit silently ineffective.
  const valid: Domain[] = [];
  const invalid: string[] = [];
  for (const e of blocked) {
    const d = typeof e === "string" ? normalizeDomain(e) : null;
    (d ? valid : invalid).push(d ?? String(e));
  }

  const rules = buildRules(valid, {
    paused,
    blockedPageUrl: chrome.runtime.getURL("blocked.html"),
  });

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map(r => r.id),   // ALWAYS the full existing set
      addRules: rules,
    });
  } catch (err) {
    await chrome.storage.local.set({ lastSyncError: String(err), invalidEntries: invalid });
    return;                                     // never leave an unhandled rejection in the SW
  }
  await chrome.storage.local.set({
    lastSyncError: null, invalidEntries: invalid, rulesAppliedAt: Date.now(),
  });
  await sweepOpenTabs(valid, paused);
}
```

`updateDynamicRules` is atomic ("either all specified rules are added and removed, or an error is returned") and processes removals before additions, so index-derived IDs can be reused inside one call. Dynamic rules persist across browser sessions and extension updates, so `chrome.storage` is the sole source of truth and rules are pure derived state. Never hash domains into IDs — collisions are silent.

### 2.5 Enable/disable strategy

A single reserved dynamic `allow` rule, id `1`, priority `100`, added on pause and removed on resume — one `updateDynamicRules` call either way.

- `allow` and `allowAllRequests` sit at the *same* top tier of the documented action ordering: `allow`/`allowAllRequests` > `block` > `upgradeScheme` > `redirect`. `priority: 100` makes the intent explicit rather than relying on tie-breaks.
- `allow` is a **safe** action, so pause costs nothing against the 5 000 unsafe budget **and works with zero host permissions** — pause must never be the thing that breaks in degraded mode.
- Session rules are rejected for pause: they are cleared on browser shutdown **and when a new version of the extension is installed**, so an auto-update would silently un-pause a paused user.
- `updateEnabledRulesets` is rejected: it requires a static, shipped rule file; the list is user-editable.
- `paused` lives in `storage.local`, not `sync`. Pausing on your laptop must not unblock your desktop.
- Latency is not asserted. No documented figure exists for `updateDynamicRules`; the ≤1 s requirement is *measured* in E2E (§4), not assumed.

### 2.6 Rule-limit handling

| Constant | Value |
|---|---|
| `MAX_NUMBER_OF_DYNAMIC_RULES` | 30 000 |
| `MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES` | **5 000** |
| `MAX_NUMBER_OF_REGEX_RULES` | 1 000 |
| `MAX_NUMBER_OF_SESSION_RULES` / unsafe | 5 000 / 5 000 |
| `GUARANTEED_MINIMUM_STATIC_RULES` | 30 000 |

Safe actions are `block`, `allow`, `allowAllRequests`, `upgradeScheme`. **`redirect` is unsafe** → the 5 000 cap, not 30 000. At 500 domains per redirect rule the DNR caps are unreachable.

The **real** cap is `storage.sync`'s `QUOTA_BYTES_PER_ITEM` = 8 192 bytes, accounted as the JSON-serialized value *plus the key length*. Do not guess an entry count — measure:

```ts
export const willFitInSyncQuota = (list: Domain[]) =>
  new Blob([JSON.stringify(list)]).size + "blocked".length < 8_000;
```

`AddSiteForm` refuses the add and offers "Move my list to local storage (this device only)" when this returns false. Over-quota `set` calls fail immediately and reject the promise — always `await` and catch. Also debounce writes: `MAX_WRITE_OPERATIONS_PER_MINUTE` is 120 and a live-editing textarea blows through it.

### 2.7 The exact `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Blocklist",
  "version": "1.0.0",
  "description": "Block distracting websites. No tracking, no network calls, no accounts.",
  "minimum_chrome_version": "121",
  "icons": { "16": "icons/16.png", "32": "icons/32.png", "48": "icons/48.png", "128": "icons/128.png" },

  "permissions": ["declarativeNetRequest", "storage"],
  "host_permissions": ["<all_urls>"],

  "background": { "service_worker": "background.js", "type": "module" },

  "action": {
    "default_title": "Blocklist",
    "default_icon": { "16": "icons/16.png", "32": "icons/32.png", "128": "icons/128.png" }
  },

  "options_ui": { "page": "options.html", "open_in_tab": true },

  "web_accessible_resources": [
    { "resources": ["blocked.html"], "matches": ["<all_urls>"] }
  ],

  "incognito": "spanning"
}
```

Every field justified:

- **No `default_popup`.** Verbatim: *"This event will not fire if the action has a popup."* Setting it makes `chrome.action.onClicked` dead code with no error.
- **`options_ui.open_in_tab: true`.** With `false` the page is embedded in `chrome://extensions`, where *"the Tabs API cannot be used"* and message senders have no `tab` — fatal for the tab sweep and for testing.
- **`web_accessible_resources` is mandatory** for the redirect target: *"A declarativeNetRequest rule cannot redirect from a public resource request to a resource that is not web accessible… This is true even if the specified web accessible resource is owned by the redirecting extension."* Only `blocked.html` needs listing; once it is the top-level document, its own CSS/JS are same-origin extension sub-resources. Do **not** set `use_dynamic_url`. Accept that any site can probe the extension's ID — this is a known, closed-as-won't-change platform issue (w3c/webextensions#604, dup of #610, opposed by both Chrome and Firefox).
- **`minimum_chrome_version: "121"`** — `requestDomains` needs 101, the 30 000 safe-rule quota needs 121. `URL.parse` (126) is deliberately avoided so the floor stays at 121.
- **`incognito: "spanning"`** so one `storage.local` state and one rule set serve both modes. The extension is still *off* in incognito by default; `chrome.extension.isAllowedIncognitoAccess()` drives a "Allow in incognito to prevent the obvious bypass" hint in the options page.
- **No `content_security_policy` key.** The default `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'` cannot be relaxed and is already correct. Adding `style-src 'self'` is the one available self-inflicted wound — it would break inline style attributes for no gain.
- **No `key`.** A self-generated key pins an ID that will not match the Web Store item. The test harness injects one into `dist/` (§4); the packaged upload must not contain it.
- **No `declarativeNetRequestFeedback`.** It triggers a "Read your browsing history" warning and only works unpacked. Development only, via a local manifest patch.
- **No `default_locale` / `_locales`** for v1 (English only, stated in README).

### 2.8 The block page — the security-critical file

`blocked.html` runs on the extension origin and renders attacker-influenced input (the hash is derived from the URL the user navigated to). An `innerHTML` sink here is an extension-privileged XSS.

```ts
// src/blocked/main.ts
import { normalizeDomain, covers } from "../core/domain";
import { pickTip } from "../core/tips";

const raw = decodeURIComponent(location.hash.slice(1));
let host = "";
try {
  const u = new URL(raw);
  if (u.protocol === "http:" || u.protocol === "https:") host = u.hostname;
} catch { /* ignore */ }

// Defence in depth: only render a host we actually blocked.
const { blocked = [] } = await chrome.storage.sync.get("blocked");
const known = (blocked as string[]).some(p => {
  const d = normalizeDomain(p); const h = normalizeDomain(host);
  return d && h && covers(d, h);
});

document.getElementById("host")!.textContent = known ? host : "this site"; // textContent, ALWAYS
const tip = pickTip(Date.now());
document.getElementById("tip-text")!.textContent = tip.text;
const cite = document.getElementById("tip-source") as HTMLAnchorElement;
cite.textContent = tip.source;
cite.href = tip.url;            // corpus-controlled, never user input

history.replaceState(null, "", location.pathname);  // stop leaking the URL into the omnibox
```

No `innerHTML`, no `insertAdjacentHTML`, no template interpolation into markup, no `href` derived from `raw`, no "continue anyway" link.

---

## 3. UI stack decision

| Layer | Choice | Beat its runner-up because |
|---|---|---|
| Build | **Vite 8 + hand-written `manifest.json`**, multi-page `rollupOptions.input` | Beats **WXT** because a blocker's `manifest.json` is the first file a security reviewer opens and it must be a committed file, not a generated artifact of a DSL (WXT also declares `engines.node >= 22` and ships 156 transitive packages). |
| Framework | **Preact 10** | Beats **React 19** because declarative rendering of a mutable list costs one runtime dependency instead of a `react` + `react-dom` pair, with an identical API surface for contributors. |
| Components | **Native `<dialog>` + `showModal()`** | Beats **shadcn/ui + Base UI** because it delivers focus trap, inertness, `aria-modal`, and `::backdrop` for zero bytes and zero vendored source — and `closedby="none"` gives the deliberately-hard-to-dismiss behaviour that Radix requires three intercepted handlers to fake. |
| Styling | **Tailwind CSS v4 via `@tailwindcss/vite`** | Beats **plain CSS modules** because it is a build-time compiler emitting one static, CSP-clean stylesheet with no PostCSS config and no runtime. |
| Types | **`chrome-types`** | Beats **`@types/chrome`** because it is Google-published and regenerated daily from the canonical Chromium IDL, and this extension's entire job is manifest/permission correctness. |
| Lint/format | **Biome** | Beats **ESLint + Prettier** because one dev dependency and one config file replace five packages and two configs in a 15-file repo. |
| Unit test | **Vitest**, `environment: 'node'` | Beats **Vitest + `@webext-core/fake-browser`** because the domain logic is pure by construction, so there is nothing to fake. |
| E2E | **Playwright**, `launchPersistentContext` + `channel: 'chromium'` | Beats **Puppeteer** because it is the only harness with a documented, currently-working headless extension path (§4). |
| Fonts | **Inter Variable** (UI) + **JetBrains Mono Variable** (the domain list) | Both SIL OFL 1.1 and **bundled locally** — a website blocker that pings `fonts.gstatic.com` with the user's IP every time they open their blocklist is indefensible, CSP permission notwithstanding. |

Monospace for the blocklist is the single highest-value typographic decision here: domains are identifiers, and `reddit.com` vs `redditt.com` must be distinguishable at a glance.

**Dev-loop note.** `vite dev` cannot serve extension pages under MV3 CSP without a localhost script source in an unpacked-only manifest — don't. Use `vite build --watch` plus Chrome's reload button (~2 s loop). For real HMR during design work, put every `chrome.*` call behind `src/platform/*`, render the options page as a plain web page at `localhost:5173` against an in-memory implementation, and reuse that same implementation as the test double.

### Design tokens

Three-block theme structure so an in-app toggle wins in both directions and the default "system" state resolves correctly.

```css
/* src/styles/tokens.css */
:root {
  --bg:            #F7F9FC;  /* cool near-white; kills glare over a long session */
  --surface:       #FFFFFF;
  --surface-2:     #EEF2F8;  /* hover rows, scroll track of the blocklist */
  --border:        #DDE4EE;
  --border-strong: #C6D0DE;  /* input borders must be findable */
  --fg:            #0D1526;  /* 17.3:1, blue-cast near-black */
  --fg-muted:      #55637A;  /* 5.8:1 — muted, still AA */
  --primary:       #3A47D1;  /* focus indigo, 7.0:1, AAA */
  --primary-hover: #2F3AB2;
  --primary-fg:    #FFFFFF;
  --ring:          #3A47D1;  /* 2px outline + 2px offset, never removed */
  --accent:        #0E7C6B;  /* vital teal, 5.1:1 — ONLY for "blocking is active" */
  --accent-soft:   #E3F5F1;
  --warning:       #A45B06;  /* 5.2:1 — the "blocking is OFF" banner */
  --danger:        #C0201F;  /* 6.1:1 — destructive only */
  --radius:        10px;
  --font-sans:     'Inter Variable', system-ui, sans-serif;
  --font-mono:     'JetBrains Mono Variable', ui-monospace, monospace;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --bg: #0A0F1C; --surface: #121A2B; --surface-2: #182237;
    --border: #24314A; --border-strong: #33425E;
    --fg: #E9EFF9; --fg-muted: #97A6BF;
    --primary: #98A4FF; --primary-hover: #B3BCFF; --primary-fg: #0A0F1C; --ring: #98A4FF;
    --accent: #3FD9C0; --accent-soft: #10312F;
    --warning: #F5B93C; --danger: #FF8785;
  }
}
:root[data-theme='dark'] {
  --bg: #0A0F1C; --surface: #121A2B; --surface-2: #182237;
  --border: #24314A; --border-strong: #33425E;
  --fg: #E9EFF9; --fg-muted: #97A6BF;
  --primary: #98A4FF; --primary-hover: #B3BCFF; --primary-fg: #0A0F1C; --ring: #98A4FF;
  --accent: #3FD9C0; --accent-soft: #10312F;
  --warning: #F5B93C; --danger: #FF8785;
}
```

```css
/* src/styles/app.css */
@import "tailwindcss";
@import "./tokens.css";
@theme inline {
  --color-bg: var(--bg);           --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-border: var(--border);   --color-border-strong: var(--border-strong);
  --color-fg: var(--fg);           --color-fg-muted: var(--fg-muted);
  --color-primary: var(--primary); --color-accent: var(--accent);
  --color-warning: var(--warning); --color-danger: var(--danger);
  --font-sans: var(--font-sans);   --font-mono: var(--font-mono);
}
```

Confirm dialog markup (the whole component, minus Preact wiring):

```html
<dialog id="confirm" closedby="none" aria-labelledby="confirm-title">
  <h2 id="confirm-title">Turn blocking off?</h2>
  <p data-testid="tip"><span id="tip-text"></span> <a id="tip-source"></a></p>
  <form method="dialog">
    <button value="cancel" autofocus>Cancel</button>
    <button value="disable" class="danger">Yes, disable</button>
  </form>
</dialog>
```

`closedby="none"` means Escape and backdrop clicks do nothing — the requirement is that disabling should not be easy. `autofocus` sits on the safe action.

---

## 4. Testing strategy

### 4.1 Unit-tested: the pure core only

`environment: 'node'`, no jsdom, no chrome mock, no testing-library. `sinon-chrome` is explicitly banned (last actually published 2019-04-01; callback-era stubs that make you assert on *calls* rather than *outcomes*).

- `domain.test.ts` — the normalization table, including `'  HTTPS://WWW.Reddit.COM/r/all?x=1  ' -> 'reddit.com'`, `'Reddit.com.' -> 'reddit.com'`, `'bücher.example' -> 'xn--bcher-kva.example'`, `'http://news.ycombinator.com:8080/' -> 'news.ycombinator.com'`, and null for `''`, `'reddit'`, `'localhost'`, `'not a host'`, `'javascript:alert(1)'`, `'...'`.
- `domain.test.ts` — `covers()`: `covers('reddit.com','old.reddit.com')` true; `covers('reddit.com','notreddit.com')` false; `covers('reddit.com','reddit.com.evil.com')` false.
- `blocklist.test.ts` — dedupe, parent absorbs children, child under existing parent is a no-op, `addSite` is pure (input array unmutated), `removeSite` idempotent and normalizing, `willFitInSyncQuota` boundary.
- `rules.test.ts` — snapshot the exact JSON of §2.2; assert every rule has `resourceTypes: ["main_frame"]`; assert every `id >= 1` and all ids unique; assert chunking at 501 domains yields 4 rules; assert the pause rule appears only when `paused`.
- `tips.test.ts` — corpus non-empty, texts unique, every entry has all four fields, every `url` is a resolvable `https://doi.org/` URI, `pickTip` is deterministic for a fixed seed.
- `purity.test.ts` — reads every file under `src/core/` and asserts `!/\bchrome\s*\./.test(src)` and no import of `webextension-polyfill`. A lint rule on the `chrome` global would miss `globalThis.chrome` and `(window as any).chrome`.

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/core/**'],
                thresholds: { lines: 95, branches: 90, functions: 100, statements: 95 } },
  },
});
```

`src/platform/*` is deliberately *not* unit-tested — it has no branching worth mocking and is fully covered by E2E.

### 4.2 E2E-tested

Options CRUD end-to-end (proving normalization runs in the real UI), the confirmation modal (cancel keeps rules, confirm withdraws them), real navigation landing on `blocked.html`, a control domain that must still load, and the ≤1 s rule-application budget.

### 4.3 Headless or xvfb?

**Headless works — with `channel: 'chromium'`, and only with it.** Playwright's own docs: *"Note the use of the `chromium` channel that allows to run extensions in headless mode."* Plain `chromium` launches `chromium-headless-shell`, which has no extension support; `channel: 'chromium'` selects the full browser running Chrome's new headless.

`channel: 'chrome'` is dead: Chrome 137 removed `--load-extension` and Chrome 139 removed `--disable-extensions-except` in branded builds. The flags survive in **Chromium and Chrome for Testing only** (not ChromeOS — that ships branded Chrome). Consequently `playwright.config.ts` must have **no** `projects` entry using `devices['Desktop Chrome']`, which would set `channel: 'chrome'`.

**xvfb is not needed** on Linux/WSL2 or on `ubuntu-latest`. It is the fallback for `HEADED=1` on a machine without WSLg, via `xvfb-run -a --server-args="-screen 0 1280x800x24"`. Do not make it the default — it spawns a pointless X server and hides failures behind an extra process.

### 4.4 The Playwright extension fixture

Extension ID is derived from the manifest `key`, injected into `dist/` by the test build only — never committed to `public/manifest.json`, because a self-generated key pins an ID that will not match the Web Store item. Production IDs come from the Developer Dashboard's **Package → View public key**.

```ts
// tests/e2e/extension-id.ts
import { createHash } from 'node:crypto';

/** Chrome's ID algorithm: SHA-256(DER SPKI) -> first 16 bytes -> hex -> 0-9a-f mapped to a-p. */
export function idFromKey(base64Key: string): string {
  return [...createHash('sha256').update(Buffer.from(base64Key, 'base64')).digest().subarray(0, 16)]
    .map(b => b.toString(16).padStart(2, '0')).join('')
    .replace(/[0-9a-f]/g, c => String.fromCharCode(97 + parseInt(c, 16)));
}
```

```ts
// tests/e2e/fixtures.ts
import { test as base, chromium, expect as pwExpect,
         type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { idFromKey } from './extension-id';
import { startFakeWeb, type FakeWeb } from './fake-web';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

type Fixtures = { context: BrowserContext; extensionId: string; optionsPage: Page };
type WorkerFixtures = { fakeWeb: FakeWeb };

export const test = base.extend<Fixtures, WorkerFixtures>({
  // One HTTP server per Playwright worker -> unique port -> safe parallelism.
  fakeWeb: [async ({}, use) => {
    const s = await startFakeWeb(); await use(s); await s.close();
  }, { scope: 'worker' }],

  context: async ({ fakeWeb }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',                       // REQUIRED: full Chromium, new headless
      headless: process.env.HEADED !== '1',      // NOT `!process.env.HEADED` — "0" is truthy
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        // ONE comma-separated flag, last-one-wins. Scoped to *.test: `MAP *` breaks
        // Chrome's own network calls. The :port suffix rewrites the socket port too.
        `--host-resolver-rules=MAP *.test 127.0.0.1:${fakeWeb.port}`,
        // NOTE: do NOT add --disable-features here. Playwright already passes its own
        // --disable-features (which includes HttpsUpgrades); Chromium's CommandLine is a
        // map keyed by switch name, so a second one REPLACES Playwright's and silently
        // re-enables PaintHolding, MediaRouter, Translate, ... breaking the harness.
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    const { key } = JSON.parse(
      readFileSync(path.join(EXTENSION_PATH, 'manifest.json'), 'utf8')) as { key: string };
    const id = idFromKey(key);                    // deterministic; no serviceworker race
    // Health check: proves the extension actually loaded, which the pinned ID otherwise hides.
    const probe = await context.newPage();
    await probe.goto(`chrome-extension://${id}/options.html`);
    pwExpect(await probe.evaluate(() => chrome.runtime.id)).toBe(id);
    await probe.close();
    await use(id);
  },

  // Always a NEW page: under UI mode the built-in `page` fixture reuses pages()[0],
  // so specs taking both `page` and `optionsPage` would drive one tab.
  optionsPage: async ({ context, extensionId }, use) => {
    const p = await context.newPage();
    await p.goto(`chrome-extension://${extensionId}/options.html`);
    await use(p);
    await p.close();
  },
});
export const expect = test.expect;
```

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,     // each persistent context is heavy
  retries: process.env.CI ? 2 : 0,
  timeout: 30_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'on-first-retry', screenshot: 'only-on-failure' },
  // No `projects`/`devices` — devices['Desktop Chrome'] sets channel:'chrome', which
  // cannot side-load extensions. The context fixture owns the launch entirely; note
  // that `use.headless`/`--headed` therefore do NOT apply. Use HEADED=1.
});
```

`launchPersistentContext('')` allocates a fresh temp profile per test, so `storage.local`, `storage.sync` and dynamic rules never leak between tests. That isolation is load-bearing — and it is also why the suite is slow.

### 4.5 Fake-domain approach

A real hostname on the reserved `.test` TLD (RFC 6761/2606), resolved to a local server. Not "block localhost:PORT" — `localhost` plus a port is a degenerate case the normalizer legitimately rejects, and it would force port-bearing rule shapes that never ship.

```ts
// tests/e2e/fake-web.ts
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export type FakeWeb = { port: number; close(): Promise<void> };

export async function startFakeWeb(): Promise<FakeWeb> {
  const server = http.createServer((req, res) => {
    const host = (req.headers.host ?? 'unknown').split(':')[0];
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><title>${host}</title><h1 id="real-site">REAL SITE: ${host}</h1>`);
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  return { port: (server.address() as AddressInfo).port,
           close: () => new Promise<void>(r => server.close(() => r())) };
}
```

`distraction.test` is the blocked subject; `allowed.test` is the control that proves the harness is live and the block was rule-caused rather than DNS-caused.

### 4.6 Deterministic waiting on rules

Two probes, both run from the **options page**, not from the service worker. A Playwright `Worker` handle survives MV3 idle suspension, but `evaluate()` calls already in flight at the moment of suspension **throw `"Service worker restarted"`** — an extension page has no such semantics.

- `getDynamicRules()` proves the write landed. Necessary, not sufficient.
- `testMatchOutcome()` queries the **live matcher** for a concrete URL. Chrome 103+, unpacked-only, no extra permission — exactly our situation.

Because `matchedRules` reports *any* matching rule including `allow`, the helper must inspect rule **IDs** against the deterministic allocation from §2.4, not merely count matches.

```ts
// tests/e2e/dnr.ts
import { expect, type Page } from '@playwright/test';
import { PAUSE_RULE_ID, RULE_ID_BASE } from '../../src/core/rules';

async function probe(page: Page, url: string): Promise<'blocked' | 'allowed'> {
  const ids = await page.evaluate(async (u) => {
    const o = await chrome.declarativeNetRequest.testMatchOutcome({
      url: u, type: 'main_frame', method: 'get', tabId: -1,
    });
    return o.matchedRules.map(r => r.ruleId);
  }, url);
  if (ids.includes(PAUSE_RULE_ID)) return 'allowed';           // pause allow rule wins
  return ids.some(id => id >= RULE_ID_BASE) ? 'blocked' : 'allowed';
}

export async function expectRuleState(
  page: Page, url: string, state: 'blocked' | 'allowed', timeout = 5_000,
) {
  await expect.poll(() => probe(page, url),
    { timeout, message: `rules never reached "${state}" for ${url}` }).toBe(state);
}

/** SRS Q4: rules must take effect within 1 s of the user's edit. Measured, not polled-away. */
export async function measureRuleLatency(page: Page, url: string, act: () => Promise<void>) {
  const t0 = Date.now();
  await act();
  await expectRuleState(page, url, 'blocked');
  return Date.now() - t0;
}
```

```ts
// tests/e2e/blocking.spec.ts
import { test, expect } from './fixtures';
import { expectRuleState, measureRuleLatency } from './dnr';

test('blocked navigation lands on the block page; control site still loads', async ({
  page, optionsPage, extensionId,
}) => {
  const ms = await measureRuleLatency(optionsPage, 'http://distraction.test/', async () => {
    await optionsPage.getByLabel('Add a website').fill('  HTTPS://WWW.Distraction.test/feed  ');
    await optionsPage.getByRole('button', { name: 'Add' }).click();
  });
  expect(ms, 'rule application budget (SRS Q4)').toBeLessThan(1000);

  // Normalization proven end-to-end. Scoped to the list, not every <li> on the page.
  await expect(optionsPage.getByTestId('blocklist').getByRole('listitem'))
    .toHaveText(['distraction.test']);

  await page.goto('http://distraction.test/');
  // toHaveURL auto-retries; page.url() is a non-retrying read and races the redirect.
  await expect(page).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/blocked\\.html`));
  await expect(page.getByRole('heading', { name: /blocked/i })).toBeVisible();
  await expect(page.locator('#real-site')).toHaveCount(0);   // never reached the origin

  await page.goto('http://allowed.test/');                   // CONTROL
  await expect(page.locator('#real-site')).toHaveText('REAL SITE: allowed.test');
});
```

```ts
// tests/e2e/confirm-disable.spec.ts  (excerpt)
await optionsPage.getByRole('switch', { name: /blocking enabled/i }).click();
const dialog = optionsPage.getByRole('dialog', { name: /turn blocking off/i });
await expect(dialog).toBeVisible();
await expect(dialog.getByTestId('tip')).not.toBeEmpty();
await optionsPage.keyboard.press('Escape');
await expect(dialog).toBeVisible();                       // closedby="none" resists Escape
await dialog.getByRole('button', { name: 'Cancel' }).click();
await expectRuleState(optionsPage, 'http://distraction.test/', 'blocked');
```

The confirmation must be an in-page `<dialog>`, never `window.confirm()` — Playwright auto-dismisses native dialogs unless a handler is registered before the click, and the tip text would be unassertable.

Also asserted, cheaply, in a `manifest.spec.ts`: `chrome.runtime.getManifest().action.default_popup` is `undefined`, `options_ui.open_in_tab === true`, and every rule returned by `getDynamicRules()` has `resourceTypes` containing `main_frame`.

### 4.7 Scripts and CI

```jsonc
{
  "scripts": {
    "lint": "biome ci . && tsc --noEmit",
    "build": "vite build",
    "build:e2e": "vite build && node scripts/inject-test-key.mjs",
    "test:unit": "vitest run",
    "test:e2e": "npm run build:e2e && playwright test",
    "test:e2e:headed": "npm run build:e2e && HEADED=1 playwright test",
    "test:e2e:xvfb": "npm run build:e2e && xvfb-run -a --server-args=\"-screen 0 1280x800x24\" env HEADED=1 playwright test",
    "test": "npm run test:unit && npm run test:e2e",
    "package": "npm run build && cd dist && zip -r ../blocklist.zip ."
  }
}
```

`scripts/inject-test-key.mjs` writes the test-only `key` into `dist/manifest.json`; `npm run package` never runs it, so the shipped zip has no `key`. `cross-env` is not used — the targets are Linux and `ubuntu-latest`. `tsconfig.json` carries `"types": ["chrome-types"]`, plus `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `moduleResolution: "bundler"`, `noEmit`. `.gitignore`: `dist/`, `test-results/`, `playwright-report/`, `node_modules/`.

```yaml
name: CI
on: { push: { branches: [main] }, pull_request: }
permissions: { contents: read }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }

jobs:
  lint-and-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run test:unit -- --coverage

  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - uses: actions/cache@v4
        id: pw-cache
        with:
          path: ~/.cache/ms-playwright
          key: pw-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
      # --no-shell: nothing here uses chromium-headless-shell, only the full browser.
      - run: npx playwright install --with-deps --no-shell chromium
        if: steps.pw-cache.outputs.cache-hit != 'true'
      - run: npx playwright install-deps chromium
        if: steps.pw-cache.outputs.cache-hit == 'true'
      - run: npm run test:e2e          # headless; no xvfb, no DISPLAY
      - uses: actions/upload-artifact@v6
        if: ${{ !cancelled() }}
        with: { name: playwright-report, path: playwright-report/, retention-days: 7 }
```

Node 20 is EOL (April 2026) and GitHub removes the node20 action runtime in September 2026 — hence Node 24 and the v6 actions.

---

## 5. Tips corpus

38 entries. Every DOI resolved through Crossref to the claimed paper; every claim checked against the abstract and, where a number was at stake, the full text. Text reflects the fact-checker's corrections (sample descriptions, study counts, effect-size honesty, scope of what was measured). Twelve rejected tips are gone, including the "23 minutes to refocus" figure (a 2006 press interview, not a paper), the "phone brain drain" (failed pre-registered replication), the goldfish attention span (no source), and the dopamine-per-like claim (no human study measures it).

Ships as `src/core/tips.ts` exporting `export const TIPS = [...] as const satisfies readonly Tip[];`

```json
[
  { "text": "After the Boston bombings, people who watched six or more hours of coverage a day reported more acute stress than people who were there.", "category": "doomscrolling", "source": "Holman, Garfin & Silver, PNAS, 2014", "url": "https://doi.org/10.1073/pnas.1316265110" },
  { "text": "Distress makes us seek more distressing news, which deepens distress. A three-year study found the loop runs in both directions.", "category": "doomscrolling", "source": "Thompson, Jones, Holman & Silver, Science Advances, 2019", "url": "https://doi.org/10.1126/sciadv.aav3502" },
  { "text": "Across 17 countries, bodies reacted more strongly to negative news than to positive. That pull you feel is physiology, not weakness.", "category": "doomscrolling", "source": "Soroka, Fournier & Nir, PNAS, 2019", "url": "https://doi.org/10.1073/pnas.1908369116" },
  { "text": "The researchers who first measured doomscrolling found it travels together with anxiety, habitual media use, and low self-control.", "category": "doomscrolling", "source": "Sharma, Lee & Johnson, Technology, Mind, and Behavior, 2022", "url": "https://doi.org/10.1037/tmb0000059" },
  { "text": "Texted five times daily for two weeks, people felt worse after Facebook, not before it. The dip follows the scroll.", "category": "doomscrolling", "source": "Kross et al., PLOS ONE, 2013", "url": "https://doi.org/10.1371/journal.pone.0069841" },
  { "text": "In a Danish trial of 1,095 people, one week off Facebook raised life satisfaction and mood, most of all for heavy users.", "category": "doomscrolling", "source": "Tromholt, Cyberpsychology, Behavior, and Social Networking, 2016", "url": "https://doi.org/10.1089/cyber.2016.0259" },
  { "text": "Students who capped each social app at ten minutes a day felt significantly less lonely and less depressed after three weeks.", "category": "doomscrolling", "source": "Hunt, Marx, Lipson & Young, Journal of Social and Clinical Psychology, 2018", "url": "https://doi.org/10.1521/jscp.2018.37.10.751" },
  { "text": "In a randomized trial with 2,743 people, four weeks off Facebook produced a small but measurable rise in wellbeing, and the freed time went to family, friends and offline life.", "category": "doomscrolling", "source": "Allcott, Braghieri, Eichmeyer & Gentzkow, American Economic Review, 2020", "url": "https://doi.org/10.1257/aer.20190658" },
  { "text": "Analyzing over a million posts from 4,000 people, researchers found that when we post is shaped by the same reward-learning rules that govern how animals chase rewards.", "category": "attention", "source": "Lindström et al., Nature Communications, 2021", "url": "https://doi.org/10.1038/s41467-020-19607-x" },
  { "text": "The quick check is a learned habit: brief inspections get rewarded with novelty, and repetition makes them automatic. Habits can be relearned.", "category": "attention", "source": "Oulasvirta, Rattenbury, Ma & Raita, Personal and Ubiquitous Computing, 2012", "url": "https://doi.org/10.1007/s00779-011-0412-2" },
  { "text": "Across 23 studies, problematic phone use travels with anxiety and low mood. It's a very common pattern, not a personal failing.", "category": "attention", "source": "Elhai, Dvorak, Levine & Hall, Journal of Affective Disorders, 2017", "url": "https://doi.org/10.1016/j.jad.2016.08.030" },
  { "text": "Switching your phone to grayscale for a week cut daily screen time by about twenty minutes and increased people's sense of control over their use.", "category": "attention", "source": "Dekker & Baumgartner, Mobile Media & Communication, 2024", "url": "https://doi.org/10.1177/20501579231212062" },
  { "text": "People whose notifications arrived in three daily batches felt more attentive and less stressed. Hourly batching did nothing, and switching alerts off entirely backfired.", "category": "attention", "source": "Fitz, Kushlev, Jagannathan, Lewis, Paliwal & Ariely, Computers in Human Behavior, 2019", "url": "https://doi.org/10.1016/j.chb.2019.07.016" },
  { "text": "For one week people kept their alerts on; for another, off. The same people reported more inattention and restlessness during the alerts-on week.", "category": "attention", "source": "Kushlev, Proulx & Dunn, CHI 2016 Proceedings", "url": "https://doi.org/10.1145/2858036.2858359" },
  { "text": "Part of your attention stays behind on the last task. Finishing what you're on before you switch makes the switch much cheaper.", "category": "attention", "source": "Leroy, Organizational Behavior and Human Decision Processes, 2009", "url": "https://doi.org/10.1016/j.obhdp.2009.04.002" },
  { "text": "Lab studies show every task switch costs measurable time to reload the rules. The tax is small each time, and constant.", "category": "attention", "source": "Rubinstein, Meyer & Evans, Journal of Experimental Psychology: Human Perception and Performance, 2001", "url": "https://doi.org/10.1037/0096-1523.27.4.763" },
  { "text": "Interrupted workers finished just as fast, by working harder. The cost showed up as higher stress, frustration and time pressure.", "category": "attention", "source": "Mark, Gudith & Klocke, CHI 2008 Proceedings", "url": "https://doi.org/10.1145/1357054.1357072" },
  { "text": "We spend about 47% of waking hours thinking about something other than what we're doing, and it usually feels worse.", "category": "attention", "source": "Killingsworth & Gilbert, Science, 2010", "url": "https://doi.org/10.1126/science.1192439" },
  { "text": "A walk in a park improved attention scores; a comparable walk downtown did not. Nature seems to restore attention rather than spend it.", "category": "attention", "source": "Berman, Jonides & Kaplan, Psychological Science, 2008", "url": "https://doi.org/10.1111/j.1467-9280.2008.02225.x" },
  { "text": "Pooling 22 samples, a meta-analysis found short breaks of ten minutes or less give a small but reliable lift to energy and drop in fatigue.", "category": "breaks", "source": "Albulescu et al., PLOS ONE, 2022", "url": "https://doi.org/10.1371/journal.pone.0272460" },
  { "text": "Recovery depends on mentally stepping away, not just physically. A break you spend still chewing on work doesn't refill much.", "category": "breaks", "source": "Sonnentag & Fritz, Journal of Organizational Behavior, 2015", "url": "https://doi.org/10.1002/job.1924" },
  { "text": "Forty seconds looking at a green rooftop was enough to restore attention on a demanding task. A window may do.", "category": "breaks", "source": "Lee, Williams, Sargent, Williams & Johnson, Journal of Environmental Psychology, 2015", "url": "https://doi.org/10.1016/j.jenvp.2015.04.003" },
  { "text": "Tracking 95 workers across five days, the breaks that restored the most energy and focus were the ones taken earlier in the day, doing something the person actually liked.", "category": "breaks", "source": "Hunter & Wu, Journal of Applied Psychology, 2016", "url": "https://doi.org/10.1037/apl0000045" },
  { "text": "On days when employees took a fifteen-minute lunchtime walk in a park, they concentrated better and felt less tired that afternoon.", "category": "breaks", "source": "Sianoja, Syrek, de Bloom, Korpela & Kinnunen, Journal of Occupational Health Psychology, 2018", "url": "https://doi.org/10.1037/ocp0000083" },
  { "text": "Across four experiments, walking beat sitting for generating new ideas, and the boost carried over after people sat back down.", "category": "movement", "source": "Oppezzo & Schwartz, Journal of Experimental Psychology: Learning, Memory, and Cognition, 2014", "url": "https://doi.org/10.1037/a0036577" },
  { "text": "Ten minutes of easy stair-walking lifted energy more than 50mg of caffeine in a small trial of sleep-deprived young women.", "category": "movement", "source": "Randolph & O'Connor, Physiology & Behavior, 2017", "url": "https://doi.org/10.1016/j.physbeh.2017.03.013" },
  { "text": "Pooling ten UK studies of green exercise, the largest self-esteem gains arrived in the first five minutes. Five minutes counts.", "category": "movement", "source": "Barton & Pretty, Environmental Science & Technology, 2010", "url": "https://doi.org/10.1021/es903183r" },
  { "text": "People spending at least two hours a week in nature were more likely to report good health and high wellbeing.", "category": "movement", "source": "White et al., Scientific Reports, 2019", "url": "https://doi.org/10.1038/s41598-019-44097-3" },
  { "text": "In a randomized week, checking email only three times a day measurably lowered daily stress. Fewer check-ins, not more willpower.", "category": "stress", "source": "Kushlev & Dunn, Computers in Human Behavior, 2015", "url": "https://doi.org/10.1016/j.chb.2014.11.005" },
  { "text": "Five minutes a day of cyclic sighing, a double inhale through the nose then a long exhale through the mouth, beat mindfulness meditation for lifting mood over a month.", "category": "stress", "source": "Balban et al., Cell Reports Medicine, 2023", "url": "https://doi.org/10.1016/j.xcrm.2022.100895" },
  { "text": "Naming a feeling, as in \"this is restlessness\", quiets the brain's alarm response. Try labeling the urge before deciding anything.", "category": "stress", "source": "Lieberman et al., Psychological Science, 2007", "url": "https://doi.org/10.1111/j.1467-9280.2007.01916.x" },
  { "text": "Commuters expected chatting with a stranger to be unpleasant. Those who did enjoyed the trip more. Connection beats our forecast.", "category": "stress", "source": "Epley & Schroeder, Journal of Experimental Psychology: General, 2014", "url": "https://doi.org/10.1037/a0037323" },
  { "text": "Students who forgave themselves for procrastinating on one exam procrastinated less before the next one.", "category": "stress", "source": "Wohl, Pychyl & Bennett, Personality and Individual Differences, 2010", "url": "https://doi.org/10.1016/j.paid.2010.01.029" },
  { "text": "Urges rise and fall like waves. Smokers taught to watch an urge rather than fight it smoked less over the following week.", "category": "stress", "source": "Bowen & Marlatt, Psychology of Addictive Behaviors, 2009", "url": "https://doi.org/10.1037/a0017127" },
  { "text": "Reading on a bright screen before bed delayed sleep, suppressed melatonin, and left people groggier next morning than print did.", "category": "sleep", "source": "Chang, Aeschbach, Duffy & Czeisler, PNAS, 2015", "url": "https://doi.org/10.1073/pnas.1418490112" },
  { "text": "Researchers call it bedtime procrastination: going to bed later than you meant to, for no external reason. It's remarkably common.", "category": "sleep", "source": "Kroese, De Ridder, Evers & Adriaanse, Frontiers in Psychology, 2014", "url": "https://doi.org/10.3389/fpsyg.2014.00611" },
  { "text": "One sleepless night sharply raised next-day anxiety in a controlled study, and deep slow-wave sleep brought it back down.", "category": "sleep", "source": "Ben Simon, Rossi, Harvey & Walker, Nature Human Behaviour, 2020", "url": "https://doi.org/10.1038/s41562-019-0754-8" },
  { "text": "In a survey of 844 adults, phone use after lights out went with taking longer to fall asleep, worse sleep quality and more daytime tiredness. An association, not proof of cause.", "category": "sleep", "source": "Exelmans & Van den Bulck, Social Science & Medicine, 2016", "url": "https://doi.org/10.1016/j.socscimed.2015.11.037" }
]
```

---

## 6. Risks and gotchas, ranked

1. **Omitting `resourceTypes` silently inverts the product.** *"If neither of them is specified, all resource types except 'main_frame' are blocked."* You'd ship a blocker that blocks images and XHR on the target site but never the page. **Mitigation:** `rules.test.ts` asserts every generated rule contains `main_frame`; `manifest.spec.ts` re-asserts it against live `getDynamicRules()`.
2. **XSS on the extension origin via the block page.** `blocked.html` renders a value derived from a URL an attacker can craft, on a `chrome-extension://` origin with the extension's privileges. **Mitigation:** `textContent` only, validate against the stored blocklist first, reject non-http(s) schemes, no `href` from user data, no `innerHTML` anywhere in `src/blocked/`. Add a Biome rule banning `innerHTML` and a grep in CI.
3. **Runtime host-permission withholding kills the blocker silently.** Chrome's per-extension "on click" site-access setting is one menu click away and produces no event for `WithHostAccess` rules. **Mitigation:** plain `declarativeNetRequest` + dual redirect/block rules (§2.1), plus `permissions.contains()` on startup, a `permissions.onRemoved` listener, and a persistent warning banner. **[VERIFY-1]** the fall-through behaviour.
4. **One bad blocklist entry rejects the entire atomic update.** An uppercase character, a non-punycode IDN, or an empty string makes `updateDynamicRules` reject; the *previous* rule set stays live, the user's edit does nothing, and the rejection is an unhandled promise in a service worker nobody sees. **Mitigation:** per-entry validation before the call, `try/catch` around it, `lastSyncError` + `invalidEntries` written to `storage.local` and rendered in the options page.
5. **Forgetting `web_accessible_resources` gives an unhelpful `ERR_BLOCKED_BY_CLIENT`** even though the redirect target is your own page. This eats hours. **Mitigation:** it is in the manifest above; `blocking.spec.ts` fails loudly if it regresses.
6. **`default_popup` silently kills `chrome.action.onClicked`.** No error, no warning. **Mitigation:** the key is absent, and `manifest.spec.ts` asserts `default_popup === undefined`.
7. **MV3 listener registration must be synchronous and top-level.** Registering after an `await` means the event is missed on cold start — and cold start is the normal case. **Mitigation:** `src/background/index.ts` contains only `addListener` calls at module top level; all async work lives in the callbacks.
8. **SPA navigations, site service workers, and bfcache never hit the network,** so DNR never fires. A pushState-driven site already open when you enable blocking keeps working; a bfcache back-navigation restores a page with no request. **Mitigation:** `sweepOpenTabs()` on every `syncRules()` redirects any open tab whose host is now covered. bfcache history entries are **not** covered — document it in the README rather than take the `webNavigation` permission (which costs a "read your browsing history" warning). **[VERIFY-2]** what Back does after a DNR redirect; session-history semantics are undocumented and determine whether the blocker is trivially defeatable.
9. **Incognito is the first bypass a user tries.** The extension is disabled in incognito by default. **Mitigation:** `incognito: "spanning"` in the manifest plus an `isAllowedIncognitoAccess()` check that renders a prominent "Also allow in Incognito" instruction.
10. **`storage.sync`'s 8 KB *per-item* cap, not the 100 KB area cap, is the real list limit,** and 120 writes/minute is easy to exceed from a live-editing UI. **Mitigation:** measured `willFitInSyncQuota`, 250 ms debounce, explicit rejection handling with a "move to local storage" escape.
11. **A second `--disable-features` flag in Playwright args replaces Playwright's own**, silently re-enabling `PaintHolding`, `MediaRouter`, `Translate` and friends and breaking the harness in ways that look like product bugs. Same for a duplicated `--host-resolver-rules` (last one wins). **Mitigation:** the fixture carries a comment; do not add either flag.
12. **`channel: 'chrome'` and `devices['Desktop Chrome']` cannot load extensions** (flags removed in Chrome 137/139, branded builds). **Mitigation:** `channel: 'chromium'` in the fixture and no `projects` block in the config.
13. **A pinned test `key` produces an ID that will not match the Web Store item.** **Mitigation:** `key` exists only in `dist/` during E2E, injected by `scripts/inject-test-key.mjs`; `npm run package` never runs it; the real ID comes from the dashboard's Package → View public key.
14. **`redirect` is an *unsafe* action** — the 5 000 cap, not 30 000. Easy to misread. **Mitigation:** chunked rules make the count O(entries/500), and the safe `block` companion carries no unsafe cost.
15. **POST navigations to a blocked domain may hit a Chrome error page rather than yours.** Rare (a form submitting to a blocked host). **[VERIFY-3]** — the "307 preserves the method → `ERR_UNSAFE_REDIRECT`" mechanism is undocumented folklore; do not state it as fact in the README until reproduced.
16. **`chrome://` URLs, the Web Store, and other extensions' pages can never be intercepted.** Do not promise blocking of `chrome://newtab`.
17. **The omnibox shows `chrome-extension://…` after a block.** Some users find this jarring; there is no way around it with DNR. `history.replaceState` at least strips the original URL from it.
18. **`declarativeNetRequestFeedback` must not ship.** It adds a browsing-history warning and only works unpacked. Keep it in a local-only manifest patch.

**Verification spikes to run in a scratch extension before writing production code:** [VERIFY-1] priority fall-through when a redirect lacks host permission; [VERIFY-2] Back/Forward semantics after a DNR redirect; [VERIFY-3] POST-navigation behaviour; [VERIFY-4] `regexSubstitution` output shape with `^https?://.*` on a URL containing `#`, `?`, and non-ASCII; [VERIFY-5] the practical size limit on a single `requestDomains` array. Each spike is one afternoon and each one is load-bearing.

---

## 7. Open questions for the product owner

1. **Install warning vs. silent-failure risk.** The design accepts the *"Block content on any page."* warning (plain `declarativeNetRequest`) to guarantee the blocker keeps working when a user restricts site access. The alternative — `declarativeNetRequestWithHostAccess`, zero warning — can be turned into a no-op by one Chrome menu click. Confirm we prefer the warning.
2. **Is `<all_urls>` acceptable at all?** It exists only to enable the custom block page. Dropping it means `block`-only, zero host permissions, a maximally clean privacy story, an easier Web Store review — and Chrome's grey `ERR_BLOCKED_BY_CLIENT` interstitial instead of the block page with its tip. Is the tip page worth `<all_urls>`?
3. **Should pause be time-boxed?** "Disable for 15 minutes / 1 hour / until I re-enable" is a materially better product than an indefinite toggle, but needs `chrome.alarms` and changes the pause rule's lifecycle. Not in the current design.
4. **What does the block page offer besides the tip?** A "take me back" button, a "5 more minutes" override, a link to the options page, or nothing at all. An override button undercuts the whole product; deciding this changes the page and the E2E specs.
5. **Sub-frame embeds.** Should an embedded Reddit/YouTube iframe on an unrelated page be blocked? Currently no (only `main_frame`). Blocking them is one extra safe rule but produces visibly broken third-party pages.
6. **Entry-count cap and the sync/local trade.** The 8 KB `storage.sync` item cap will be hit somewhere in the low hundreds of domains. Do we (a) hard-cap the list, (b) offer to move to `storage.local` and lose cross-device sync, or (c) shard the list across multiple sync keys?
7. **F3's acceptance method.** The SRS specifies *"isolated adversarial code review with code reviewer sub-agent"* for the confirm-dialog requirement; this brief specifies an E2E test. Do we amend the SRS, or produce the review artifact in addition?
8. **A guard rail for public suffixes?** Adding `co.uk` blocks all of `.co.uk`. The design does not use a PSL (200 KB plus an update cadence). Do we want a 20-entry hardcoded warn list (`co.uk`, `com.au`, `github.io`, …) that warns but does not refuse — or nothing?
9. **Theme control.** Tokens support an explicit `data-theme` toggle. Is there a visible light/dark switch in the options page, or system-only?
10. **Chrome floor of 121** (Jan 2024) excludes anyone on an older build. Acceptable, or lower it to 101 and give up the 30 000 safe-rule quota assumption?