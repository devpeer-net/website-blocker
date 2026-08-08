import { type FormEvent, useState } from 'react'
import { Button } from '@/ui/button'

interface Props {
  onAdd: (input: string) => Promise<string | null>
  disabled?: boolean
}

/**
 * Add a site. Accepts anything recognisable — a pasted URL, a bare domain, mixed case —
 * and lets the core normalize it. Errors render inline; nothing is written on failure.
 */
export function AddSiteForm({ onAdd, disabled }: Props) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    const message = await onAdd(value)
    setError(message)
    if (!message) setValue('')
    setBusy(false)
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex gap-2">
        <input
          id="add-site"
          aria-label="Add a website"
          aria-invalid={error ? true : undefined}
          aria-errormessage={error ? 'add-site-error' : undefined}
          placeholder="reddit.com"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          value={value}
          disabled={disabled}
          onChange={(event) => {
            setValue(event.target.value)
            if (error) setError(null)
          }}
          className="h-10 flex-1 rounded-[var(--radius)] border border-border-strong bg-surface px-3 font-mono text-sm text-fg placeholder:text-fg-muted/60 focus:border-primary focus:outline-none disabled:opacity-50"
        />
        <Button type="submit" disabled={disabled || busy || value.trim() === ''}>
          Add
        </Button>
      </div>

      {error && (
        <p id="add-site-error" role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  )
}
