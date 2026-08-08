import { defineConfig } from '@playwright/test'

// No `projects` / `devices` block on purpose: devices['Desktop Chrome'] sets
// channel:'chrome', and branded Chrome dropped --load-extension (137) and
// --disable-extensions-except (139). Extensions only side-load in Chromium /
// Chrome for Testing, so the context fixture owns the launch entirely.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Each test launches its own persistent Chromium profile, which is heavy. Left
  // unbounded, Playwright spawns one per core and the contention alone times tests out.
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 2 : 0,
  timeout: 30_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'on-first-retry', screenshot: 'only-on-failure' },
})
