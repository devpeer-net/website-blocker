/**
 * Pin a deterministic extension ID for the E2E suite.
 *
 * Chrome derives an unpacked extension's ID from its `key` field, so injecting a fixed
 * public key lets tests build `chrome-extension://<id>/...` URLs without racing the
 * service worker to discover the ID at runtime.
 *
 * This key is TEST-ONLY and lives here rather than in public/manifest.json on purpose: a
 * self-generated key pins an ID that will not match the Web Store item. `pnpm package`
 * never runs this script, so the shipped zip has no `key`.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const TEST_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAy8e2nhd6zzNBT1dlKVBqvU6AL8VVT6w1SIu0gRVPnaErOD449v7CgFEzBzvwJvcNEsU9UKxbhLW6FxE+KjavLw33WvV0tqORIZOly+K1JorI4zycUdKW+MCe8U4296Kvh+YpbAjLZpv0IXYAhAN0PvADAY5MjajyVg1N/9JhK5LNegCIDeuPBV4Vr0Ta3Utle25AY32oT179URDrrlim3412rxGlsxHcd6OohuU1VYMZlmY68FLfx4DD81BQmdGiodpo66yw2lzFR1SftA4UxKbQMbPMXxOhkJEt+og2cHN0dNcObmByjhspxAFaECLHuKImhgxM8RgeCdSfRSvCRQIDAQAB'

/** Chrome's ID algorithm: SHA-256(DER SPKI) -> first 16 bytes -> hex -> 0-9a-f mapped to a-p. */
export function idFromKey(base64Key) {
  return [...createHash('sha256').update(Buffer.from(base64Key, 'base64')).digest().subarray(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .replace(/[0-9a-f]/g, (char) => String.fromCharCode(97 + Number.parseInt(char, 16)))
}

export const TEST_EXTENSION_ID = idFromKey(TEST_KEY)

// pathToFileURL, not string concatenation: import.meta.url is percent-encoded, so a
// checkout under a path containing a space or a non-ASCII character would never match and
// the key would silently not be injected — leaving the E2E suite chasing a random ID.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifestPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.key = TEST_KEY
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`injected test key into dist/manifest.json -> ${TEST_EXTENSION_ID}`)
}
