import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  api,
  type Project,
  type Run,
  type Task,
} from '../api'
import { CreateRunModal } from '../components/CreateRunModal'
import { CreateTaskModal } from '../components/CreateTaskModal'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'
import { useRouter } from '../router/useRouter'

const COLUMNS = [
  'Task',
  'Project',
  'Objective',
  'Created',
  'Latest Run',
  'Latest state',
  'Workflow',
  'Action',
]

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().replace('T', ' ').replace('.000Z', 'Z')
}

function shortId(value: string): string {
  return value.slice(0, 8)
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

export function TasksPage() {
  const { currentSearch, navigate } = useRouter()
  const requestedProjectId = new URLSearchParams(currentSearch).get('project') ?? ''

  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [runsByTask, setRunsByTask] = useState<Record<string, Run[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false)
  const [taskForRun, setTaskForRun] = useState<Task | null>(null)

  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  )

  const selectedProjectId = projectsById.has(requestedProjectId)
    ? requestedProjectId
    : ''

  const visibleTasks = selectedProjectId
    ? tasks.filter((task) => task.project_id === selectedProjectId)
    : tasks

  const activeProjects = projects.filter((project) => project.status === 'ACTIVE')

  const loadTasks = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const loadedProjects = await api.listProjects()
      const taskGroups = await Promise.all(
        loadedProjects.map((project) => api.listTasks(project.id)),
      )
      const loadedTasks = taskGroups.flat()
      const runGroups = await Promise.all(
        loadedTasks.map(async (task) => [task.id, await api.listRuns(task.id)] as const),
      )

      setProjects(loadedProjects)
      setTasks(loadedTasks)
      setRunsByTask(Object.fromEntries(runGroups))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks from backend.')
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
          loadedTasks.map(async (task) => [task.id, await api.listRuns(task.id)] as const),
        )

        if (!active) return
        setProjects(loadedProjects)
        setTasks(loadedTasks)
        setRunsByTask(Object.fromEntries(runGroups))
        setIsLoading(false)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load tasks from backend.')
        setIsLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  const handleTaskCreated = (task: Task) => {
    setTasks((current) => [...current, task])
    setRunsByTask((current) => ({ ...current, [task.id]: [] }))
  }

  const handleRunCreated = (run: Run) => {
    setRunsByTask((current) => ({
      ...current,
      [run.task_id]: [...(current[run.task_id] ?? []), run],
    }))
  }

  const handleProjectFilter = (projectId: string) => {
    navigate(projectId ? `/tasks?project=${encodeURIComponent(projectId)}` : '/tasks')
  }

  const renderTableBody = () => {
    if (isLoading) {
      return (
        <tr>
          <td colSpan={COLUMNS.length} className="table-status-cell">
            <div className="status-feedback" role="status" aria-live="polite">
              <span className="status-spinner" aria-hidden="true" />
              <span>Loading task registry...</span>
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
              <button type="button" className="btn btn-secondary btn-sm" onClick={loadTasks}>
                Retry
              </button>
            </div>
          </td>
        </tr>
      )
    }

    if (visibleTasks.length === 0) {
      return (
        <tr>
          <td colSpan={COLUMNS.length} className="table-empty-cell">
            <EmptyState
              title="No tasks created yet."
              message={
                selectedProjectId
                  ? 'This project has no durable engineering tasks yet.'
                  : 'Tasks define engineering objectives and constraints across registered projects.'
              }
              detail={
                activeProjects.length > 0
                  ? 'Create a task to establish durable project-scoped work before creating a Run.'
                  : 'Register an active project before creating a task.'
              }
            />
          </td>
        </tr>
      )
    }

    return visibleTasks.map((task) => {
      const project = projectsById.get(task.project_id)
      const runs = runsByTask[task.id] ?? []
      const latestRun = runs.reduce<Run | null>((latest, run) => {
        if (!latest) return run
        return run.created_at > latest.created_at ? run : latest
      }, null)
      const isArchived = project?.status === 'ARCHIVED'

      return (
        <tr key={task.id} data-testid={`task-row-${task.id}`}>
          <td>
            <strong>{task.title}</strong>
            <div className="cell-secondary"><code>{shortId(task.id)}</code></div>
          </td>
          <td>{project?.name ?? 'Unknown project'}</td>
          <td className="cell-wrap">{task.objective}</td>
          <td className="cell-nowrap">{formatTimestamp(task.created_at)}</td>
          <td>{latestRun ? <code className="mono-badge">{shortId(latestRun.id)}</code> : '—'}</td>
          <td>
            {latestRun ? (
              <span className={`badge ${runBadgeClass(latestRun.status)}`}>{latestRun.status}</span>
            ) : '—'}
          </td>
          <td>{task.requested_workflow_id ?? '—'}</td>
          <td>
            <div className="table-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(`/runs?task=${encodeURIComponent(task.id)}`)}
              >
                View runs
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setTaskForRun(task)}
                disabled={isArchived}
                title={isArchived ? 'Archived projects cannot create new Runs.' : undefined}
                aria-label={`Create run for ${task.title}`}
              >
                Create Run
              </button>
            </div>
          </td>
        </tr>
      )
    })
  }

  return (
    <div className="page-view tasks-view">
      <PageHeader
        eyebrow="WORK"
        title="Tasks"
        description="Durable engineering objectives owned by registered projects. Tasks do not execute work by themselves."
        action={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsCreateTaskOpen(true)}
            disabled={activeProjects.length === 0}
            title={activeProjects.length === 0 ? 'Register an active project first.' : undefined}
          >
            Create Task
          </button>
        }
      />

      <div className="registry-toolbar" aria-label="Task registry filters">
        <label htmlFor="task-project-filter" className="toolbar-label">Project</label>
        <select
          id="task-project-filter"
          className="form-input toolbar-select"
          value={selectedProjectId}
          onChange={(event) => handleProjectFilter(event.target.value)}
          disabled={isLoading || projects.length === 0}
        >
          <option value="">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}{project.status === 'ARCHIVED' ? ' (Archived)' : ''}
            </option>
          ))}
        </select>
        {!isLoading && !error && (
          <span className="toolbar-meta">{visibleTasks.length} task{visibleTasks.length === 1 ? '' : 's'}</span>
        )}
      </div>

      <div className="page-content">
        <TableShell
          columns={COLUMNS}
          caption="Tasks registry table"
          emptyTitle="No tasks created yet."
          emptyMessage="Tasks define engineering objectives and constraints across project runs."
        >
          {renderTableBody()}
        </TableShell>
      </div>

      {isCreateTaskOpen && (
        <CreateTaskModal
          key={`create-task-${selectedProjectId || 'all'}`}
          isOpen
          projects={projects}
          initialProjectId={selectedProjectId || null}
          onClose={() => setIsCreateTaskOpen(false)}
          onSuccess={handleTaskCreated}
          onCreate={api.createTask}
        />
      )}

      {taskForRun && (
        <CreateRunModal
          key={taskForRun.id}
          task={taskForRun}
          onClose={() => setTaskForRun(null)}
          onSuccess={handleRunCreated}
          onCreate={api.createRun}
        />
      )}
    </div>
  )
}
