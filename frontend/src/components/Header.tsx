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

  const [status, setStatus] = useState<
    'checking' | 'connected' | 'disconnected'
  >(initialStatus ?? 'checking')

  const checkHealth = useCallback(async () => {
    setStatus('checking')

    try {
      const response = await api.getHealth()
      setStatus(response.status === 'ok' ? 'connected' : 'disconnected')
    } catch {
      setStatus('disconnected')
    }
  }, [])

  useEffect(() => {
    if (initialStatus !== undefined) {
      return
    }

    let active = true

    api
      .getHealth()
      .then((response) => {
        if (active) {
          setStatus(
            response.status === 'ok'
              ? 'connected'
              : 'disconnected',
          )
        }
      })
      .catch(() => {
        if (active) {
          setStatus('disconnected')
        }
      })

    return () => {
      active = false
    }
  }, [initialStatus])

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
            {activeItem ? activeItem.label : 'Operations'}
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
          <span className="status-subtext">/health</span>

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
