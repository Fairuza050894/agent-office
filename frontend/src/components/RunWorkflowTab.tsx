import { useEffect, useMemo, useState } from 'react'
import { ApiError, api, type AgentRun, type RunStage, type WorkflowSnapshot } from '../api'
import { EmptyState } from './EmptyState'
import { TableShell } from './TableShell'

export interface RunWorkflowTabProps {
  runId: string
}

function duration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return 'Unavailable'
  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  if (Number.isNaN(start) || Number.isNaN(end)) return 'Unavailable'
  const seconds = Math.max(0, Math.round((end - start) / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export function RunWorkflowTab({ runId }: RunWorkflowTabProps) {
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot | null>(null)
  const [stages, setStages] = useState<RunStage[]>([])
  const [agents, setAgents] = useState<AgentRun[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [notFrozen, setNotFrozen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      setIsLoading(true)
      setError(null)
      setNotFrozen(false)
      try {
        const [loadedStages, loadedAgents] = await Promise.all([
          api.getRunStages(runId),
          api.getRunAgents(runId),
        ])
        let loadedSnapshot: WorkflowSnapshot | null = null
        try {
          loadedSnapshot = await api.getRunSnapshot(runId)
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            if (active) setNotFrozen(true)
          } else {
            throw err
          }
        }
        if (!active) return
        setStages(loadedStages)
        setAgents(loadedAgents)
        setSnapshot(loadedSnapshot)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Workflow state is unavailable.')
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [runId])

  const stageState = useMemo(
    () => new Map(stages.map((stage) => [stage.stage_key, stage])),
    [stages],
  )

  if (isLoading) {
    return <div className="status-feedback" role="status"><span className="status-spinner" /> Loading workflow...</div>
  }

  if (error) {
    return <div className="status-feedback" role="alert"><p className="status-error-text">{error}</p></div>
  }

  if (!snapshot) {
    return (
      <EmptyState
        title="Workflow snapshot unavailable."
        message={notFrozen ? 'This Run has not frozen a workflow snapshot yet.' : 'No workflow snapshot could be loaded.'}
        detail="Start the Run to freeze its selected workflow before execution."
      />
    )
  }

  return (
    <div className="run-tab-stack">
      <div className="run-fact-strip">
        <span><strong>Workflow</strong> {snapshot.source_workflow_key}</span>
        <span><strong>Version</strong> {snapshot.source_workflow_version}</span>
        <span><strong>Schema</strong> {snapshot.schema_version}</span>
      </div>
      <TableShell
        columns={['Stage', 'State', 'Roles', 'Executor', 'Duration', 'Reason']}
        caption="Frozen workflow runtime state"
        emptyTitle="No workflow stages."
        emptyMessage="The frozen workflow does not contain stages."
      >
        {snapshot.stages.map((definition) => {
          const runtime = stageState.get(definition.key)
          const stageAgents = agents.filter((agent) => agent.stage_key === definition.key)
          const executors = [...new Set(stageAgents.map((agent) => agent.executor_id))]
          const roles = definition.assignments.map((assignment) =>
            `${assignment.profile_key}${assignment.required ? '' : ' (optional)'}`
          )
          return (
            <tr key={definition.key}>
              <td><strong>{definition.name}</strong><div className="cell-secondary"><code>{definition.key}</code></div></td>
              <td><span className="badge badge-neutral">{runtime?.status ?? 'Unavailable'}</span></td>
              <td className="cell-wrap">{roles.join(', ') || 'Unavailable'}</td>
              <td className="cell-wrap">{executors.length ? executors.join(', ') : 'Unavailable'}</td>
              <td>{duration(runtime?.started_at ?? null, runtime?.completed_at ?? null)}</td>
              <td className="cell-wrap">
                {runtime?.reason_summary ?? runtime?.reason_code ?? (runtime?.status === 'SKIPPED' ? 'Skipped without a recorded reason.' : '—')}
              </td>
            </tr>
          )
        })}
      </TableShell>
    </div>
  )
}
