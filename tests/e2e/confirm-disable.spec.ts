import { expectRuleState, measureRuleLatency } from './dnr'
import { expect, test } from './fixtures'

const SUBJECT = 'http://distraction.test/'

test.beforeEach(async ({ optionsPage }) => {
  await optionsPage.getByLabel('Add a website').fill('distraction.test')
  await optionsPage.getByRole('button', { name: 'Add' }).click()
  await expectRuleState(optionsPage, SUBJECT, 'blocked')
})

// F2 + F3: this is the one place the product is deliberately hard to use.
test('turning blocking off asks for confirmation and shows a tip', async ({ optionsPage }) => {
  await optionsPage.getByRole('switch', { name: 'Blocking enabled' }).click()

  const dialog = optionsPage.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Are you sure?')

  // F3: a tip, with a real citation the user can follow.
  await expect(dialog.getByTestId('tip-text')).not.toBeEmpty()
  await expect(dialog.getByTestId('tip-source')).toHaveAttribute('href', /^https:\/\/doi\.org\//)

  // Blocking is still on while the dialog is open — nothing happens until a choice is made.
  await expectRuleState(optionsPage, SUBJECT, 'blocked')
})

test('the dialog resists casual dismissal', async ({ optionsPage }) => {
  await optionsPage.getByRole('switch', { name: 'Blocking enabled' }).click()
  const dialog = optionsPage.getByRole('dialog')
  await expect(dialog).toBeVisible()

  await optionsPage.keyboard.press('Escape')
  await expect(dialog, 'Escape must not dismiss the confirmation').toBeVisible()

  await optionsPage.mouse.click(5, 5) // outside the dialog
  await expect(dialog, 'a click outside must not dismiss the confirmation').toBeVisible()

  await expectRuleState(optionsPage, SUBJECT, 'blocked')
})

// The safe choice must hold focus. Otherwise a user hammering Enter — exactly what a
// frustrated person does — would confirm the destructive action by reflex, which is the
// behaviour F2 exists to prevent.
test('the safe choice holds focus, so Enter cannot disable blocking by reflex', async ({
  optionsPage,
}) => {
  await optionsPage.getByRole('switch', { name: 'Blocking enabled' }).click()
  const dialog = optionsPage.getByRole('dialog')
  await expect(dialog).toBeVisible()

  await expect(optionsPage.getByRole('button', { name: 'Keep blocking' })).toBeFocused()

  await optionsPage.keyboard.press('Enter')
  await expectRuleState(optionsPage, SUBJECT, 'blocked')
  await expect(optionsPage.getByRole('switch', { name: 'Blocking enabled' })).toBeChecked()
})

test('keyboard activation of the switch still goes through the confirmation', async ({
  optionsPage,
}) => {
  const toggle = optionsPage.getByRole('switch', { name: 'Blocking enabled' })
  await toggle.focus()
  await optionsPage.keyboard.press('Space')

  await expect(optionsPage.getByRole('dialog')).toBeVisible()
  await expectRuleState(optionsPage, SUBJECT, 'blocked')
})

test('cancelling leaves blocking on and the switch untouched', async ({ optionsPage }) => {
  const toggle = optionsPage.getByRole('switch', { name: 'Blocking enabled' })
  await toggle.click()

  await optionsPage.getByRole('button', { name: 'Keep blocking' }).click()

  await expect(optionsPage.getByRole('dialog')).toHaveCount(0)
  await expect(toggle).toBeChecked()
  await expectRuleState(optionsPage, SUBJECT, 'blocked')
})

test('confirming withdraws the rules, and re-enabling needs no confirmation', async ({
  optionsPage,
}) => {
  const toggle = optionsPage.getByRole('switch', { name: 'Blocking enabled' })

  const latency = await measureRuleLatency(optionsPage, SUBJECT, 'allowed', async () => {
    await toggle.click()
    await optionsPage.getByRole('button', { name: 'Yes, turn it off' }).click()
  })
  expect(latency, 'unblocking budget (SRS Q4)').toBeLessThan(1000)

  await expect(toggle).not.toBeChecked()
  await expect(optionsPage.getByTestId('status-line')).toContainText('Blocking is off')
  // The list survives a pause — pausing is not deleting.
  await expect(optionsPage.getByTestId('blocklist').getByRole('listitem')).toHaveText([
    'distraction.test',
  ])

  // Turning protection back ON is frictionless by design.
  await toggle.click()
  await expect(optionsPage.getByRole('dialog')).toHaveCount(0)
  await expectRuleState(optionsPage, SUBJECT, 'blocked')
})

test('a disabled blocker actually lets the site through', async ({ page, optionsPage }) => {
  await optionsPage.getByRole('switch', { name: 'Blocking enabled' }).click()
  await optionsPage.getByRole('button', { name: 'Yes, turn it off' }).click()
  await expectRuleState(optionsPage, SUBJECT, 'allowed')

  await page.goto(SUBJECT)
  await expect(page.locator('#real-site')).toHaveText('REAL SITE: distraction.test')
})
