import { useEffect, useState, type ReactNode } from 'react'

export interface OfficeCommandRailProps {
  title: string
  projectName: string
  modeLabel: string
  statusLabel?: string
  meta?: string
  actions?: ReactNode
}

function formatClock(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

export function OfficeCommandRail({
  title,
  projectName,
  modeLabel,
  statusLabel,
  meta,
  actions,
}: OfficeCommandRailProps) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <header className="office-command-rail">
      <div className="office-command-context">
        <h1 className="office-command-title">{title}</h1>
        <span className="office-command-project">{projectName}</span>
        <span className="office-mode-indicator">{modeLabel}</span>
        {statusLabel && <span className="office-command-meta">{statusLabel}</span>}
      </div>
      <div className="office-command-actions">
        {meta && <span className="office-command-meta">{meta}</span>}
        <time className="office-command-meta" dateTime={now.toISOString()}>
          {formatClock(now)}
        </time>
        {actions}
      </div>
    </header>
  )
}
