/**
 * The only module that reads or writes chrome.storage.
 *
 * Layout, and why each key lives where it does:
 *   sync.blocked      Domain[]  the blocklist — follows the user to every signed-in Chrome
 *   sync.storeLocally boolean   user opted out of sync after hitting the 8 KB item quota
 *   local.blocked     Domain[]  the blocklist when storeLocally is set
 *   local.paused      boolean   pausing on your laptop must NOT unblock your desktop
 *   local.lastSyncError string|null  surfaced by the options page; never swallowed
 *   local.invalidEntries string[]    entries that could not be turned into rules
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
  const { storeLocally = false } = await chrome.storage.sync.get('storeLocally')
  return storeLocally as boolean
}

export async function getBlocklist(): Promise<Domain[]> {
  const area = (await isStoredLocally()) ? chrome.storage.local : chrome.storage.sync
  const { blocked = [] } = await area.get('blocked')
  return Array.isArray(blocked) ? (blocked as Domain[]) : []
}

/** Rejects if the value exceeds the storage quota — always await and catch. */
export async function setBlocklist(list: readonly Domain[]): Promise<void> {
  const area = (await isStoredLocally()) ? chrome.storage.local : chrome.storage.sync
  await area.set({ blocked: [...list] })
}

/** Move the list to device-local storage. The escape hatch when sync's 8 KB item cap bites. */
export async function moveToLocalStorage(): Promise<void> {
  const list = await getBlocklist()
  await chrome.storage.local.set({ blocked: list })
  await chrome.storage.sync.set({ storeLocally: true })
  await chrome.storage.sync.remove('blocked')
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
 * Fire `listener` whenever anything this extension stores changes, in any area.
 * Both the service worker and the options page subscribe; storage is the only channel
 * between them, so there is no message passing anywhere in this codebase.
 */
export function onStoredStateChanged(listener: () => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
    const keys = Object.keys(changes)
    if (keys.some((k) => WATCHED_KEYS.includes(k))) listener()
  }
  chrome.storage.onChanged.addListener(handler)
  return () => chrome.storage.onChanged.removeListener(handler)
}

const WATCHED_KEYS: readonly string[] = [
  'blocked',
  'paused',
  'storeLocally',
  'lastSyncError',
  'invalidEntries',
]
