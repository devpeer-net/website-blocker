import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type BrowserContext,
  test as base,
  chromium,
  type Page,
  expect as pwExpect,
} from '@playwright/test'
import { TEST_EXTENSION_ID } from '../../scripts/inject-test-key.mjs'
import { type FakeWeb, startFakeWeb } from './fake-web'

const here = path.dirname(fileURLToPath(import.meta.url))
export const EXTENSION_PATH = path.resolve(here, '../../dist')

interface Fixtures {
  context: BrowserContext
  extensionId: string
  optionsPage: Page
}

interface WorkerFixtures {
  fakeWeb: FakeWeb
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  // One server per Playwright worker, so parallel workers get distinct ports.
  fakeWeb: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads fixture dependencies off this destructuring pattern; empty means "depends on nothing".
    async ({}, use) => {
      const server = await startFakeWeb()
      await use(server)
      await server.close()
    },
    { scope: 'worker' },
  ],

  context: async ({ fakeWeb }, use) => {
    const context = await chromium.launchPersistentContext('', {
      // REQUIRED. Plain `chromium` launches chromium-headless-shell, which has no
      // extension support; `channel: 'chromium'` selects the full browser running
      // Chrome's new headless. Branded `chrome` cannot side-load extensions at all —
      // it dropped --load-extension in 137 and --disable-extensions-except in 139.
      channel: 'chromium',
      // NOT `!process.env.HEADED` — the string "0" is truthy.
      headless: process.env.HEADED !== '1',
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        // One comma-separated flag; Chromium's switch map is last-one-wins. Scoped to
        // *.test rather than `MAP *`, which would break Chrome's own network calls.
        `--host-resolver-rules=MAP *.test 127.0.0.1:${fakeWeb.port}`,
        // Do NOT add --disable-features here: Playwright already passes its own, and a
        // second one would replace it, silently re-enabling PaintHolding and friends.
      ],
    })
    await use(context)
    await context.close()
  },

  extensionId: async ({ context }, use) => {
    // The ID is derived from the test-only manifest key, so there is no service-worker
    // race to lose. The probe below is what proves the extension actually loaded — a
    // pinned ID would otherwise hide a failed load until a confusing later assertion.
    const probe = await context.newPage()
    await probe.goto(`chrome-extension://${TEST_EXTENSION_ID}/options.html`)
    pwExpect(await probe.evaluate(() => chrome.runtime.id)).toBe(TEST_EXTENSION_ID)
    await probe.close()
    await use(TEST_EXTENSION_ID)
  },

  // Always a NEW page: under UI mode the built-in `page` fixture reuses pages()[0], so a
  // spec taking both `page` and `optionsPage` would otherwise drive a single tab.
  optionsPage: async ({ context, extensionId }, use) => {
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await use(page)
    await page.close()
  },
})

export const expect = test.expect
