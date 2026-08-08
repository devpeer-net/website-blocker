/**
 * The single writer of dynamic declarativeNetRequest rules.
 *
 * Rules are pure derived state: chrome.storage is the source of truth, and every path
 * (local edit, sync push from another device, cold start) funnels through syncRules().
 */

import type { Domain } from '@/core/domain'
import { covers, normalizeDomain } from '@/core/domain'
import { buildRules } from '@/core/rules'
import { getBlocklist, getPaused } from './storage'

export function blockedPageUrl(): string {
  return chrome.runtime.getURL('blocked.html')
}

export async function syncRules(): Promise<void> {
  const [stored, paused] = await Promise.all([getBlocklist(), getPaused()])

  // Partition BEFORE the API call. updateDynamicRules is atomic, so a single malformed
  // entry would reject the whole update, leave the previous rules live, and make the
  // user's edit silently ineffective.
  const valid: Domain[] = []
  const invalid: string[] = []
  for (const entry of stored) {
    const domain = typeof entry === 'string' ? normalizeDomain(entry) : null
    if (domain) valid.push(domain)
    else invalid.push(String(entry))
  }

  const rules = buildRules(valid, { paused, blockedPageUrl: blockedPageUrl() })
  const existing = await chrome.declarativeNetRequest.getDynamicRules()

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      // Always remove the full existing set. Removals are processed before additions,
      // so the deterministic index-derived ids are safe to reuse within one call.
      removeRuleIds: existing.map((rule) => rule.id),
      addRules: rules as chrome.declarativeNetRequest.Rule[],
    })
  } catch (error) {
    // Never leave an unhandled rejection in a service worker nobody is watching.
    await chrome.storage.local.set({
      lastSyncError: error instanceof Error ? error.message : String(error),
      invalidEntries: invalid,
    })
    return
  }

  await chrome.storage.local.set({ lastSyncError: null, invalidEntries: invalid })
  await sweepOpenTabs(valid, paused)
}

/**
 * Redirect tabs that are already sitting on a now-blocked site.
 *
 * declarativeNetRequest only sees network requests, so a single-page app navigated via
 * pushState — or any tab open before the user added the site — would keep working until
 * its next request. Requires no `tabs` permission: <all_urls> host access already
 * exposes tab.url.
 */
async function sweepOpenTabs(domains: readonly Domain[], paused: boolean): Promise<void> {
  if (paused || domains.length === 0) return

  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] })
  const target = blockedPageUrl()

  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined || !tab.url) return
      const host = normalizeDomain(tab.url)
      if (!host || !domains.some((domain) => covers(domain, host))) return
      try {
        await chrome.tabs.update(tab.id, { url: `${target}#${tab.url}` })
      } catch {
        // Tab closed mid-sweep, or is a page we may not navigate. Not worth reporting.
      }
    }),
  )
}
