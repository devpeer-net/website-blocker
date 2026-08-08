/**
 * The only module that reads or writes chrome.storage.
 *
 * Layout, and why each key lives where it does:
 *   sync.blocked      Domain[]  the blocklist — follows the user to every signed-in Chrome
 *   local.storeLocally boolean  this device opted out of sync after hitting the 8 KB cap
 *   local.blocked     Domain[]  the blocklist when storeLocally is set
 *   local.paused      boolean   pausing on your laptop must NOT unblock your desktop
 *   local.lastSyncError string|null  surfaced by the options page; never swallowed
 *   local.invalidEntries string[]    entries that could not be turned into rules
 *
 * `storeLocally` MUST stay in local storage. Synced, it would propagate to every other
 * device, where local.blocked is empty — so each of them would read an empty blocklist,
 * drop all their rules, and silently stop blocking anything.
 */
import type { Domain } from '@/core/domain'

export interface Status {
  blocked: Domain[]
  paused: boolean
  storeLocally: boolean
  lastSyncError: string | null
  invalidEntries: string[]
}

export async function isStoredLocally(): Promise<boolean> {
  const { storeLocally = false } = await chrome.storage.local.get('storeLocally')
  return storeLocally as boolean
}

export async function getBlocklist(): Promise<Domain[]> {
  const area = (await isStoredLocally()) ? chrome.storage.local : chrome.storage.sync
  const { blocked = [] } = await area.get('blocked')
  if (!Array.isArray(blocked)) return []
  // Stored data is untrusted: it may come from a future version, a corrupted sync
  // payload, or a hand-edited profile. A single non-string here would otherwise throw
  // deep inside addSite and wedge the options page.
  return blocked.filter((entry): entry is Domain => typeof entry === 'string')
}

/** Rejects if the value exceeds the storage quota — always await and catch. */
export async function setBlocklist(list: readonly Domain[]): Promise<void> {
  const area = (await isStoredLocally()) ? chrome.storage.local : chrome.storage.sync
  await area.set({ blocked: [...list] })
}

/**
 * Move the list to device-local storage — the escape hatch when sync's 8 KB item cap
 * bites. Only this device is affected; other devices keep syncing normally.
 *
 * The synced copy is deliberately left in place. Deleting it would destroy the only
 * off-device backup of the list to save a few kilobytes of a 100 KB quota, and this
 * device stops reading it the moment `storeLocally` is set.
 */
export async function moveToLocalStorage(): Promise<void> {
  const list = await getBlocklist()
  await chrome.storage.local.set({ blocked: list })
  await chrome.storage.local.set({ storeLocally: true })
}

export async function getPaused(): Promise<boolean> {
  const { paused = false } = await chrome.storage.local.get('paused')
  return paused as boolean
}

export async function setPaused(paused: boolean): Promise<void> {
  await chrome.storage.local.set({ paused })
}

export async function getStatus(): Promise<Status> {
  const [blocked, paused, storeLocally, local] = await Promise.all([
    getBlocklist(),
    getPaused(),
    isStoredLocally(),
    chrome.storage.local.get(['lastSyncError', 'invalidEntries']),
  ])
  return {
    blocked,
    paused,
    storeLocally,
    lastSyncError: (local.lastSyncError as string | null) ?? null,
    invalidEntries: (local.invalidEntries as string[] | undefined) ?? [],
  }
}

/**
 * Keys that determine the rule set. The service worker watches only these.
 *
 * `lastSyncError` and `invalidEntries` are deliberately excluded: syncRules() writes them
 * on every run, so watching them would make the worker retrigger itself. Today Chrome
 * suppresses onChanged for identical values, but that is an implementation detail to rely
 * on, not a design.
 */
const RULE_INPUT_KEYS: readonly string[] = ['blocked', 'paused', 'storeLocally']

/** Everything the options page renders, including the diagnostics written by a sync. */
const UI_KEYS: readonly string[] = [...RULE_INPUT_KEYS, 'lastSyncError', 'invalidEntries']

function subscribe(keys: readonly string[], listener: () => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (Object.keys(changes).some((key) => keys.includes(key))) listener()
  }
  chrome.storage.onChanged.addListener(handler)
  return () => chrome.storage.onChanged.removeListener(handler)
}

/**
 * Storage is the only channel between the options page and the blocking engine, so these
 * two subscriptions are what replace message passing in this codebase.
 */
export const onRuleInputChanged = (listener: () => void) => subscribe(RULE_INPUT_KEYS, listener)
export const onStoredStateChanged = (listener: () => void) => subscribe(UI_KEYS, listener)
