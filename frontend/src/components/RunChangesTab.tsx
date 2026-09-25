import { useEffect, useMemo, useState } from 'react'
import { api, type Run, type WorkspaceStatusResponse } from '../api'
import { EmptyState } from './EmptyState'
import { TableShell } from './TableShell'

export interface RunChangesTabProps {
  run: Run
}

function numberOrUnavailable(value: number | null): string {
  return value === null ? 'Unavailable' : String(value)
}

function pathSummary(status: WorkspaceStatusResponse): string[] {
  const summary = status.change_summary
  if (!summary) return []
  return [
    ...summary.added_paths.map((path) => `+${path}`),
    ...summary.modified_paths.map((path) => `~${path}`),
    ...summary.deleted_paths.map((path) => `-${path}`),
    ...summary.untracked_paths.map((path) => `?${path}`),
  ]
}

export function RunChangesTab({ run }: RunChangesTabProps) {
  const [statuses, setStatuses] = useState<WorkspaceStatusResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const workspaces = await api.getRunWorkspaces(run.id)
        const details = await Promise.all(workspaces.map((workspace) => api.getWorkspaceStatus(workspace.id)))
        if (!active) return
        setStatuses(details)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Workspace changes are unavailable.')
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [run.id])

  const candidate = useMemo(
    () => statuses.find((status) => status.workspace.id === run.candidate_workspace_id) ?? null,
    [run.candidate_workspace_id, statuses],
  )
  const integration = useMemo(
    () => statuses.find((status) => status.workspace.kind === 'INTEGRATION_WORKTREE') ?? null,
    [statuses],
  )

  if (isLoading) {
    return <div className="status-feedback" role="status"><span className="status-spinner" /> Loading changes...</div>
  }

  if (error) {
    return <div className="status-feedback" role="alert"><p className="status-error-text">{error}</p></div>
  }

  if (statuses.length === 0) {
    return (
      <EmptyState
        title="No Workspaces allocated."
        message="This Run has no persisted workspace state to inspect."
        detail="Writable stages allocate isolated Git worktrees when they execute."
      />
    )
  }

  return (
    <div className="run-tab-stack">
      <div className="run-fact-strip">
        <span><strong>Candidate</strong> {candidate ? `${candidate.workspace.kind} · ${candidate.workspace.status}` : 'Unavailable'}</span>
        <span><strong>Integration</strong> {integration ? integration.workspace.status : 'Not required or unavailable'}</span>
        <span><strong>Merge state</strong> Not managed automatically</span>
      </div>

      <TableShell
        columns={['Workspace', 'Kind', 'State', 'Files', 'Insertions', 'Deletions', 'Integration / block reason']}
        caption="Workspace and factual Git change state"
        emptyTitle="No Workspaces allocated."
        emptyMessage="No durable workspace records exist."
      >
        {statuses.map((status) => {
          const summary = status.change_summary
          const isCandidate = status.workspace.id === run.candidate_workspace_id
          return (
            <tr key={status.workspace.id}>
              <td>
                <code className="mono-badge">{status.workspace.id.slice(0, 8)}</code>
                {isCandidate && <div className="cell-secondary">Candidate</div>}
              </td>
              <td>{status.workspace.kind}</td>
              <td><span className="badge badge-neutral">{status.workspace.status}</span></td>
              <td>{summary ? summary.files_changed : 'Unavailable'}</td>
              <td>{summary ? numberOrUnavailable(summary.insertions) : 'Unavailable'}</td>
              <td>{summary ? numberOrUnavailable(summary.deletions) : 'Unavailable'}</td>
              <td className="cell-wrap">{status.workspace.reason_summary ?? status.workspace.reason_code ?? '—'}</td>
            </tr>
          )
        })}
      </TableShell>

      {statuses.map((status) => {
        const paths = pathSummary(status)
        if (paths.length === 0) return null
        return (
          <section key={`paths-${status.workspace.id}`} className="panel run-path-panel">
            <h3 className="run-section-title">Files · {status.workspace.id.slice(0, 8)}</h3>
            <ul className="run-path-list">
              {paths.map((path) => <li key={path}><code>{path}</code></li>)}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
