import { useState, useEffect } from 'react'
import { api, type RunStage, type CompletionGateResponse } from '../api'

export interface RunOverviewTabProps {
  runId: string
}

export function RunOverviewTab({ runId }: RunOverviewTabProps) {
  const [stages, setStages] = useState<RunStage[]>([])
  const [gate, setGate] = useState<CompletionGateResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [loadedStages, loadedGate] = await Promise.all([
          api.getRunStages(runId),
          api.getRunCompletionGate(runId),
        ])
        if (!active) return
        setStages(loadedStages)
        setGate(loadedGate)
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
    return <div className="status-feedback"><span className="status-spinner"/> Loading overview...</div>
  }

  return (
    <div className="run-overview panel" style={{ padding: '1rem', display: 'grid', gap: '2rem' }}>

      <section>
        <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Needs attention</h3>
        {gate && gate.failures.length > 0 ? (
          <ul style={{ paddingLeft: '1.5rem', color: 'var(--danger-color)' }}>
            {gate.failures.map(f => <li key={f}>{f}</li>)}
          </ul>
        ) : (
          <div style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>No active blockers.</div>
        )}
      </section>

      <section>
        <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Workflow status</h3>
        {stages.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
            {stages.map(s => (
              <div key={s.stage_key} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{s.stage_key}</span>
                <span className="badge badge-neutral">{s.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>No workflow stages recorded.</div>
        )}
      </section>

      <section>
        <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Active agents</h3>
        <div style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Loading agents... (Phase 5 Agent detail pending)</div>
      </section>

      <section>
        <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Changes</h3>
        <div style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Unmerged</div>
      </section>

      <section>
        <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Evidence</h3>
        <div style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Loading evidence...</div>
      </section>

    </div>
  )
}
