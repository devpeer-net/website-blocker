import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Surfaces the failure modes that are otherwise silent: a rejected rule update, entries
 * that could not be turned into rules, host access restricted to "on click", and the
 * incognito gap. Each of these would otherwise leave the UI confidently reporting a
 * protection the user does not actually have.
 */
export function StatusBanner({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="mt-4 flex gap-3 rounded-[var(--radius)] border border-warning/40 bg-warning-soft p-3 text-sm text-fg"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="[&_a]:underline [&_a]:underline-offset-2">{children}</div>
    </div>
  )
}
