import { expectRuleState, measureRuleLatency } from './dnr'
import { expect, test } from './fixtures'

const SUBJECT = 'http://distraction.test/'
const CONTROL = 'http://allowed.test/'

test('a blocked navigation lands on the block page, and the control site still loads', async ({
  page,
  optionsPage,
  extensionId,
}) => {
  // Q4: the rule must be live within ~1s of the user's edit.
  const latency = await measureRuleLatency(optionsPage, SUBJECT, 'blocked', async () => {
    await optionsPage.getByLabel('Add a website').fill('  HTTPS://WWW.Distraction.test/feed  ')
    await optionsPage.getByRole('button', { name: 'Add' }).click()
  })
  expect(latency, 'rule application budget (SRS Q4)').toBeLessThan(1000)

  // F1: normalization proven end-to-end, not just in the unit tests.
  await expect(optionsPage.getByTestId('blocklist').getByRole('listitem')).toHaveText([
    'distraction.test',
  ])

  await page.goto(SUBJECT)
  // toHaveURL auto-retries; page.url() is a non-retrying read that races the redirect.
  await expect(page).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/blocked\\.html`))
  await expect(page.getByRole('heading', { name: /is blocked/i })).toBeVisible()
  await expect(page.locator('#real-site')).toHaveCount(0) // never reached the origin

  // The block page names the site and shows a tip with its citation.
  await expect(page.locator('#host')).toHaveText('distraction.test')
  await expect(page.locator('#tip-text')).not.toBeEmpty()
  await expect(page.locator('#tip-source')).toHaveAttribute('href', /^https:\/\/doi\.org\//)

  // The original URL is not left sitting in the omnibox.
  await expect(page).toHaveURL(`chrome-extension://${extensionId}/blocked.html`)

  // CONTROL: proves the block was rule-caused, not DNS- or harness-caused.
  await page.goto(CONTROL)
  await expect(page.locator('#real-site')).toHaveText('REAL SITE: allowed.test')
})

test('blocking a domain also blocks its subdomains but not lookalikes', async ({ optionsPage }) => {
  await optionsPage.getByLabel('Add a website').fill('distraction.test')
  await optionsPage.getByRole('button', { name: 'Add' }).click()

  await expectRuleState(optionsPage, 'http://old.distraction.test/', 'blocked')
  await expectRuleState(optionsPage, 'https://a.b.distraction.test/x?y=1', 'blocked')
  await expectRuleState(optionsPage, 'http://notdistraction.test/', 'allowed')
  await expectRuleState(optionsPage, 'http://distraction.test.evil.test/', 'allowed')
})

test('removing a site unblocks it, with no confirmation in the way', async ({ optionsPage }) => {
  await optionsPage.getByLabel('Add a website').fill('distraction.test')
  await optionsPage.getByRole('button', { name: 'Add' }).click()
  await expectRuleState(optionsPage, SUBJECT, 'blocked')

  await optionsPage.getByRole('button', { name: 'Remove distraction.test' }).click()

  await expect(optionsPage.getByRole('dialog')).toHaveCount(0)
  await expectRuleState(optionsPage, SUBJECT, 'allowed')
})

test('rejects input that is not a website, and stores nothing', async ({ optionsPage }) => {
  await optionsPage.getByLabel('Add a website').fill('not a host')
  await optionsPage.getByRole('button', { name: 'Add' }).click()

  await expect(optionsPage.getByRole('alert')).toContainText('is not a website address')
  await expect(optionsPage.getByTestId('blocklist').getByRole('listitem')).toHaveCount(0)
})

test('the list scrolls inside a fixed-height box instead of growing the page (Q3)', async ({
  optionsPage,
}) => {
  // Twelve rows comfortably overflow the box; the assertion is about overflow, not count.
  const count = 12
  for (let i = 0; i < count; i++) {
    await optionsPage.getByLabel('Add a website').fill(`site${i}.distraction.test`)
    await optionsPage.getByRole('button', { name: 'Add' }).click()
    await expect(optionsPage.getByTestId('blocklist').getByRole('listitem')).toHaveCount(i + 1)
  }

  const box = optionsPage.getByTestId('blocklist')
  const { clientHeight, scrollHeight } = await box.evaluate((el) => ({
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
  }))

  expect(scrollHeight, 'content overflows').toBeGreaterThan(clientHeight)
  expect(clientHeight, 'box stays a fixed height').toBeLessThan(400)
})
