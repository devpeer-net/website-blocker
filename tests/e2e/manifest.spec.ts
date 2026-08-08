import { expectRuleState } from './dnr'
import { expect, test } from './fixtures'

/** Cheap assertions against the live manifest for the silent-failure modes. */
test('the manifest keeps the invariants the UI depends on', async ({ optionsPage }) => {
  const manifest = await optionsPage.evaluate(() => chrome.runtime.getManifest())

  // Q1/Q2: a default_popup would make chrome.action.onClicked dead code, with no error,
  // and would add the second UI surface the SRS forbids.
  expect(manifest.action?.default_popup).toBeUndefined()

  // Embedded in chrome://extensions the Tabs API is unavailable, which would break the
  // open-tab sweep and make the page untestable.
  expect(manifest.options_ui?.open_in_tab).toBe(true)

  // Without this the redirect target is unreachable and Chrome reports a confusing
  // ERR_BLOCKED_BY_CLIENT — even though the page belongs to this extension.
  expect(manifest.web_accessible_resources?.[0]?.resources).toContain('blocked.html')

  // A committed key would pin an ID that cannot match the Web Store item. The test key
  // is injected into dist/ by scripts/inject-test-key.mjs and never shipped.
  expect(manifest.permissions).toEqual(['declarativeNetRequest', 'storage'])
})

test('every live rule is scoped to main_frame', async ({ optionsPage }) => {
  await optionsPage.getByLabel('Add a website').fill('distraction.test')
  await optionsPage.getByRole('button', { name: 'Add' }).click()
  await expectRuleState(optionsPage, 'http://distraction.test/', 'blocked')

  const rules = await optionsPage.evaluate(() => chrome.declarativeNetRequest.getDynamicRules())

  expect(rules.length).toBeGreaterThan(0)
  for (const rule of rules) {
    // Chrome's default is "all resource types EXCEPT main_frame", so a rule missing this
    // would block images and XHR on the site but never the page itself.
    expect(rule.condition.resourceTypes, JSON.stringify(rule)).toEqual(['main_frame'])
    expect(rule.condition.resourceTypes).not.toContain('sub_frame')
  }
})
