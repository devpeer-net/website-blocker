# Website Blocker — Chrome Web Store listing images

Everything the store asks you to upload is in this folder, at exactly the sizes
it accepts. Verified with the skill's checker: **8 assets, 0 problems, 0
warnings.**

## What to upload

| File | Size | Store field | Required |
|---|---|---|---|
| `01-block-page.png` | 1280×800 | Screenshot 1 | yes (≥1) |
| `02-add-a-site.png` | 1280×800 | Screenshot 2 | |
| `03-science-nudge.png` | 1280×800 | Screenshot 3 | |
| `04-subdomains.png` | 1280×800 | Screenshot 4 | |
| `05-private.png` | 1280×800 | Screenshot 5 | |
| `promo-tile-440x280.png` | 440×280 | Small promo tile | **yes** |
| `marquee-1400x560.png` | 1400×560 | Marquee promo tile | no (only shown if Google features you) |
| `store-icon-128.png` | 128×128 | Store icon | **yes** |

Upload the screenshots in filename order — the carousel keeps upload order and
frame 1 does most of the work.

The two things people get bounced on are covered: every file is a PNG at an
exact accepted size (a 1281px screenshot is rejected at upload), the screenshots
are full bleed with square corners and no alpha, and the icon *does* have alpha
with 16px of transparent padding on each side.

## The set

All five are designed at 1280×800 but judged at 640×400, because the store
downscales every screenshot to half size. Nothing that matters is under 26px on
the canvas, which is 13px after the downscale. That is why the UI is enlarged
1.85–1.9× rather than screenshotted at 1:1.

| # | Caption | What it shows |
|---|---|---|
| 1 | Block the sites that eat your day | The real `blocked.html`, in a browser window, after a navigation to reddit.com |
| 2 | Add a site, it's out of reach | The options page: header, switch, status line, add field, blocklist |
| 3 | Turning it off takes a deliberate second | The real "Are you sure?" dialog with a DOI-cited study |
| 4 | One entry covers the whole domain | The blocklist, with one callout for subdomain coverage |
| 5 | Nothing ever leaves your browser | Privacy posture — the one thing no screen can show |

Tokens (colours, type scale, gutter, caption position) live in one file,
`sources/frames/frame.css`, and every frame and both tiles use it, so the set
reads as one product. The palette is the extension's own: `#3a47d1` primary,
`#3fd9c0` accent, `#0a0f1c`-family ground. Type is the extension's own bundled
Inter Variable, loaded from `dist/assets/`, not a system fallback.

## Decisions I made without asking

The brief said to work autonomously, so these were called rather than checked:

- **Strongest selling point → frame 1 is the block page.** `STORE_LISTING.md`
  §7 already sketched five shots and this follows it closely; the audit calls
  cited, peer-reviewed science at the block moment your moat, so it appears in
  frames 1 and 3.
- **Captions are eyebrow + headline only, no supporting line.** The dialog and
  the blocklist are tall; a third line of copy would have forced the UI below
  the legibility floor. Less text is also what the store's own guidance asks
  for.
- **Demo data is five real domains** (instagram, news.ycombinator, reddit, x,
  youtube), sorted the way `addSite()` sorts them. Five is what fits the fixed
  288px list box without clipping a row in half. Nothing personal appears
  anywhere in the set.
- **The omnibox in frame 1 reads `chrome-extension://…/blocked.html`.** That is
  what Chrome actually shows after the redirect (`blocked.js` strips the
  fragment with `replaceState`). Putting `www.reddit.com` there would have
  looked friendlier and been false.
- **A new 128×128 icon, same mark.** The shipped `dist/icons/128.png` is a
  3-colour, 1-bit-alpha bitmap with hard aliased edges, and its artwork is not
  vertically centred. `sources/frames/icon-128.html` redraws the same indigo
  shield and white check from the lucide `shield-check` geometry the options
  header already uses, at the same `#3a47d1`, properly antialiased and centred.
  Consider replacing the in-extension icons from the same source.
- **Frame 2 composites three elements** (`<header>`, `<form>`, `<section>`),
  each captured live, stacked with the page's real 32px gaps on the page's own
  background. See the limitation below for why.

## Limitations and things to check before you submit

1. **"Open source, MIT" on frame 5 must be true at submission time.**
   `STORE_LISTING.md` §8 still lists "publish the public repo" as an open task.
   Imagery implying something the extension does not provide is a policy
   violation, so either publish the repo first or drop that third panel.
2. **The Incognito advisory is not in the screenshots.** A freshly launched
   capture profile has incognito access off, so the options page renders its
   "Blocking does not apply in Incognito windows" warning. That is a property of
   the throwaway profile, not of the extension — a user who follows the README
   never sees it. Capturing `<header>`/`<form>`/`<section>` separately and
   restacking them with the page's own spacing leaves it out without altering
   any UI. If you would rather ship a single uncropped capture, enable
   "Allow in Incognito" in a persistent profile and re-shoot.
3. **The tips are picked by `Date.now() % 38`,** so re-running the pipeline
   gives a different study in frames 1 and 3. The two in the set now (Albulescu
   et al., PLOS ONE 2022; White et al., Scientific Reports 2019) were picked
   from a handful of runs for length and tone. Re-run the dialog capture if a
   regeneration lands on a grim one.
4. **The "Add" button is in its disabled state** in frame 2 — that is the real
   idle page (the button enables once you type). `capture_ui.mjs` can click but
   not type, so filling the field would have meant faking it.
5. **Frames 2 and 4 both show the blocklist**, at different crops and zooms.
   Deliberate — frame 2 is the page, frame 4 is the detail — but if you want
   more variety, frame 4 could become the block page for `old.reddit.com`
   instead; that capture is already in `sources/captures/`.
6. **File sizes** are 78 KB–443 KB. Well under anything worth optimising, but
   `oxipng -o4` would shave ~20% if you care.

## Regenerating

Out-of-date screenshots are an explicit policy violation, so the whole set is
reproducible:

```bash
./store/make-store-assets.sh                 # -> store/build, then verifies
./store/make-store-assets.sh /path/to/out    # or somewhere else
```

It needs `playwright` (already in `node_modules`) and ImageMagick, and reads the
skill's scripts from `$CWS_SKILL` (default
`~/.claude/skills/chrome-webstore-screenshots`). Worth wiring into `package.json`
as a `store:assets` script next to `package`, and worth committing
`store/frames/`, `store/demo/` and `store/render_icon.mjs` — the sources are what
make the next release cheap.

## What's in `sources/`

| Path | |
|---|---|
| `frames/frame.css` | the shared tokens — edit colours and type here, once |
| `frames/0*.html` | one canvas per screenshot |
| `frames/tile-440.html`, `frames/tile-1400.html` | the two promo tiles, same lockup |
| `frames/icon-128.html` | the store icon artwork |
| `frames/manifest.json` | the render batch |
| `demo/seed-*.js` | the demo state written into `chrome.storage` before each capture |
| `captures/ui-*.png` | the raw 2× captures of the live extension UI |
| `render_icon.mjs` | icon renderer — the skill's `render.mjs` writes opaque pixels, and the icon needs transparency |
| `make-store-assets.sh` | capture → render → verify, end to end |

The frame HTML references captures as `../captures/…` and fonts as
`../../dist/assets/…`, so to re-render from these copies put `frames/` and
`captures/` back under a `store/` directory inside the project.
