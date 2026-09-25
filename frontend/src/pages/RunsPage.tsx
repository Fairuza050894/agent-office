import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type AgentRun, type Project, type Run, type RunStage, type Task } from '../api'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'
import { Link } from '../router/Link'
import { useRouter } from '../router/useRouter'

const COLUMNS = [
  'Run',
  'Project',
  'Task',
  'Stage',
  'State',
  'Active agents',
  'Executor',
  'Started',
]

function shortId(value: string): string {
  return value.slice(0, 8)
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().replace('T', ' ').replace('.000Z', 'Z')
}

function runBadgeClass(status: string): string {
  switch (status.toUpperCase()) {
    case 'RUNNING':
    case 'PLANNING':
    case 'READY':
    case 'REVIEWING':
    case 'REMEDIATING':
    case 'VERIFYING':
      return 'badge-running'
    case 'COMPLETED':
      return 'badge-success'
    case 'FAILED':
      return 'badge-failed'
    case 'CANCELLED':
      return 'badge-cancelled'
    default:
      return 'badge-neutral'
  }
}

function isActiveAgent(agent: AgentRun): boolean {
  return ['CREATED', 'STARTING', 'RUNNING', 'WAITING'].includes(agent.status)
}

export function RunsPage() {
  const { currentSearch, navigate } = useRouter()
  const requestedTaskId = new URLSearchParams(currentSearch).get('task') ?? ''

  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [stagesByRun, setStagesByRun] = useState<Record<string, RunStage[]>>({})
  const [agentsByRun, setAgentsByRun] = useState<Record<string, AgentRun[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  )
  const tasksById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  )

  const selectedTaskId = tasksById.has(requestedTaskId) ? requestedTaskId : ''
  const visibleRuns = (selectedTaskId
    ? runs.filter((run) => run.task_id === selectedTaskId)
    : runs
  ).slice().sort((left, right) => right.created_at.localeCompare(left.created_at))

  const loadRuns = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const loadedProjects = await api.listProjects()
      const taskGroups = await Promise.all(loadedProjects.map((project) => api.listTasks(project.id)))
      const loadedTasks = taskGroups.flat()
      const runGroups = await Promise.all(loadedTasks.map((task) => api.listRuns(task.id)))
      const loadedRuns = runGroups.flat()

      const operational = await Promise.all(
        loadedRuns.map(async (run) => {
          const [stages, agents] = await Promise.all([
            api.getRunStages(run.id),
            api.getRunAgents(run.id),
          ])
          return [run.id, stages, agents] as const
        }),
      )

      setProjects(loadedProjects)
      setTasks(loadedTasks)
      setRuns(loadedRuns)
      setStagesByRun(Object.fromEntries(operational.map(([id, stages]) => [id, stages])))
      setAgentsByRun(Object.fromEntries(operational.map(([id, , agents]) => [id, agents])))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runs from backend.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  const renderTableBody = () => {
    if (isLoading) {
      return (
        <tr>
          <td colSpan={COLUMNS.length} className="table-status-cell">
            <div className="status-feedback" role="status" aria-live="polite">
              <span className="status-spinner" aria-hidden="true" />
              <span>Loading run registry...</span>
            </div>
          </td>
        </tr>
      )
    }

    if (error) {
      return (
        <tr>
          <td colSpan={COLUMNS.length} className="table-status-cell">
            <div className="status-feedback" role="alert">
              <p className="status-error-text">{error}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadRuns()}>
                Retry
              </button>
            </div>
          </td>
        </tr>
      )
    }

    if (visibleRuns.length === 0) {
      return (
        <tr>
          <td colSpan={COLUMNS.length} className="table-empty-cell">
            <EmptyState
              title="No runs have been created."
              message={selectedTaskId ? 'This task has no durable Run history yet.' : 'Runs are durable execution attempts created from Tasks.'}
              detail="Create a Run from a Task, then open it to start ReferenceExecutor workflow orchestration."
            />
          </td>
        </tr>
      )
    }

    return visibleRuns.map((run) => {
      const task = tasksById.get(run.task_id)
      const project = projectsById.get(run.project_id)
      const stages = stagesByRun[run.id] ?? []
      const activeStage = stages
        .filter((stage) => ['RUNNING', 'READY', 'BLOCKED'].includes(stage.status))
        .sort((left, right) => left.order_hint - right.order_hint)[0]
      const activeAgents = (agentsByRun[run.id] ?? []).filter(isActiveAgent)

      return (
        <tr key={run.id} data-testid={`run-row-${run.id}`}>
          <td><Link href={`/runs/${run.id}`}><code className="mono-badge">{shortId(run.id)}</code></Link></td>
          <td>{project?.name ?? 'Unknown project'}</td>
          <td>{task?.title ?? shortId(run.task_id)}</td>
          <td>{activeStage?.stage_key ?? (run.status === 'CREATED' ? 'Not started' : 'Unavailable')}</td>
          <td><span className={`badge ${runBadgeClass(run.status)}`}>{run.status}</span></td>
          <td>{activeAgents.length}</td>
          <td>{run.resolved_executor_id ?? run.requested_executor_id ?? 'Unavailable'}</td>
          <td className="cell-nowrap">{formatTimestamp(run.started_at)}</td>
        </tr>
      )
    })
  }

  return (
    <div className="page-view runs-view">
      <PageHeader
        eyebrow="WORK"
        title="Runs"
        description="Canonical workflow execution state across registered projects."
      />

      <div className="registry-toolbar" aria-label="Run registry filters">
        <label htmlFor="run-task-filter" className="toolbar-label">Task</label>
        <select
          id="run-task-filter"
          className="form-input toolbar-select"
          value={selectedTaskId}
          onChange={(event) => navigate(event.target.value ? `/runs?task=${encodeURIComponent(event.target.value)}` : '/runs')}
          disabled={isLoading || tasks.length === 0}
        >
          <option value="">All tasks</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {projectsById.get(task.project_id)?.name ?? 'Unknown project'} — {task.title}
            </option>
          ))}
        </select>
        {!isLoading && !error && (
          <span className="toolbar-meta">{visibleRuns.length} run{visibleRuns.length === 1 ? '' : 's'}</span>
        )}
      </div>

      <div className="page-content">
        <TableShell
          columns={COLUMNS}
          caption="Runs registry table"
          emptyTitle="No runs have been created."
          emptyMessage="Runs are durable execution attempts created from Tasks."
          emptyDetail="Open a Run to operate and inspect ReferenceExecutor workflow state."
        >
          {renderTableBody()}
        </TableShell>
      </div>
    </div>
  )
}
