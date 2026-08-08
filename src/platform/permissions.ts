/**
 * Host-access state.
 *
 * Chrome lets the user set an extension's site access to "on click" or "on specific
 * sites" at any moment, from a menu two clicks away. In that state our `redirect` rule
 * stops applying — silently, with no event and no error. The companion `block` rule
 * still fires (Chrome grants implicit access to safe actions), so blocking survives, but
 * the user gets Chrome's grey interstitial instead of our page with its tip.
 *
 * That degradation must be visible, hence this module and the options-page banner.
 */

export async function hasFullHostAccess(): Promise<boolean> {
  return chrome.permissions.contains({ origins: ['<all_urls>'] })
}

/** Subscribe to host-access changes. Returns an unsubscribe function. */
export function onHostAccessChanged(listener: () => void): () => void {
  chrome.permissions.onAdded.addListener(listener)
  chrome.permissions.onRemoved.addListener(listener)
  return () => {
    chrome.permissions.onAdded.removeListener(listener)
    chrome.permissions.onRemoved.removeListener(listener)
  }
}

/** Incognito is the first bypass most users try, and it is off by default. */
export async function isAllowedInIncognito(): Promise<boolean> {
  return chrome.extension.isAllowedIncognitoAccess()
}
