/**
 * MV3 service worker.
 *
 * Every listener is registered synchronously at module top level. Registering after an
 * `await` misses the event on cold start — and cold start is the normal case, because
 * the worker is torn down after ~30s idle.
 *
 * The worker only *maintains* rules. Once written, declarativeNetRequest rules live in
 * the browser, so blocking keeps working while this worker is suspended.
 */
import { onRuleInputChanged } from '@/platform/storage'
import { syncRules } from '@/platform/sync'

/** Fire-and-forget wrapper: a rejected promise here would be an invisible failure. */
function resync(): void {
  void syncRules().catch((error: unknown) => {
    console.error('[website-blocker] rule sync failed', error)
  })
}

chrome.runtime.onInstalled.addListener(resync)
chrome.runtime.onStartup.addListener(resync)

// Storage is the only channel between the options page and the blocking engine, so this
// one listener covers local edits, sync pushes from another device, and pause/resume.
// It watches the rule inputs only — syncRules() itself writes the diagnostic keys, so
// watching those would make the worker retrigger itself.
onRuleInputChanged(resync)

// Regaining or losing host access changes which rules can apply; re-sync so the options
// page's banner and the live rule set agree.
chrome.permissions.onAdded.addListener(resync)
chrome.permissions.onRemoved.addListener(resync)

// Q2: the toolbar icon opens the options page. This only fires because the manifest has
// no `default_popup` — setting one would make this dead code with no error.
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage()
})
