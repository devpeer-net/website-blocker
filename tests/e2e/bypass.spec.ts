import { expectRuleState } from './dnr'
import { expect, test } from './fixtures'

/**
 * The ways a distracted user actually tries to get around a blocker. Each of these was an
 * open question during design; encoding them as tests turns the answers into regression
 * protection rather than a note in a document.
 */

const SUBJECT = 'http://distraction.test/'

async function block(optionsPage: import('@playwright/test').Page, domain = 'distraction.test') {
  await optionsPage.getByLabel('Add a website').fill(domain)
  await optionsPage.getByRole('button', { name: 'Add' }).click()
  await expectRuleState(optionsPage, `http://${domain}/`, 'blocked')
}

test('going Back from the block page does not resurrect the site', async ({
  page,
  optionsPage,
  extensionId,
}) => {
  await block(optionsPage)

  await page.goto('http://allowed.test/')
  await page.goto(SUBJECT)
  await expect(page).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/blocked\\.html`))

  await page.goBack()

  // Wherever Back lands, it must not be the blocked site's real content. Assert absence
  // with toHaveCount(0): not.toHaveText() fails when the element is missing entirely,
  // which is the very case we are trying to allow.
  await expect(page.locator('#real-site')).not.toHaveText('REAL SITE: distraction.test')

  await page.goForward().catch(() => {})
  await expect(page.locator('#real-site')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /is blocked/i })).toBeVisible()
})

test('a tab already open on a site is swept when the site gets blocked', async ({
  page,
  optionsPage,
  extensionId,
}) => {
  // The user is already doom-scrolling when they decide to block the site.
  await page.goto(SUBJECT)
  await expect(page.locator('#real-site')).toHaveText('REAL SITE: distraction.test')

  await block(optionsPage)

  // declarativeNetRequest only sees new requests, so this open tab is only covered
  // because syncRules() sweeps it. Without that, the page would sit there working.
  await expect(page).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/blocked\\.html`), {
    timeout: 5_000,
  })
})

test('opening a blocked site in a new tab is blocked too', async ({ context, optionsPage }) => {
  await block(optionsPage)

  const fresh = await context.newPage()
  await fresh.goto(SUBJECT)
  await expect(fresh.locator('#real-site')).toHaveCount(0)
  await fresh.close()
})

test('the block page cannot be tricked into naming a site the user never blocked', async ({
  page,
  optionsPage,
  extensionId,
}) => {
  await block(optionsPage)

  // Anyone can link to blocked.html with an arbitrary fragment. The page must not echo it.
  await page.goto(
    `chrome-extension://${extensionId}/blocked.html#https://totally-unrelated.example/`,
  )
  await expect(page.locator('#host')).toHaveText('this site')

  // And it must not render markup from the fragment.
  await page.goto(
    `chrome-extension://${extensionId}/blocked.html#${encodeURIComponent(
      'https://x.test/<img src=x onerror="document.title=\'pwned\'">',
    )}`,
  )
  await expect(page.locator('#host')).toHaveText('this site')
  await expect(page.locator('img')).toHaveCount(0)
  expect(await page.title()).not.toBe('pwned')
})
