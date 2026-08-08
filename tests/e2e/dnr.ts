import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { RULE_ID_BASE } from '../../src/core/rules'

/**
 * Ask the live matcher what would happen to a URL, rather than sleeping and hoping.
 *
 * testMatchOutcome is unpacked-only and needs no extra permission, which is exactly our
 * situation. It is evaluated from an extension *page*, never the service worker: a
 * Worker handle survives MV3 idle suspension, but an evaluate() in flight when the
 * worker is torn down throws "Service worker restarted".
 */
async function probe(page: Page, url: string): Promise<'blocked' | 'allowed'> {
  const ids = await page.evaluate(async (target) => {
    const outcome = await chrome.declarativeNetRequest.testMatchOutcome({
      url: target,
      type: 'main_frame',
      method: 'get',
      tabId: -1,
    })
    return outcome.matchedRules.map((rule) => rule.ruleId)
  }, url)

  // Inspect ids, not the count: matchedRules reports every matching rule.
  return ids.some((id) => id >= RULE_ID_BASE) ? 'blocked' : 'allowed'
}

export async function expectRuleState(
  page: Page,
  url: string,
  state: 'blocked' | 'allowed',
  timeout = 5_000,
): Promise<void> {
  await expect
    .poll(() => probe(page, url), {
      timeout,
      message: `rules never reached "${state}" for ${url}`,
    })
    .toBe(state)
}

/** SRS Q4: rules must take effect within ~1s of the user's edit. Measured, not assumed. */
export async function measureRuleLatency(
  page: Page,
  url: string,
  state: 'blocked' | 'allowed',
  act: () => Promise<void>,
): Promise<number> {
  const started = Date.now()
  await act()
  await expectRuleState(page, url, state)
  return Date.now() - started
}
