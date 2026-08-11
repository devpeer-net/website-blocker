// Demo state for the Chrome Web Store screenshots.
//
// Written straight into chrome.storage the same way the options page writes it:
// `blocked` lives in chrome.storage.sync while `storeLocally` is false, and the
// options page keeps the list sorted (addSite -> [...].sort()), so this order is
// exactly what a real user would end up with.
//
// Five real, plausible domains. An empty blocklist is the fastest way to make a
// listing look unfinished, and `example.com` reads as unshipped. Five is also
// what fits the fixed 288px list box without clipping a row in half.
chrome.storage.sync.set({
  blocked: ['instagram.com', 'news.ycombinator.com', 'reddit.com', 'x.com', 'youtube.com'],
})
chrome.storage.local.set({ paused: false, storeLocally: false })
