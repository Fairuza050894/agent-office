import { useState, useEffect } from 'react'
import { api, type RunFindingsResponse } from '../api'

export interface RunFindingsTabProps {
  runId: string
}

export function RunFindingsTab({ runId }: RunFindingsTabProps) {
  const [response, setResponse] = useState<RunFindingsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const loaded = await api.getRunFindings(runId)
        if (!active) return
        setResponse(loaded)
        setIsLoading(false)
      } catch {
        if (!active) return
        setIsLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [runId])

  if (isLoading) {
    return <div className="status-feedback"><span className="status-spinner"/> Loading findings...</div>
  }

  if (!response || response.findings.length === 0) {
    return <div style={{ color: 'var(--text-secondary)' }}>No findings recorded for this run.</div>
  }

  return (
    <div className="run-findings">
      <div style={{ marginBottom: '1rem', fontWeight: 600 }}>
        Open blockers: {response.open_blockers}
      </div>
      <div style={{ display: 'grid', gap: '1rem' }}>
        {response.findings.map(finding => (
          <div key={finding.id} className="panel" style={{ padding: '1rem', borderLeft: finding.blocks_completion ? '4px solid var(--danger-color)' : '4px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h4 style={{ margin: 0 }}>{finding.title}</h4>
              <span className={`badge ${finding.status === 'RESOLVED' ? 'badge-success' : 'badge-neutral'}`}>
                {finding.status}
              </span>
            </div>
            <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>{finding.description}</p>
            <div style={{ marginTop: '1rem', fontSize: '0.875rem', display: 'flex', gap: '1rem', color: 'var(--text-secondary)' }}>
              <span>Category: {finding.category}</span>
              <span>Severity: {finding.severity}</span>
              <span>Reviewer: {finding.reviewer_agent_run_id.slice(0, 8)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
