import { ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { addSite, removeSite, willFitInSyncQuota } from '@/core/blocklist'
import type { Domain } from '@/core/domain'
import { InvalidDomainError } from '@/core/domain'
import { pickTip, type Tip } from '@/core/tips'
import {
  hasFullHostAccess,
  isAllowedInIncognito,
  onHostAccessChanged,
} from '@/platform/permissions'
import type { Status } from '@/platform/storage'
import {
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

  const refresh = useCallback(() => {
    void Promise.all([getStatus(), hasFullHostAccess(), isAllowedInIncognito()]).then(
      ([next, access, incognitoAllowed]) => {
        setStatus(next)
        setHostAccess(access)
        setIncognito(incognitoAllowed)
        setLoaded(true)
      },
    )
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

  const handleAdd = useCallback(
    async (input: string): Promise<string | null> => {
      let next: Domain[]
      try {
        next = addSite(status.blocked, input)
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
        return error instanceof Error ? error.message : 'Could not save. Please try again.'
      }
      setStatus((prev) => ({ ...prev, blocked: next }))
      return null
    },
    [status.blocked, status.storeLocally],
  )

  const handleRemove = useCallback(
    (domain: Domain) => {
      const next = removeSite(status.blocked, domain)
      setStatus((prev) => ({ ...prev, blocked: next }))
      setQuotaFull(false)
      void setBlocklist(next)
    },
    [status.blocked],
  )

  // F2: turning blocking ON is immediate; turning it OFF opens the confirmation.
  const handleToggle = useCallback((next: boolean) => {
    if (next) {
      void setPaused(false)
      setStatus((prev) => ({ ...prev, paused: false }))
    } else {
      setConfirmTip(pickTip(Date.now()))
    }
  }, [])

  const confirmDisable = useCallback(() => {
    setConfirmTip(null)
    setStatus((prev) => ({ ...prev, paused: true }))
    void setPaused(true)
  }, [])

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
