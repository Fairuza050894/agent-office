import { useState, type ReactNode } from 'react'

export type ContextRailTab = 'discussion' | 'details' | 'files' | 'logs'

export interface ContextualOperationsRailProps {
  title: string
  eyebrow: string
  status?: string | null
  discussion: ReactNode
  details?: ReactNode | null
  files?: ReactNode | null
  logs?: ReactNode | null
  collapsed: boolean
  onToggleCollapsed: () => void
}

const TAB_LABELS: Record<ContextRailTab, string> = {
  discussion: 'Discussion',
  details: 'Details',
  files: 'Files',
  logs: 'Logs',
}

export function ContextualOperationsRail({
  title,
  eyebrow,
  status,
  discussion,
  details,
  files,
  logs,
  collapsed,
  onToggleCollapsed,
}: ContextualOperationsRailProps) {
  const [activeTab, setActiveTab] = useState<ContextRailTab>('discussion')

  const content: Record<ContextRailTab, ReactNode | null | undefined> = {
    discussion,
    details,
    files,
    logs,
  }
  const availableTabs = (Object.keys(TAB_LABELS) as ContextRailTab[]).filter(
    (tab) => tab === 'discussion' || content[tab] !== null && content[tab] !== undefined,
  )
  const renderedActiveTab = availableTabs.includes(activeTab)
    ? activeTab
    : 'discussion'

  if (collapsed) {
    return (
      <aside
        className="office-context-rail is-collapsed"
        aria-label="Contextual Operations Rail"
      >
        <button
          type="button"
          className="office-context-rail-expand"
          onClick={onToggleCollapsed}
          aria-label="Open contextual operations"
          title="Open contextual operations"
        >
          <span aria-hidden="true">‹</span>
          <strong>Context</strong>
        </button>
      </aside>
    )
  }

  return (
    <aside className="office-context-rail" aria-label="Contextual Operations Rail">
      <header className="office-context-rail-header">
        <div>
          <span>{eyebrow}</span>
          <strong>{title}</strong>
          {status && <small>{status}</small>}
        </div>
        <button
          type="button"
          className="office-context-rail-collapse"
          onClick={onToggleCollapsed}
          aria-label="Collapse contextual operations"
          title="Collapse contextual operations"
        >
          ›
        </button>
      </header>

      <div
        className="office-context-tabs"
        role="tablist"
        aria-label="Contextual operations views"
      >
        {availableTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={renderedActiveTab === tab}
            className={renderedActiveTab === tab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div
        className="office-context-body"
        role="tabpanel"
        aria-label={TAB_LABELS[renderedActiveTab]}
      >
        {content[renderedActiveTab]}
      </div>
    </aside>
  )
}
