import { X } from 'lucide-react'
import type { Domain } from '@/core/domain'
import { Button } from '@/ui/button'

interface Props {
  sites: readonly Domain[]
  onRemove: (domain: Domain) => void
}

/**
 * Q3: fixed height, scrolls when entries overflow, so the page never grows with the list.
 * Domains render monospaced — they are identifiers, and `reddit.com` must be
 * distinguishable from `redditt.com` at a glance.
 *
 * Removal is intentionally unguarded: the friction in this product lives on the master
 * toggle alone.
 */
export function BlockList({ sites, onRemove }: Props) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
        Blocked sites ({sites.length})
      </h2>

      <div
        data-testid="blocklist"
        className="h-72 overflow-y-auto rounded-[var(--radius)] border border-border bg-surface"
      >
        {sites.length === 0 ? (
          <p className="flex h-full items-center justify-center px-6 text-center text-sm text-fg-muted">
            Nothing blocked yet. Add the site you reach for when work gets hard.
          </p>
        ) : (
          <ul>
            {sites.map((site) => (
              <li
                key={site}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-surface-2"
              >
                <span className="truncate font-mono text-sm text-fg">{site}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${site}`}
                  onClick={() => onRemove(site)}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
