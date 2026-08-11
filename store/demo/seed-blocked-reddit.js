// Demo state for the block-page screenshots.
//
// Same blocklist as seed-list.js, plus one extra step: blocked.js clears the
// URL fragment on load (history.replaceState) so the original address is not
// left sitting in the omnibox. capture_ui.mjs seeds *after* the first load and
// then reloads, so the fragment has to be put back or the page reloads with
// nothing to name and falls back to "this site".
//
// The host is only rendered if it genuinely matches the stored blocklist, so
// this is the real code path, not a mock.
//
// The IIFE's value is the script's completion value, which the capture tool awaits before
// screenshotting. It only looks floating: `void`-ing it to satisfy the linter removes that
// await, and frame 1 stops being reproducible.
// biome-ignore lint/nursery/noFloatingPromises: awaited via the completion value
;(async () => {
  await chrome.storage.sync.set({
    blocked: ['instagram.com', 'news.ycombinator.com', 'reddit.com', 'x.com', 'youtube.com'],
  })
  await chrome.storage.local.set({ paused: false, storeLocally: false })
  location.hash = 'https://www.reddit.com/r/all'
})()
