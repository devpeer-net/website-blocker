# Publishing Handover — Website Blocker → Chrome Web Store

Everything needed to submit this extension in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). Copy is finalized; store images are already built. Two things must be true *before* you submit — see §1.

---

## What's already done

- ✅ **`public/manifest.json` updated** with the final copy:
  - `name` → `Website Blocker - Block Distracting Sites, Private & Simple` (59/75 chars — this becomes the **store title**)
  - `description` → the 125-char summary (below) — this becomes the **store "summary"**
  - `action.default_title` left as `Website Blocker` so the toolbar tooltip stays clean.
- ✅ **Store images built** in `store/build/` (8 assets, correct sizes — see §5).
- ✅ **Long description** ready to paste in `STORE_LISTING.md` §5c.

---

## 1. Pre-submission blockers — do these first

- [ ] **Publish the public source repository (MIT).** The listing and **screenshot 5** claim *"open source,"* *"you can verify it,"* and *"nothing ever leaves your browser."* If the source isn't public at submission, those are misleading claims (a policy violation, and screenshot imagery implying something not provided is specifically called out). Either **publish the repo first**, or remove the open-source claims from the detailed description and drop/replace the 5th screenshot. `store/README.md` flags the same thing.
- [x] **Privacy policy hosted (S3):** `https://website-blocker-extension.s3.us-east-1.amazonaws.com/privacy.html` — page source in `legal/privacy.html`. Paste this URL into the dashboard's privacy-policy field.
- [ ] **One-time account setup:** register as a Chrome Web Store developer (one-time **$5 USD** fee) and enable **2-Step Verification** on the Google account, or the console won't let you publish.

---

## 2. Build the upload package

```bash
pnpm package        # runs a clean `pnpm build`, then zips dist/ → website-blocker.zip
```

- Use **`pnpm package`** (or `pnpm build` then zip `dist/`). **Do not** upload a build made by `build:e2e` / `test:e2e` — those inject a test signing key into `dist/` for Playwright, which must never ship.
- After building, sanity-check that `dist/manifest.json` shows the **new** name/description (the old `dist/` is stale until you rebuild).

---

## 3. Create the item & upload

1. Open the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) → **Add new item**.
2. Upload `website-blocker.zip`.
3. The **title** is read from the manifest `name` automatically (not editable in the dashboard).

---

## 4. "Store listing" tab — what to paste

| Field | Value |
|---|---|
| **Title** | *(auto from manifest)* `Website Blocker - Block Distracting Sites, Private & Simple` |
| **Summary** (132 max) | Pre-filled from the manifest. Confirm it reads: `Block distracting websites and doomscrolling—simply and privately. No account, no tracking, just calm, science-backed nudges.` |
| **Description** (16,000 max) | Paste the plain-text block from **`STORE_LISTING.md` §5c** (the `★`/`•` characters are intentional — the field is plain text). |
| **Category** | Productivity (Workflow & Planning) |
| **Language** | English |

---

## 5. "Graphic assets" — upload from `store/build/`

Upload in filename order; the first screenshot does most of the work.

| File in `store/build/` | Store field | Required | Suggested caption |
|---|---|:---:|---|
| `store-icon-128.png` | Store icon (128×128) | **yes** | — |
| `01-block-page.png` | Screenshot 1 (1280×800) | **yes** | Block the sites that eat your day |
| `02-add-a-site.png` | Screenshot 2 | | Add a site, it's out of reach |
| `03-science-nudge.png` | Screenshot 3 | | Turning it off takes a deliberate second |
| `04-subdomains.png` | Screenshot 4 | | One entry covers the whole domain |
| `05-private.png` | Screenshot 5 | | Nothing ever leaves your browser *(see §1 + §8)* |
| `promo-tile-440x280.png` | Small promo tile | **yes** | — |
| `marquee-1400x560.png` | Marquee promo tile | no | *(only shown if Google features you)* |

