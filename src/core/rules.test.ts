import { describe, expect, it } from 'vitest'
import { buildRules, CHUNK_SIZE, RULE_ID_BASE } from './rules'

const BLOCKED_PAGE = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/blocked.html'
const opts = { paused: false, blockedPageUrl: BLOCKED_PAGE }

describe('buildRules', () => {
  it('emits nothing for an empty list', () => {
    expect(buildRules([], opts)).toEqual([])
  })

  it('emits nothing while paused, however long the list', () => {
    expect(buildRules(['reddit.com', 'x.com'], { ...opts, paused: true })).toEqual([])
  })

  it('emits a redirect rule and a block rule for one chunk', () => {
    expect(buildRules(['reddit.com', 'x.com'], opts)).toEqual([
      {
        id: RULE_ID_BASE,
        priority: 2,
        action: {
          type: 'redirect',
          redirect: { regexSubstitution: `${BLOCKED_PAGE}#\\0` },
        },
        condition: {
          requestDomains: ['reddit.com', 'x.com'],
          regexFilter: '^https?://.*',
          resourceTypes: ['main_frame'],
        },
      },
      {
        id: RULE_ID_BASE + 1,
        priority: 1,
        action: { type: 'block' },
        condition: {
          requestDomains: ['reddit.com', 'x.com'],
          resourceTypes: ['main_frame'],
        },
      },
    ])
  })

  // The single highest-value assertion in the suite. Chrome's default is "all resource
  // types EXCEPT main_frame", so a rule missing this blocks images but never pages.
  it('scopes every rule to main_frame', () => {
    const rules = buildRules(['a.com', 'b.com'], opts)
    expect(rules).not.toHaveLength(0)
    for (const rule of rules) {
      expect(rule.condition.resourceTypes).toEqual(['main_frame'])
    }
  })

  it('never emits sub_frame, so third-party embeds keep working', () => {
    for (const rule of buildRules(['a.com'], opts)) {
      expect(rule.condition.resourceTypes).not.toContain('sub_frame')
    }
  })

  it('chunks at CHUNK_SIZE domains per rule', () => {
    const domains = Array.from({ length: CHUNK_SIZE + 1 }, (_, i) => `site${i}.example.com`)
    const rules = buildRules(domains, opts)

    expect(rules).toHaveLength(4) // two chunks x (redirect + block)
    expect(rules[0]?.condition.requestDomains).toHaveLength(CHUNK_SIZE)
    expect(rules[2]?.condition.requestDomains).toHaveLength(1)
  })

  it('allocates unique, positive, deterministic ids', () => {
    const domains = Array.from({ length: CHUNK_SIZE * 3 }, (_, i) => `site${i}.example.com`)
    const ids = buildRules(domains, opts).map((r) => r.id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(Math.min(...ids)).toBeGreaterThanOrEqual(RULE_ID_BASE)
    expect(buildRules(domains, opts).map((r) => r.id)).toEqual(ids) // stable across calls
  })

  it('puts the redirect above the block so the custom page wins when it can apply', () => {
    const [redirect, block] = buildRules(['a.com'], opts)
    expect(redirect?.action.type).toBe('redirect')
    expect(block?.action.type).toBe('block')
    expect(redirect?.priority).toBeGreaterThan(block?.priority as number)
  })

  it('carries the whole original URL into the fragment, not a query parameter', () => {
    const [redirect] = buildRules(['a.com'], opts)
    expect(redirect?.action.type).toBe('redirect')
    if (redirect?.action.type !== 'redirect') throw new Error('expected a redirect rule')
    expect(redirect.action.redirect.regexSubstitution).toBe(`${BLOCKED_PAGE}#\\0`)
    expect(redirect.condition.regexFilter).toBe('^https?://.*')
  })
})
