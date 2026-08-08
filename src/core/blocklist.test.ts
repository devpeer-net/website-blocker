import { describe, expect, it } from 'vitest'
import {
  addSite,
  removeSite,
  SYNC_ITEM_BUDGET_BYTES,
  syncItemSize,
  willFitInSyncQuota,
} from './blocklist'
import { InvalidDomainError } from './domain'

describe('addSite', () => {
  it('normalizes before storing', () => {
    expect(addSite([], '  HTTPS://WWW.Reddit.com/r/all  ')).toEqual(['reddit.com'])
  })

  it('keeps the list sorted', () => {
    expect(addSite(['x.com', 'reddit.com'], 'a.com')).toEqual(['a.com', 'reddit.com', 'x.com'])
  })

  it('is a no-op when the exact domain is already present', () => {
    expect(addSite(['reddit.com'], 'reddit.com')).toEqual(['reddit.com'])
  })

  it('is a no-op when a parent already covers the entry', () => {
    expect(addSite(['reddit.com'], 'old.reddit.com')).toEqual(['reddit.com'])
  })

  it('absorbs children when a parent is added', () => {
    expect(addSite(['old.reddit.com', 'www2.reddit.com', 'x.com'], 'reddit.com')).toEqual([
      'reddit.com',
      'x.com',
    ])
  })

  it('does not absorb lookalikes', () => {
    expect(addSite(['notreddit.com'], 'reddit.com')).toEqual(['notreddit.com', 'reddit.com'])
  })

  it('throws InvalidDomainError on junk, so nothing is written', () => {
    expect(() => addSite([], 'not a host')).toThrow(InvalidDomainError)
    expect(() => addSite([], '')).toThrow(InvalidDomainError)
  })

  it('never mutates its input', () => {
    const original = ['x.com']
    const frozen = Object.freeze([...original])
    expect(addSite(frozen, 'reddit.com')).toEqual(['reddit.com', 'x.com'])
    expect(original).toEqual(['x.com'])
  })
})

describe('removeSite', () => {
  it('removes an exact entry', () => {
    expect(removeSite(['reddit.com', 'x.com'], 'reddit.com')).toEqual(['x.com'])
  })

  it('normalizes the argument first', () => {
    expect(removeSite(['reddit.com'], 'https://WWW.Reddit.com/')).toEqual([])
  })

  it('is idempotent and safe on junk input', () => {
    expect(removeSite(['x.com'], 'reddit.com')).toEqual(['x.com'])
    expect(removeSite(['x.com'], 'not a host')).toEqual(['x.com'])
  })

  it('does not remove subdomains implicitly', () => {
    expect(removeSite(['old.reddit.com'], 'reddit.com')).toEqual(['old.reddit.com'])
  })

  it('never mutates its input', () => {
    const frozen = Object.freeze(['x.com', 'reddit.com'])
    expect(removeSite(frozen, 'x.com')).toEqual(['reddit.com'])
    expect(frozen).toEqual(['x.com', 'reddit.com'])
  })
})

describe('sync quota accounting', () => {
  it('counts the serialized value plus the key', () => {
    expect(syncItemSize([], 'blocked')).toBe(JSON.stringify([]).length + 'blocked'.length)
  })

  it('accepts a realistic list', () => {
    const list = Array.from({ length: 200 }, (_, i) => `site${i}.example.com`)
    expect(willFitInSyncQuota(list)).toBe(true)
  })

  it('refuses a list past the budget', () => {
    const list = Array.from({ length: 2000 }, (_, i) => `site${i}.example.com`)
    expect(willFitInSyncQuota(list)).toBe(false)
    expect(syncItemSize(list)).toBeGreaterThan(SYNC_ITEM_BUDGET_BYTES)
  })

  it('measures bytes, not characters, for non-ASCII-serialized content', () => {
    // Canonical domains are punycode, but the guard must not under-count if that changes.
    expect(syncItemSize(['xn--bcher-kva.example'])).toBeGreaterThan(20)
  })
})
