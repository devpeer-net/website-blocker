import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CORE_DIR = dirname(fileURLToPath(import.meta.url))

/** Strip block comments, line comments and string literals, leaving executable code. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''")
}

const sourceFiles = readdirSync(CORE_DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => [f, codeOnly(readFileSync(join(CORE_DIR, f), 'utf8'))] as const)

describe('src/core is pure', () => {
  it('has source files to check', () => {
    expect(sourceFiles.length).toBeGreaterThan(0)
  })

  for (const [name, code] of sourceFiles) {
    // A lint rule on the `chrome` global would miss `globalThis.chrome` and
    // `(window as any).chrome`. Reading the text catches every spelling — including type
    // positions, which is why core declares its own BlockingRule shape.
    it(`${name} does not touch the chrome namespace`, () => {
      expect(code).not.toMatch(/\bchrome\s*\./)
      expect(code).not.toMatch(/\bbrowser\s*\./)
    })

    it(`${name} imports no extension polyfill`, () => {
      expect(code).not.toMatch(/webextension-polyfill/)
      expect(code).not.toMatch(/@webext-core\//)
    })

    it(`${name} touches no browser or node globals`, () => {
      expect(code).not.toMatch(/\b(document|localStorage|window)\s*\./)
      expect(code).not.toMatch(/\bprocess\s*\.\s*env\b/)
    })
  }
})
