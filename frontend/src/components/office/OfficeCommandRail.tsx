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
    <header className="office-command-rail" aria-label="Agent Office command rail">
      <div className="office-command-context">
        <span className="office-command-mark" aria-hidden="true">
          <span />
        </span>
        <div className="office-command-copy">
          <div className="office-command-heading-row">
            <h1 className="office-command-title">{title}</h1>
            {modeLabel && <span className="office-mode-indicator">{modeLabel}</span>}
          </div>
          <div className="office-command-subrow">
            <span className="office-command-project">{projectName}</span>
            {statusLabel && (
              <span className="office-command-status" role="status">
                <i aria-hidden="true" />
                <span>{statusLabel}</span>
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="office-command-actions">
        {meta && <span className="office-command-meta-chip">{meta}</span>}
        {actions}
      </div>
    </header>
  )
}
