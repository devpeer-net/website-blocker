/**
 * The block page.
 *
 * SECURITY: this page runs on the chrome-extension:// origin with the extension's
 * privileges, and it renders a value derived from a URL an attacker can craft (anyone can
 * link to blocked.html#<anything>). An innerHTML sink here is extension-privileged XSS.
 *
 * Therefore, without exception:
 *   - parse the fragment through the URL parser and accept only http(s);
 *   - render the host only after confirming it is actually on the user's blocklist;
 *   - write through textContent, never innerHTML/insertAdjacentHTML;
 *   - never derive an href from the fragment. The only link is a static relative path.
 */
import '@/styles/app.css'
import { covers, normalizeDomain } from '@/core/domain'
import { pickTip } from '@/core/tips'
import { getBlocklist } from '@/platform/storage'

function hostFromFragment(fragment: string): string | null {
  if (!fragment) return null
  let raw: string
  try {
    raw = decodeURIComponent(fragment)
  } catch {
    return null
  }
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.hostname
  } catch {
    return null
  }
}

async function render(): Promise<void> {
  const hostEl = document.getElementById('host')
  const tipTextEl = document.getElementById('tip-text')
  const tipSourceSlot = document.getElementById('tip-source-slot')
  if (!hostEl || !tipTextEl || !tipSourceSlot) return

  const tip = pickTip(Date.now())
  tipTextEl.textContent = tip.text

  const citation = document.createElement('a')
  citation.id = 'tip-source'
  citation.textContent = tip.source
  citation.href = tip.url // corpus-controlled, never derived from the fragment
  citation.target = '_blank'
  citation.rel = 'noreferrer'
  citation.className = 'text-fg-muted underline underline-offset-2 hover:text-fg'
  tipSourceSlot.appendChild(citation)

  const host = hostFromFragment(window.location.hash.slice(1))
  if (host) {
    // Defence in depth: only name a host we can confirm is on the user's own list.
    const candidate = normalizeDomain(host)
    const blocked = await getBlocklist()
    if (candidate && blocked.some((domain) => covers(domain, candidate))) {
      hostEl.textContent = candidate
    }
  }

  // Stop the blocked URL sitting in the omnibox and in history.
  window.history.replaceState(null, '', window.location.pathname)
}

void render()
