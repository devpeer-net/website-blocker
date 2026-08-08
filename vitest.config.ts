import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// `environment: 'node'` on purpose: everything under src/core is pure, so there is no
// `chrome` namespace and no DOM to fake. That is the whole point of the core/platform split.
export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**'],
      thresholds: { lines: 95, branches: 90, functions: 100, statements: 95 },
    },
  },
})