- The listing icon is taken from the manifest's 128px icon. `store/README.md` notes the shipped `public/icons/128.png` is a lower-quality bitmap; if you want the crisper `store-icon-128.png` as the actual icon, replace `public/icons/128.png` (ideally regenerate 16/32/48 from the same source) **before** `pnpm package`. Optional polish, not a blocker.
- If you change any UI before launch, regenerate the set with `./store/make-store-assets.sh` — out-of-date screenshots are a policy violation.

---

## 6. "Privacy practices" tab — where most rejections happen

**Single purpose** (paste):
> Website Blocker lets a user keep a personal list of websites to block. When the user navigates to a site on their list, the extension redirects that tab to its own block page (which shows an optional, source-cited wellbeing tip). Blocking distracting websites is its single, narrow purpose.

**Permission justifications** (paste one per permission):
- **`declarativeNetRequest`** — "Blocks the sites on the user's own blocklist by redirecting matching top-level navigations to the extension's bundled block page. This is Chrome's privacy-preserving blocking API: rules are enforced by the browser, and the extension never reads, intercepts, or receives the contents of web requests."
- **`storage`** — "Stores the user's blocklist and on/off setting. It uses `chrome.storage.sync` so the list follows the user across the devices where they're signed into Chrome. Nothing is sent to the developer or any third party."
- **Host permission `<all_urls>`** — "Required so the user can block a site on any domain they choose, and so the extension's own block page can load in place of a blocked site. The extension makes no network requests and does not read page content or browsing history. It deliberately does **not** request the broader `tabs` permission."

**Remote code:** No — the extension bundles all its code; it runs nothing fetched at runtime.

**Data usage / disclosures:** declare that the extension **collects no user data**, and certify all three:
- You do **not** sell or transfer user data to third parties (outside approved use cases).
- You do **not** use or transfer data for purposes unrelated to the single purpose.
- You do **not** use or transfer data to determine creditworthiness or for lending.

**Privacy policy URL:** `https://website-blocker-extension.s3.us-east-1.amazonaws.com/privacy.html` (hosted on S3; page source in `legal/privacy.html`).

---

## 7. Privacy policy — ready to host

*Accurate to how the extension actually behaves (note the honest Chrome-Sync line — see §8).*

```text
Privacy Policy — Website Blocker

Website Blocker does not collect, transmit, sell, or share any personal data.

• The websites you choose to block and your on/off setting are stored on your
  device using Chrome's storage API.
• If you use Chrome with sync turned on, Chrome (Google) syncs these settings
  across your own devices through your Google account. This is handled entirely
  by your browser — the developer never receives this data.
• The extension makes no network requests to the developer or any third party.
  It contains no analytics and no trackers, and requires no account.
• The only external links are the research citations shown on the block page;
  they open in your browser only when you choose to click them.

Contact: <your contact email>
Last updated: <date>
```

---

## 8. Accuracy checks before you submit

- **"Open source" claims** depend on the repo being public — see §1.
- **"Nothing ever leaves your browser"** (screenshot 5 and the detailed description's privacy line) is a simplification. The *extension* sends nothing anywhere and never to you. But because it uses `chrome.storage.sync`, the blocklist is synced across the user's own devices by **Chrome Sync (Google)**. That's the user's own account, not your server — but if you want to be strictly precise, either keep the phrasing (common, and it never reaches you) or soften the description's privacy line to *"the extension never sends your data anywhere — syncing, if you use it, is handled by your own Chrome account."* The privacy policy in §7 already states it precisely. Your call.

---

## 9. Distribution & submit

- **Visibility:** Public — or **Unlisted** for a soft launch (share the link, gather first reviews, then flip to Public; early ratings drive ranking in this crowded category).
- **Pricing:** Free. **Regions:** all.
- Click **Submit for review.** Review typically takes anywhere from a few hours to a few days; you'll be emailed the result.

---

## 10. After it's live (from `STORE_LISTING.md` §7)

- Publish the one-page site with **FAQPage schema** (highest-ROI move to recover the GEO the no-brand title trades away, and to win answer-engine snippets).
- Seed genuine early reviews.
- Keep the provable-privacy claim intact in every future release — no analytics, no paywall, no `tabs` permission. It's the whole positioning.
```
