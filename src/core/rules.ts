/**
 * declarativeNetRequest rule construction. Pure — plain objects in, plain objects out,
 * so the entire rule set is snapshot-testable without a browser.
 */
import type { Domain } from './domain'

/**
 * A structural subset of the declarativeNetRequest rule shape — just the fields this
 * extension emits. Declared here rather than imported from chrome-types so that
 * src/core stays free of the `chrome` namespace even in type position, which is what
 * lets purity.test.ts be an absolute textual check instead of a heuristic one.
 * platform/sync.ts is the single place these cross into the real API.
 */
export interface BlockingRule {
  id: number
  priority: number
  action: { type: 'redirect'; redirect: { regexSubstitution: string } } | { type: 'block' }
  condition: {
    requestDomains: string[]
    regexFilter?: string
    resourceTypes: ['main_frame']
  }
}

/** Blocking rules start here, leaving low ids free for reserved singletons. */
export const RULE_ID_BASE = 1000
/** Domains per rule. Keeps rule count at O(entries/500), far under every DNR cap. */
export const CHUNK_SIZE = 500

export interface BuildRulesOptions {
  paused: boolean
  /** chrome.runtime.getURL('blocked.html') — injected so this module stays pure. */
  blockedPageUrl: string
}

/**
 * Two rules per chunk of domains, on purpose:
 *
 *  - priority 2 `redirect` sends the user to our block page with the original URL in the
 *    fragment. `redirect` is an *unsafe* action and needs host permission.
 *  - priority 1 `block` is a safe action Chrome grants implicit access to with no host
 *    permission at all. If the user sets site access to "on click", the redirect stops
 *    applying and this rule still stops the navigation — the blocker degrades to a grey
 *    interstitial instead of silently becoming a no-op that still reports "ON".
 *
 * `resourceTypes: ['main_frame']` is mandatory, not decorative: Chrome's documented
 * default is "all resource types EXCEPT main_frame", so omitting it ships a blocker that
 * kills images and XHR but never the page.
 *
 * Pausing emits no rules at all. An `allow` rule that overrides blocking rules we could
 * simply not emit would be a second mechanism doing the first one's job.
 */
export function buildRules(domains: readonly Domain[], options: BuildRulesOptions): BlockingRule[] {
  if (options.paused) return []

  const rules: BlockingRule[] = []

  for (let i = 0; i * CHUNK_SIZE < domains.length; i++) {
    const requestDomains = domains.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) as string[]

    rules.push({
      id: RULE_ID_BASE + i * 2,
      priority: 2,
      action: {
        type: 'redirect',
        // `^https?://.*` makes \0 the entire matched URL, so the result is exactly
        // <blocked.html>#<original url>. A fragment, not a query parameter: with
        // `?url=...` a blocked URL's own `&foo=bar` would become a parameter of our page.
        redirect: { regexSubstitution: `${options.blockedPageUrl}#\\0` },
      },
      condition: {
        requestDomains,
        regexFilter: '^https?://.*',
        resourceTypes: ['main_frame'],
      },
    })

    rules.push({
      id: RULE_ID_BASE + i * 2 + 1,
      priority: 1,
      action: { type: 'block' },
      condition: {
        requestDomains,
        resourceTypes: ['main_frame'],
      },
    })
  }

  return rules
}
