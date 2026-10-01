import { useCallback, useEffect, useState } from 'react'

import { api } from '../api'
import { useRouter } from '../router/useRouter'
import { NAV_ITEMS } from '../types/navigation'

export interface HeaderProps {
  onToggleNav: () => void
  isNavOpen: boolean
  initialStatus?: 'checking' | 'connected' | 'disconnected'
}

export function Header({
  onToggleNav,
  isNavOpen,
  initialStatus,
}: HeaderProps) {
  const { currentPath } = useRouter()
  const activeItem = NAV_ITEMS.find((item) => item.path === currentPath)
  const contextualLabel =
    (currentPath === '/office' || currentPath.match(/^\/runs\/[^/]+\/office$/))
      ? 'Agent Office'
      : activeItem?.label ??
        (currentPath.match(/^\/runs\/[^/]+$/)
          ? 'Run detail'
          : currentPath.match(/^\/projects\/[^/]+$/)
            ? 'Project detail'
            : 'Operations')

  const [status, setStatus] = useState<
    'checking' | 'connected' | 'disconnected'
  >(initialStatus ?? 'checking')
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)
  const [clockNow, setClockNow] = useState(0)

  const checkHealth = useCallback(async () => {
    setStatus('checking')

    try {
      const response = await api.getHealth()
      setStatus(response.status === 'ok' ? 'connected' : 'disconnected')
    } catch {
      setStatus('disconnected')
    } finally {
      const checkedAt = Date.now()
      setLastCheckedAt(checkedAt)
      setClockNow(checkedAt)
    }
  }, [])

  useEffect(() => {
    if (initialStatus !== undefined) {
      return
    }

    let active = true

    const pollHealth = async (showChecking: boolean) => {
      if (showChecking && active) setStatus('checking')

      try {
        const response = await api.getHealth()
        if (active) {
          setStatus(response.status === 'ok' ? 'connected' : 'disconnected')
        }
      } catch {
        if (active) setStatus('disconnected')
      } finally {
        if (active) {
          const checkedAt = Date.now()
          setLastCheckedAt(checkedAt)
          setClockNow(checkedAt)
        }
      }
    }

    void pollHealth(true)
    const healthTimer = window.setInterval(() => {
      void pollHealth(false)
    }, 12_000)
    const ageTimer = window.setInterval(() => {
      setClockNow(Date.now())
    }, 1_000)

    return () => {
      active = false
      window.clearInterval(healthTimer)
      window.clearInterval(ageTimer)
    }
  }, [initialStatus])

  const checkedAgeSeconds =
    lastCheckedAt === null
      ? null
      : Math.max(0, Math.floor((clockNow - lastCheckedAt) / 1_000))

  const statusText =
    status === 'connected'
      ? 'Backend online'
      : status === 'checking'
        ? 'Checking backend'
        : 'Backend offline'

  return (
    <header className="app-header" role="banner">
      <div className="header-left">
        <button
          type="button"
          className="nav-toggle-btn"
          onClick={onToggleNav}
          aria-label="Toggle navigation menu"
          aria-expanded={isNavOpen}
        >
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
        </button>

        <div className="header-breadcrumb" aria-label="Current view">
          <span className="breadcrumb-current">
            {contextualLabel}
          </span>
        </div>
      </div>

      <div className="header-right">
        <div
          className={`system-pill ${status}`}
          title={
            status === 'connected'
              ? 'Agent Office backend reachable at /health'
              : status === 'checking'
                ? 'Checking backend reachability'
                : 'Backend unreachable'
          }
          role="status"
          aria-live="polite"
        >
          <span
            className={`status-dot ${status}`}
            aria-hidden="true"
          />
          <span className="status-text">{statusText}</span>
          <span className="status-subtext">
            {checkedAgeSeconds === null
              ? '/health'
              : `checked ${checkedAgeSeconds}s ago`}
          </span>

          {status === 'disconnected' && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={checkHealth}
              aria-label="Retry backend health check"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
