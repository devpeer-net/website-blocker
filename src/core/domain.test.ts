import { describe, expect, it } from 'vitest'
import { covers, normalizeDomain } from './domain'

describe('normalizeDomain', () => {
  const accepted: Array<[input: string, expected: string]> = [
    ['reddit.com', 'reddit.com'],
    ['  HTTPS://WWW.Reddit.COM/r/all?x=1  ', 'reddit.com'],
    ['Reddit.com.', 'reddit.com'],
    ['*.reddit.com', 'reddit.com'],
    ['*reddit.com', 'reddit.com'],
    ['http://news.ycombinator.com:8080/', 'news.ycombinator.com'],
    ['https://user:pass@x.com/path#frag', 'x.com'],
    ['news.ycombinator.com', 'news.ycombinator.com'],
    ['bücher.example', 'xn--bcher-kva.example'],
    ['WWW.WWW.example.com', 'example.com'], // every leading `www.` is stripped
    ['1.2.3.4', '1.2.3.4'],
    ['http://[2606:4700::1111]/', '[2606:4700::1111]'], // IPv6 literal, already canonical
  ]

  it.each(accepted)('normalizes %j -> %j', (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected)
  })

  const rejected = [
    '',
    '   ',
    'reddit', // no dot — not a host
    'localhost',
    'not a host',
    'javascript:alert(1)',
    'chrome://extensions',
    'file:///etc/passwd',
    'ftp://example.com',
    '...',
    'http://',
    'reddit..com', // empty label
    'reddit.com-', // trailing hyphen is not a legal host
    '.reddit.com', // leading dot
    '-.com', // label may not start with a hyphen
    '--.com',
    'a-.b.com', // inner label may not end with a hyphen
    'www.-.com', // stripping "www." must not manufacture an illegal host
    'http://[not:an:ipv6]/',
  ]

  it.each(rejected)('rejects %j', (input) => {
    expect(normalizeDomain(input)).toBeNull()
  })

  // An entry that is not its own canonical form can never be matched for removal, so
  // the UI would render a row whose ✕ button silently does nothing.
  it('is idempotent for every accepted input', () => {
    const probes = [
      ...accepted.map(([input]) => input),
      'reddit.com..', // used to canonicalise to "reddit.com.", which re-normalized differently
      'reddit.com...',
      'WWW.Reddit.COM..',
      'https://www.reddit.com./',
    ]
    for (const probe of probes) {
      const once = normalizeDomain(probe)
      if (once === null) continue
      expect(normalizeDomain(once), `${probe} -> ${once}`).toBe(once)
    }
  })

  it('collapses any number of trailing dots', () => {
    expect(normalizeDomain('reddit.com..')).toBe('reddit.com')
    expect(normalizeDomain('reddit.com...')).toBe('reddit.com')
  })

  it('only ever returns lowercase ASCII, which declarativeNetRequest requires', () => {
    for (const [input] of accepted) {
      const d = normalizeDomain(input)
      expect(d).toMatch(/^[a-z0-9.[\]:-]+$/)
    }
  })
})

describe('covers', () => {
  it('matches the domain itself and its subdomains', () => {
    expect(covers('reddit.com', 'reddit.com')).toBe(true)
    expect(covers('reddit.com', 'old.reddit.com')).toBe(true)
    expect(covers('reddit.com', 'a.b.reddit.com')).toBe(true)
  })

  it('does not match lookalikes or suffix-extended domains', () => {
    expect(covers('reddit.com', 'notreddit.com')).toBe(false)
    expect(covers('reddit.com', 'reddit.com.evil.com')).toBe(false)
    expect(covers('reddit.com', 'xreddit.com')).toBe(false)
    expect(covers('old.reddit.com', 'reddit.com')).toBe(false)
  })
})
