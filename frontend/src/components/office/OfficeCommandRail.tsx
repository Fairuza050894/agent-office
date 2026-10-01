import type { ReactNode } from 'react'

export interface OfficeCommandRailProps {
  title: string
  projectName: string
  modeLabel?: string
  statusLabel?: string
  meta?: string
  actions?: ReactNode
}

export function OfficeCommandRail({
  title,
  projectName,
  modeLabel,
  statusLabel,
  meta,
  actions,
}: OfficeCommandRailProps) {
  return (
    <header className="office-command-rail">
      <div className="office-command-context">
        <h1 className="office-command-title">{title}</h1>
        <span className="office-command-project">{projectName}</span>
        {modeLabel && <span className="office-mode-indicator">{modeLabel}</span>}
        {statusLabel && <span className="office-command-meta">{statusLabel}</span>}
      </div>
      <div className="office-command-actions">
        {meta && <span className="office-command-meta">{meta}</span>}
        {actions}
      </div>
    </header>
  )
}
