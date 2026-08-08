import { describe, expect, it } from 'vitest'
import { pickTip, TIPS } from './tips'

describe('tips corpus', () => {
  it('is large enough that the dialog does not feel repetitive', () => {
    expect(TIPS.length).toBeGreaterThanOrEqual(20)
  })

  it('has no duplicate texts', () => {
    expect(new Set(TIPS.map((t) => t.text)).size).toBe(TIPS.length)
  })

  it('gives every tip all four fields', () => {
    for (const tip of TIPS) {
      expect(Object.keys(tip).sort()).toEqual(['category', 'source', 'text', 'url'])
    }
  })

  it('cites a resolvable DOI or journal URL for every tip', () => {
    for (const tip of TIPS) {
      expect(tip.url, tip.text).toMatch(/^https:\/\/(doi\.org|pubmed\.ncbi\.nlm\.nih\.gov)\//)
    }
  })

  it('names authors and a year in every citation', () => {
    for (const tip of TIPS) {
      expect(tip.source, tip.text).toMatch(/\b(19|20)\d{2}\b/)
    }
  })

  it('keeps every tip short enough to read in a modal', () => {
    for (const tip of TIPS) {
      const words = tip.text.trim().split(/\s+/).length
      expect(words, tip.text).toBeLessThanOrEqual(40)
      expect(words, tip.text).toBeGreaterThanOrEqual(8)
    }
  })

  it('covers doom-scrolling and attention, the SRS focus areas', () => {
    const categories = new Set(TIPS.map((t) => t.category))
    expect(categories).toContain('doomscrolling')
    expect(categories).toContain('attention')
    expect(categories.size).toBeGreaterThanOrEqual(4)
  })

  it('stays non-judgmental: no shaming second-person imperatives', () => {
    for (const tip of TIPS) {
      expect(tip.text, tip.text).not.toMatch(/\b(you should|you must|stop being|lazy|weak)\b/i)
    }
  })
})

describe('pickTip', () => {
  it('is deterministic for a fixed seed', () => {
    expect(pickTip(42)).toBe(pickTip(42))
  })

  it('always returns a member of the corpus', () => {
    for (const seed of [0, 1, 37, 38, 12345, Date.parse('2026-08-08')]) {
      expect(TIPS).toContain(pickTip(seed))
    }
  })

  it('handles negative and fractional seeds without going out of bounds', () => {
    expect(TIPS).toContain(pickTip(-1))
    expect(TIPS).toContain(pickTip(-999.7))
    expect(TIPS).toContain(pickTip(3.9))
  })

  it('reaches every tip across consecutive seeds', () => {
    const seen = new Set(Array.from({ length: TIPS.length }, (_, i) => pickTip(i).text))
    expect(seen.size).toBe(TIPS.length)
  })
})
