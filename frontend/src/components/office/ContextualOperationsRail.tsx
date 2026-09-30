import { useState, type FormEvent, type ReactNode } from 'react'

export type ContextRailTab = 'discussion' | 'details' | 'files' | 'logs'

export interface ContextualOperationsRailProps {
  title: string
  eyebrow: string
  status?: string | null
  discussion: ReactNode
  details: ReactNode
  files: ReactNode
  logs: ReactNode
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

  const content: Record<ContextRailTab, ReactNode> = {
    discussion,
    details,
    files,
    logs,
  }

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
        {(Object.keys(TAB_LABELS) as ContextRailTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div
        className="office-context-body"
        role="tabpanel"
        aria-label={TAB_LABELS[activeTab]}
      >
        {content[activeTab]}
      </div>
    </aside>
  )
}

export interface TaskQuickCreatePayload {
  title: string
  objective: string
}

export function TaskQuickCreate({
  onCreate,
  busy = false,
  title = 'Create task',
  submitLabel = 'Add task',
  note,
}: {
  onCreate: (payload: TaskQuickCreatePayload) => Promise<unknown> | unknown
  busy?: boolean
  title?: string
  submitLabel?: string
  note?: string
}) {
  const [taskTitle, setTaskTitle] = useState('')
  const [objective, setObjective] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const cleanTitle = taskTitle.trim()
    const cleanObjective = objective.trim()
    if (!cleanTitle || !cleanObjective || busy) return
    await onCreate({ title: cleanTitle, objective: cleanObjective })
    setTaskTitle('')
    setObjective('')
  }

  return (
    <form className="office-context-task-create" onSubmit={(event) => void submit(event)}>
      <div>
        <strong>{title}</strong>
        {note && <span>{note}</span>}
      </div>
      <label>
        <span>Title</span>
        <input
          value={taskTitle}
          disabled={busy}
          onChange={(event) => setTaskTitle(event.target.value)}
          placeholder="Short actionable task"
        />
      </label>
      <label>
        <span>Objective</span>
        <textarea
          value={objective}
          disabled={busy}
          onChange={(event) => setObjective(event.target.value)}
          placeholder="What must be accomplished?"
          rows={3}
        />
      </label>
      <button
        type="submit"
        className="btn btn-secondary btn-sm"
        disabled={busy || !taskTitle.trim() || !objective.trim()}
      >
        {busy ? 'Creating…' : submitLabel}
      </button>
    </form>
  )
}
