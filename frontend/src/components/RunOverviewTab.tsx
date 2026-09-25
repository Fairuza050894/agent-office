import { useEffect, useMemo, useState } from 'react'
import {
  api,
  type AgentRun,
  type CompletionGateResponse,
  type Evidence,
  type Run,
  type RunStage,
  type WorkspaceStatusResponse,
} from '../api'

export interface RunOverviewTabProps {
  run: Run
}

function activeAgent(agent: AgentRun): boolean {
  return ['CREATED', 'STARTING', 'RUNNING', 'WAITING'].includes(agent.status)
}

export function RunOverviewTab({ run }: RunOverviewTabProps) {
  const [stages, setStages] = useState<RunStage[]>([])
  const [gate, setGate] = useState<CompletionGateResponse | null>(null)
  const [agents, setAgents] = useState<AgentRun[]>([])
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [workspaceStatuses, setWorkspaceStatuses] = useState<WorkspaceStatusResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [loadedStages, loadedGate, loadedAgents, loadedEvidence, workspaces] =
          await Promise.all([
            api.getRunStages(run.id),
            api.getRunCompletionGate(run.id),
            api.getRunAgents(run.id),
            api.getRunEvidence(run.id),
            api.getRunWorkspaces(run.id),
          ])
        const statuses = await Promise.all(
          workspaces.map((workspace) => api.getWorkspaceStatus(workspace.id)),
        )
        if (!active) return
        setStages(loadedStages)
        setGate(loadedGate)
        setAgents(loadedAgents)
        setEvidence(loadedEvidence)
        setWorkspaceStatuses(statuses)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Run overview state is unavailable.')
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [run.id])

  const currentStages = useMemo(
    () => stages.filter((stage) => ['RUNNING', 'READY', 'BLOCKED'].includes(stage.status)),
    [stages],
  )
  const activeAgents = useMemo(() => agents.filter(activeAgent), [agents])
  const candidate = useMemo(
    () => workspaceStatuses.find((item) => item.workspace.id === run.candidate_workspace_id) ?? null,
    [run.candidate_workspace_id, workspaceStatuses],
  )
  const integration = useMemo(
    () => workspaceStatuses.find((item) => item.workspace.kind === 'INTEGRATION_WORKTREE') ?? null,
    [workspaceStatuses],
  )

  if (isLoading) {
    return <div className="status-feedback" role="status"><span className="status-spinner" /> Loading overview...</div>
  }

  if (error) {
    return <div className="status-feedback" role="alert"><p className="status-error-text">{error}</p></div>
  }

  return (
    <div className="run-overview-grid">
      <section className="panel run-overview-section">
        <h3 className="run-section-title">What is running?</h3>
        {currentStages.length ? (
          <ul className="run-plain-list">
            {currentStages.map((stage) => (
              <li key={stage.stage_key}>
                <strong>{stage.stage_key}</strong> · {stage.status}
              </li>
            ))}
          </ul>
        ) : (
          <p className="run-muted">No active workflow stage is currently recorded.</p>
        )}
      </section>

      <section className="panel run-overview-section">
        <h3 className="run-section-title">What is blocked?</h3>
        {gate?.failures.length ? (
          <ul className="run-plain-list run-danger-list">
            {gate.failures.map((failure) => <li key={failure}>{failure}</li>)}
          </ul>
        ) : run.status === 'BLOCKED' ? (
          <p className="run-muted">{run.failure_summary ?? run.failure_code ?? 'Blocked reason unavailable.'}</p>
        ) : (
          <p className="run-muted">No active completion blocker is reported.</p>
        )}
      </section>

      <section className="panel run-overview-section">
        <h3 className="run-section-title">Who is active?</h3>
        {activeAgents.length ? (
          <ul className="run-plain-list">
            {activeAgents.map((agent) => (
              <li key={agent.id}>
                <strong>{agent.agent_profile_key}</strong> · {agent.status} · executor {agent.executor_id}
              </li>
            ))}
          </ul>
        ) : (
          <p className="run-muted">No active AgentRun is currently recorded.</p>
        )}
      </section>

      <section className="panel run-overview-section">
        <h3 className="run-section-title">Which executor?</h3>
        <p>{run.resolved_executor_id ?? run.requested_executor_id ?? 'Unavailable'}</p>
      </section>

      <section className="panel run-overview-section">
        <h3 className="run-section-title">What changed?</h3>
        {candidate?.change_summary ? (
          <p>
            {candidate.change_summary.files_changed} file(s) changed ·
            {' '}{candidate.change_summary.insertions ?? 'Unavailable'} insertions ·
            {' '}{candidate.change_summary.deletions ?? 'Unavailable'} deletions
          </p>
        ) : (
          <p className="run-muted">Change summary unavailable.</p>
        )}
        <p className="run-muted">
          Integration state: {integration ? integration.workspace.status : 'Not required or unavailable'}
        </p>
      </section>

      <section className="panel run-overview-section">
        <h3 className="run-section-title">What evidence exists?</h3>
        <p>{evidence.length} persisted evidence record{evidence.length === 1 ? '' : 's'}.</p>
        <p className="run-muted">
          Completion authority: {gate?.complete ? 'Completion gate satisfied' : 'Completion gate not satisfied'}
        </p>
      </section>

      <section className="panel run-overview-section">
        <h3 className="run-section-title">Is it merged?</h3>
        <p className="run-muted">Agent Office does not automatically merge into the main working tree.</p>
      </section>
    </div>
  )
}
