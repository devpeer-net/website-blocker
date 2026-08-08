import { ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addSite, removeSite, willFitInSyncQuota } from '@/core/blocklist'
import { InvalidDomainError } from '@/core/domain'
import { pickTip, type Tip } from '@/core/tips'
import {
  hasFullHostAccess,
  isAllowedInIncognito,
  onHostAccessChanged,
} from '@/platform/permissions'
import type { Status } from '@/platform/storage'
import {
  getBlocklist,
  getStatus,
  moveToLocalStorage,
  onStoredStateChanged,
  setBlocklist,
  setPaused,
} from '@/platform/storage'
import { Switch } from '@/ui/switch'
import { AddSiteForm } from './components/AddSiteForm'
import { BlockList } from './components/BlockList'
import { ConfirmDisableDialog } from './components/ConfirmDisableDialog'
import { StatusBanner } from './components/StatusBanner'

const EMPTY: Status = {
  blocked: [],
  paused: false,
  storeLocally: false,
  lastSyncError: null,
  invalidEntries: [],
}

export function App() {
  const [status, setStatus] = useState<Status>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [hostAccess, setHostAccess] = useState(true)
  const [incognito, setIncognito] = useState(true)
  const [confirmTip, setConfirmTip] = useState<Tip | null>(null)
  const [quotaFull, setQuotaFull] = useState(false)

  // Refreshes race each other: they are fired by every storage and permission change,
  // and resolve at the speed of their slowest IPC call. Without this guard a slow early
  // refresh can land last and repaint stale state — including a switch that reads
  // "blocking is on" when blocking is off, which no later event would correct.
  const generation = useRef(0)

  const refresh = useCallback(() => {
    const mine = ++generation.current
    void Promise.all([getStatus(), hasFullHostAccess(), isAllowedInIncognito()])
      .then(([next, access, incognitoAllowed]) => {
        if (mine !== generation.current) return
        setStatus(next)
        setHostAccess(access)
        setIncognito(incognitoAllowed)
        setLoaded(true)
      })
      .catch((error: unknown) => {
        // Leaving `loaded` false would render a permanently empty, inert page.
        console.error('[website-blocker] could not read settings', error)
        setLoaded(true)
      })
  }, [])

  // Storage is the single source of truth, so the UI re-reads it rather than keeping its
  // own copy in sync. This is also what makes edits pushed from another device appear.
  useEffect(() => {
    refresh()
    const unsubscribeStorage = onStoredStateChanged(refresh)
    const unsubscribePermissions = onHostAccessChanged(refresh)
    return () => {
      unsubscribeStorage()
      unsubscribePermissions()
    }
  }, [refresh])

  const blocking = loaded && !status.paused

  /**
   * Mutations re-read the stored list instead of editing React state. Two options tabs,
   * or a settings push from another device, would otherwise each write a list computed
   * from their own stale snapshot and silently drop the other's entry.
   *
   * Nothing here writes optimistic state, and nothing calls refresh() on success: the
   * storage change event repaints the UI, so what is on screen is always what is actually
   * stored. Only failures refresh explicitly, because a failed write fires no event.
   */
  const handleAdd = useCallback(
    async (input: string): Promise<string | null> => {
      const current = await getBlocklist()
      let next: string[]
      try {
        next = addSite(current, input)
      } catch (error) {
        if (error instanceof InvalidDomainError)
          return `“${input.trim()}” is not a website address.`
        throw error
      }

      if (!willFitInSyncQuota(next) && !status.storeLocally) {
        setQuotaFull(true)
        return 'Your list has reached the size Chrome will sync between devices.'
      }

      try {
        await setBlocklist(next)
      } catch (error) {
        refresh()
        return error instanceof Error ? error.message : 'Could not save. Please try again.'
      }
      return null
    },
    [status.storeLocally, refresh],
  )

  const handleRemove = useCallback(
    (domain: string) => {
      setQuotaFull(false)
      void (async () => {
        try {
          await setBlocklist(removeSite(await getBlocklist(), domain))
        } catch (error) {
          console.error('[website-blocker] could not remove site', error)
          refresh()
        }
      })()
    },
    [refresh],
  )

  // F2: turning blocking ON is immediate; turning it OFF opens the confirmation.
  const handleToggle = useCallback(
    (next: boolean) => {
      if (!next) {
        setConfirmTip(pickTip(Date.now()))
        return
      }
      void setPaused(false).catch((error: unknown) => {
        console.error('[website-blocker] could not resume', error)
        refresh()
      })
    },
    [refresh],
  )

  const confirmDisable = useCallback(() => {
    setConfirmTip(null)
    void setPaused(true).catch((error: unknown) => {
      console.error('[website-blocker] could not pause', error)
      refresh()
    })
  }, [refresh])

  const subtitle = useMemo(() => {
    if (!loaded) return ' '
    if (status.paused) return 'Blocking is off — your list is saved and waiting.'
    if (status.blocked.length === 0) return 'Blocking is on. Add a site to get started.'
    const n = status.blocked.length
    return `Blocking is on. ${n} ${n === 1 ? 'site is' : 'sites are'} out of reach.`
  }, [loaded, status.paused, status.blocked.length])

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-12">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-fg">
            <ShieldCheck
              className={blocking ? 'h-5 w-5 text-accent' : 'h-5 w-5 text-fg-muted'}
              aria-hidden="true"
            />
            Website Blocker
          </h1>
          <p className="mt-1 text-sm text-fg-muted" data-testid="status-line">
            {subtitle}
          </p>
        </div>

        <Switch
          checked={blocking}
          onCheckedChange={handleToggle}
          disabled={!loaded}
          aria-label="Blocking enabled"
        />
      </header>

      {status.lastSyncError && (
        <StatusBanner>
          Chrome rejected the last update, so blocking may be out of date: {status.lastSyncError}
        </StatusBanner>
      )}

      {status.invalidEntries.length > 0 && (
        <StatusBanner>
          These saved entries could not be blocked and were skipped:{' '}
          <span className="font-mono">{status.invalidEntries.join(', ')}</span>
        </StatusBanner>
      )}

      {loaded && !hostAccess && (
        <StatusBanner>
          Site access is limited, so blocked sites show Chrome’s plain error page instead of yours.
          Set this extension to <strong>On all sites</strong> in chrome://extensions to restore it.
        </StatusBanner>
      )}

      {loaded && !incognito && (
        <StatusBanner>
          Blocking does not apply in Incognito windows. Turn on <strong>Allow in Incognito</strong>{' '}
          in chrome://extensions to close that gap.
        </StatusBanner>
      )}

      {quotaFull && !status.storeLocally && (
        <StatusBanner>
          Chrome only syncs about 8 KB of settings between devices.{' '}
          <button
            type="button"
            className="cursor-pointer font-semibold underline underline-offset-2"
            onClick={() => {
              setQuotaFull(false)
              void moveToLocalStorage()
                .catch((error: unknown) =>
                  console.error('[website-blocker] could not switch to local storage', error),
                )
                .finally(refresh)
            }}
          >
            Keep my list on this device only
          </button>{' '}
          to carry on adding sites.
        </StatusBanner>
      )}

      <div className="mt-8">
        <AddSiteForm onAdd={handleAdd} disabled={!loaded} />
      </div>

      <BlockList sites={status.blocked} onRemove={handleRemove} />

      {status.storeLocally && (
        <p className="mt-3 text-xs text-fg-muted">
          Your list is stored on this device only and will not sync to other computers.
        </p>
      )}

      {confirmTip && (
        <ConfirmDisableDialog
          open
          tip={confirmTip}
          onConfirm={confirmDisable}
          onCancel={() => setConfirmTip(null)}
        />
      )}
    </main>
  )
}
