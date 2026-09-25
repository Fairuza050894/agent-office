import { useCallback, useEffect, useState } from 'react'
import { api, type Finding, type RunFindingsResponse } from '../api'
import { EmptyState } from './EmptyState'

export interface RunFindingsTabProps {
  runId: string
}

function isResolved(finding: Finding): boolean {
  return finding.status === 'RESOLVED' || finding.status === 'ACCEPTED_RISK'
}

export function RunFindingsTab({ runId }: RunFindingsTabProps) {
  const [response, setResponse] = useState<RunFindingsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [actingId, setActingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setResponse(await api.getRunFindings(runId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Findings are unavailable.')
    } finally {
      setIsLoading(false)
    }
  }, [runId])

  useEffect(() => {
    void load()
  }, [load])

  const acceptRisk = async (finding: Finding) => {
    const reason = (reasons[finding.id] ?? '').trim()
    if (!reason) {
      setError('Accepting risk requires a recorded reason.')
      return
    }

    setActingId(finding.id)
    setError(null)
    try {
      await api.acceptFindingRisk(finding.id, reason)
      setReasons((current) => ({ ...current, [finding.id]: '' }))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Risk acceptance failed.')
    } finally {
      setActingId(null)
    }
  }

  if (isLoading) {
    return <div className="status-feedback" role="status"><span className="status-spinner" /> Loading findings...</div>
  }

  if (error && !response) {
    return <div className="status-feedback" role="alert"><p className="status-error-text">{error}</p></div>
  }

  if (!response || response.findings.length === 0) {
    return (
      <EmptyState
        title="No findings recorded for this Run."
        message="No reviewer observation has been persisted."
        detail="Review stages create Findings when they identify durable observations."
      />
    )
  }

  return (
    <div className="run-tab-stack">
      <div className="run-fact-strip">
        <span><strong>Open blockers</strong> {response.open_blockers}</span>
      </div>

      {error && <div className="run-alert run-alert-danger" role="alert"><span>{error}</span></div>}

      <div className="run-finding-list">
        {response.findings.map((finding) => (
          <article
            key={finding.id}
            className={`panel run-finding ${finding.blocks_completion ? 'run-finding-blocker' : ''}`}
          >
            <div className="run-finding-heading">
              <div>
                <h3>{finding.title}</h3>
                <div className="cell-secondary">{finding.category} · {finding.severity}</div>
              </div>
              <span className={`badge ${isResolved(finding) ? 'badge-success' : 'badge-neutral'}`}>
                {finding.status}
              </span>
            </div>

            <p className="run-finding-description">{finding.description}</p>

            {finding.location?.repository_relative_path && (
              <p className="run-muted">
                Location: <code>{finding.location.repository_relative_path}</code>
                {finding.location.line_start ? `:${finding.location.line_start}` : ''}
              </p>
            )}

            {finding.resolution_summary && (
              <div className="run-resolution">
                <strong>Resolution</strong>
                <span>{finding.resolution_summary}</span>
              </div>
            )}

            {!isResolved(finding) && finding.blocks_completion && (
              <div className="run-risk-action">
                <label htmlFor={`risk-reason-${finding.id}`} className="form-label">
                  Accept risk reason
                </label>
                <div className="run-risk-row">
                  <input
                    id={`risk-reason-${finding.id}`}
                    className="form-input"
                    value={reasons[finding.id] ?? ''}
                    onChange={(event) => setReasons((current) => ({
                      ...current,
                      [finding.id]: event.target.value,
                    }))}
                    placeholder="Why is this blocker safe to accept?"
                    maxLength={1000}
                  />
                  <button
                    type="button"
                    className="btn btn-warning"
                    disabled={actingId === finding.id}
                    onClick={() => void acceptRisk(finding)}
                  >
                    {actingId === finding.id ? 'Accepting...' : 'Accept risk'}
                  </button>
                </div>
                <span className="form-hint">This is an attributable operator action and does not erase the original Finding text.</span>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}
