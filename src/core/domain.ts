/**
 * Domain canonicalisation. Pure — no `chrome` namespace, no DOM.
 *
 * The canonical form of an entry is the WHATWG-parsed hostname, lowercased and
 * punycoded by the platform URL parser, with a trailing root dot removed and exactly
 * one leading `www.` label stripped. No other label is ever stripped, and there is
 * deliberately no Public Suffix List: the only thing a PSL buys is refusing `co.uk`,
 * which is the user typing precisely what they asked for.
 */

/** A canonical host: lowercase ASCII/punycode, no scheme, port, path or trailing dot. */
export type Domain = string

export class InvalidDomainError extends Error {
  constructor(readonly input: string) {
    super(`Not a valid website: "${input}"`)
    this.name = 'InvalidDomainError'
  }
}

/**
 * Parse anything a user might paste — a full URL, a bare host, a wildcard, mixed case —
 * into a canonical domain. Returns null when the input cannot be a website.
 */
export function normalizeDomain(input: string): Domain | null {
  let s = input.trim().toLowerCase()
  if (!s) return null

  s = s.replace(/^\*\.?/, '') // "*.reddit.com" -> "reddit.com"
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = `https://${s}`

  let url: URL
  try {
    url = new URL(s)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  let host = url.hostname.replace(/\.$/, '')
  if (host.startsWith('www.')) host = host.slice(4)

  if (host.startsWith('[')) return host // IPv6 literal, already canonicalised by URL
  if (!host.includes('.')) return null // reject "reddit", "localhost"
  // declarativeNetRequest rejects the whole atomic update if any requestDomains entry is
  // not lowercase ASCII, so anything the URL parser could not punycode is refused here.
  if (!/^[a-z0-9.-]+$/.test(host)) return null
  if (host.startsWith('.') || host.endsWith('-') || host.includes('..')) return null

  return host
}

/** True when `host` is `parent` or any subdomain of it. Label-boundary aware. */
export function covers(parent: Domain, host: Domain): boolean {
  return host === parent || host.endsWith(`.${parent}`)
}
