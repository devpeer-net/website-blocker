/**
 * Blocklist semantics. Pure — every function returns a new array and never mutates input.
 */
import { covers, type Domain, InvalidDomainError, normalizeDomain } from './domain'

/**
 * chrome.storage.sync caps a single item at QUOTA_BYTES_PER_ITEM = 8192 bytes, counting
 * the serialized value plus the key. We leave headroom rather than sail up to the line.
 */
export const SYNC_ITEM_BUDGET_BYTES = 8000

/**
 * Add a site. Throws InvalidDomainError so the caller can render an inline field error.
 *
 * Two absorption rules keep the list minimal and the rule set honest:
 *  - adding a domain already covered by a parent is a no-op;
 *  - adding a parent removes the children it now covers.
 */
export function addSite(list: readonly Domain[], input: string): Domain[] {
  const domain = normalizeDomain(input)
  if (!domain) throw new InvalidDomainError(input)

  if (list.some((parent) => covers(parent, domain))) return [...list]
  return [...list.filter((child) => !covers(domain, child)), domain].sort()
}

/** Remove a site. Normalises first, so removing "https://Reddit.com/" removes "reddit.com". */
export function removeSite(list: readonly Domain[], input: string): Domain[] {
  const domain = normalizeDomain(input)
  if (!domain) return [...list]
  return list.filter((entry) => entry !== domain)
}

/** Byte size of the list as chrome.storage.sync will account for it (value + key). */
export function syncItemSize(list: readonly Domain[], key = 'blocked'): number {
  return new TextEncoder().encode(JSON.stringify(list)).length + key.length
}

/** False once the list would no longer fit in a single storage.sync item. */
export function willFitInSyncQuota(list: readonly Domain[], key = 'blocked'): boolean {
  return syncItemSize(list, key) <= SYNC_ITEM_BUDGET_BYTES
}
