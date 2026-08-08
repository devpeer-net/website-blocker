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

  // Strip EVERY trailing dot, not just one: "reddit.com.." would otherwise canonicalise
  // to "reddit.com.", which normalizes again to something different — and an entry that
  // is not its own canonical form can never be matched for removal.
  let host = url.hostname.replace(/\.+$/, '')

  if (host.startsWith('[')) {
    // IPv6 literal. Validate explicitly rather than trusting the caller's provenance.
    return /^\[[0-9a-f:.]+\]$/.test(host) ? host : null
  }

  // Strip leading "www." labels exhaustively, for the same reason as the trailing dots:
  // stripping only one leaves "www.www.example.com" as "www.example.com", which is not
  // its own canonical form and so could never be matched for removal.
  //
  // Stripping at all is a deliberate trade. Someone pasting https://www.reddit.com/r/all
  // means "block Reddit", and keeping the www would leave old.reddit.com and bare
  // reddit.com reachable — a blocker that quietly fails to block. The cost is that
  // "www.google.com" widens to all of google.com. Over-blocking is the safe direction
  // here, and the list shows the canonical form immediately, so the widening is visible.
  while (host.startsWith('www.')) host = host.slice(4)
  if (!host.includes('.')) return null // reject "reddit", "localhost"

  // Every label must be a legal host label. declarativeNetRequest rejects the whole
  // atomic update if a requestDomains entry is not lowercase ASCII, and a malformed
  // label that slips through simply never matches — an entry the user believes is live.
  const labels = host.split('.')
  if (!labels.every((label) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label))) return null

  return host
}

/** True when `host` is `parent` or any subdomain of it. Label-boundary aware. */
export function covers(parent: Domain, host: Domain): boolean {
  return host === parent || host.endsWith(`.${parent}`)
}
