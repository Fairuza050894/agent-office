import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Project, type Run, type Task } from '../api'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'
import { useRouter } from '../router/useRouter'

const COLUMNS = [
  'Run',
  'Project',
  'Task',
  'State',
  'Requested executor',
  'Created',
]

function shortId(value: string): string {
  return value.slice(0, 8)
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().replace('T', ' ').replace('.000Z', 'Z')
}

function runBadgeClass(status: string): string {
  switch (status.toUpperCase()) {
    case 'RUNNING':
      return 'badge-running'
    case 'COMPLETED':
    case 'SUCCEEDED':
      return 'badge-success'
    case 'FAILED':
      return 'badge-failed'
    case 'CANCELLED':
      return 'badge-cancelled'
    default:
      return 'badge-neutral'
  }
}

export function RunsPage() {
  const { currentSearch, navigate } = useRouter()
  const requestedTaskId = new URLSearchParams(currentSearch).get('task') ?? ''

  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [runs, setRuns] = useState<Run[]>([])
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
      const taskGroups = await Promise.all(
        loadedProjects.map((project) => api.listTasks(project.id)),
      )
      const loadedTasks = taskGroups.flat()
      const runGroups = await Promise.all(
        loadedTasks.map((task) => api.listRuns(task.id)),
      )

      setProjects(loadedProjects)
      setTasks(loadedTasks)
      setRuns(runGroups.flat())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runs from backend.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const loadedProjects = await api.listProjects()
        const taskGroups = await Promise.all(
          loadedProjects.map((project) => api.listTasks(project.id)),
        )
        const loadedTasks = taskGroups.flat()
        const runGroups = await Promise.all(
          loadedTasks.map((task) => api.listRuns(task.id)),
        )

        if (!active) return
        setProjects(loadedProjects)
        setTasks(loadedTasks)
        setRuns(runGroups.flat())
        setIsLoading(false)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load runs from backend.')
        setIsLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

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
              <button type="button" className="btn btn-secondary btn-sm" onClick={loadRuns}>
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
              message={
                selectedTaskId
                  ? 'This task has no durable Run history yet.'
                  : 'Runs are durable execution-attempt records created from Tasks.'
              }
              detail="A Run record does not imply that an AI executor or workflow has started."
            />
          </td>
        </tr>
      )
    }

    return visibleRuns.map((run) => {
      const task = tasksById.get(run.task_id)
      const project = projectsById.get(run.project_id)

      return (
        <tr key={run.id} data-testid={`run-row-${run.id}`}>
          <td><code className="mono-badge">{shortId(run.id)}</code></td>
          <td>{project?.name ?? 'Unknown project'}</td>
          <td>{task?.title ?? shortId(run.task_id)}</td>
          <td><span className={`badge ${runBadgeClass(run.status)}`}>{run.status}</span></td>
          <td>{run.requested_executor_id ?? '—'}</td>
          <td className="cell-nowrap">{formatTimestamp(run.created_at)}</td>
        </tr>
      )
    })
  }

  return (
    <div className="page-view runs-view">
      <PageHeader
        eyebrow="WORK"
        title="Runs"
        description="Durable execution-attempt history across registered projects. Phase 2 does not dispatch real AI executors."
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
          emptyMessage="Runs are durable execution-attempt records created from Tasks."
          emptyDetail="A Run record does not imply that an AI executor or workflow has started."
        >
          {renderTableBody()}
        </TableShell>
      </div>
    </div>
  )
}
