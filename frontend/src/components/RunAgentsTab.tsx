import { useEffect, useState } from 'react'
import { ApiError, api, type AgentRun, type WorkflowSnapshot } from '../api'
import { EmptyState } from './EmptyState'
import { TableShell } from './TableShell'

export interface RunAgentsTabProps {
  runId: string
}

function elapsed(agent: AgentRun): string {
  if (!agent.started_at) return 'Unavailable'
  const start = new Date(agent.started_at).getTime()
  const end = agent.completed_at ? new Date(agent.completed_at).getTime() : Date.now()
  if (Number.isNaN(start) || Number.isNaN(end)) return 'Unavailable'
  const seconds = Math.max(0, Math.round((end - start) / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export function RunAgentsTab({ runId }: RunAgentsTabProps) {
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot | null>(null)
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const agents = await api.getRunAgents(runId)
        let frozen: WorkflowSnapshot | null = null
        try {
          frozen = await api.getRunSnapshot(runId)
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 404)) throw err
        }
        if (!active) return
        setAgentRuns(agents)
        setSnapshot(frozen)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Agent state is unavailable.')
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [runId])

  if (isLoading) {
    return <div className="status-feedback" role="status"><span className="status-spinner" /> Loading agents...</div>
  }

  if (error) {
    return <div className="status-feedback" role="alert"><p className="status-error-text">{error}</p></div>
  }

  return (
    <div className="run-tab-stack">
      <section aria-labelledby="agent-profiles-heading">
        <h3 id="agent-profiles-heading" className="run-section-title">Agent Profiles</h3>
        <p className="run-section-help">Reusable responsibilities frozen into this Run. These are definitions, not executions.</p>
        {!snapshot ? (
          <EmptyState
            title="No frozen Agent Profiles yet."
            message="The Run has not frozen a workflow snapshot."
            detail="Start the Run to establish immutable profile assignments."
          />
        ) : (
          <TableShell
            columns={['Profile', 'Stage', 'Version', 'Access', 'Required']}
            caption="Frozen AgentProfile assignments"
            emptyTitle="No profile assignments."
            emptyMessage="The workflow snapshot has no profile assignments."
          >
            {snapshot.agent_assignments.map((assignment) => (
              <tr key={`${assignment.stage_key}-${assignment.profile_key}`}>
                <td><strong>{assignment.profile_name}</strong><div className="cell-secondary"><code>{assignment.profile_key}</code></div></td>
                <td>{assignment.stage_key}</td>
                <td>{assignment.profile_version}</td>
                <td>{assignment.access_mode}</td>
                <td>{assignment.required ? 'Required' : 'Optional'}</td>
              </tr>
            ))}
          </TableShell>
        )}
      </section>

      <section aria-labelledby="agent-runs-heading">
        <h3 id="agent-runs-heading" className="run-section-title">Agent Runs</h3>
        <p className="run-section-help">Concrete execution attempts instantiated from Agent Profiles.</p>
        {agentRuns.length === 0 ? (
          <EmptyState
            title="No Agent Runs instantiated."
            message="No agent execution attempt has been created for this Run."
            detail="Starting workflow orchestration creates Agent Runs when stages become eligible."
          />
        ) : (
          <TableShell
            columns={['AgentRun', 'Profile', 'Stage', 'State', 'Executor', 'Attempt', 'Duration', 'Reason']}
            caption="AgentRun execution attempts"
            emptyTitle="No Agent Runs instantiated."
            emptyMessage="No execution attempts exist."
          >
            {agentRuns.map((agent) => (
              <tr key={agent.id}>
                <td><code className="mono-badge">{agent.id.slice(0, 8)}</code></td>
                <td>{agent.agent_profile_key} v{agent.agent_profile_version}</td>
                <td>{agent.stage_key}</td>
                <td><span className="badge badge-neutral">{agent.status}</span></td>
                <td><code>{agent.executor_id}</code></td>
                <td>{agent.attempt}</td>
                <td>{elapsed(agent)}</td>
                <td className="cell-wrap">{agent.reason_summary ?? agent.reason_code ?? '—'}</td>
              </tr>
            ))}
          </TableShell>
        )}
      </section>
    </div>
  )
}
