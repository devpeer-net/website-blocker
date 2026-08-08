import type { Tip } from '@/core/tips'
import { Button } from '@/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog'

interface Props {
  open: boolean
  tip: Tip
  onConfirm: () => void
  onCancel: () => void
}

/**
 * F2/F3: turning blocking off must not be a single reflexive click.
 *
 * The friction is deliberate and lives only here — adding and removing individual sites
 * stays frictionless. Escape and backdrop clicks are prevented, so dismissing the dialog
 * requires choosing one of the two buttons; Cancel holds focus.
 */
export function ConfirmDisableDialog({ open, tip, onConfirm, onCancel }: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        aria-describedby="confirm-tip"
      >
        <DialogTitle className="text-lg font-semibold text-fg">Are you sure?</DialogTitle>

        <DialogDescription className="mt-2 text-sm text-fg-muted">
          Blocking will be turned off for every site on your list.
        </DialogDescription>

        <div
          id="confirm-tip"
          data-testid="tip"
          className="mt-5 rounded-[var(--radius)] border border-border bg-accent-soft/60 p-4"
        >
          <p className="text-sm leading-relaxed text-fg">
            <span className="font-semibold text-accent">Tip: </span>
            <span data-testid="tip-text">{tip.text}</span>
          </p>
          <a
            data-testid="tip-source"
            href={tip.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs text-fg-muted underline underline-offset-2 hover:text-fg"
          >
            {tip.source}
          </a>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          {/* The safe choice holds focus, so Enter never turns blocking off by reflex. */}
          <Button variant="secondary" onClick={onCancel} autoFocus>
            Keep blocking
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Yes, turn it off
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
