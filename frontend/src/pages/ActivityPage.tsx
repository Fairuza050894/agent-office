import { useEffect, useMemo, useState } from 'react'
import { api, type AgentEvent, type Project, type Run, type Task } from '../api'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'
import { Link } from '../router/Link'

export function ActivityPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const loadedProjects = await api.listProjects()
        const taskGroups = await Promise.all(loadedProjects.map((project) => api.listTasks(project.id)))
        const loadedTasks = taskGroups.flat()
        const runGroups = await Promise.all(loadedTasks.map((task) => api.listRuns(task.id)))
        const loadedRuns = runGroups.flat()
        const eventGroups = await Promise.all(loadedRuns.map((run) => api.getRunEvents(run.id)))
        if (!active) return
        setProjects(loadedProjects)
        setTasks(loadedTasks)
        setRuns(loadedRuns)
        setEvents(
          eventGroups
            .flatMap((page) => page.events)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at)),
        )
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Activity history is unavailable.')
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
  const runsById = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs])
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])

  return (
    <div className="page-view activity-view">
      <PageHeader
        eyebrow="OBSERVABILITY"
        title="Activity"
        description="Chronological feed of normalized durable Run events."
      />

      <div className="page-content">
        {isLoading ? (
          <div className="status-feedback" role="status"><span className="status-spinner" /> Loading activity...</div>
        ) : error ? (
          <div className="status-feedback" role="alert"><p className="status-error-text">{error}</p></div>
        ) : events.length === 0 ? (
          <EmptyState title="No events recorded." message="No normalized Run event is currently persisted." detail="Start a Run to generate durable orchestration activity." />
        ) : (
          <TableShell columns={['Time', 'Event type', 'Project', 'Run', 'Agent', 'Summary']} caption="Normalized activity events" emptyTitle="No events." emptyMessage="No activity exists.">
            {events.map((event) => {
              const run = runsById.get(event.run_id)
              const task = run ? tasksById.get(run.task_id) : undefined
              const summary = Object.entries(event.payload)
                .slice(0, 4)
                .map(([key, value]) => `${key}=${value === null ? 'Unavailable' : String(value)}`)
                .join(' · ')
              return (
                <tr key={event.id}>
                  <td className="cell-nowrap">{new Date(event.occurred_at).toLocaleString()}</td>
                  <td><strong>{event.event_type}</strong><div className="cell-secondary">{event.source}</div></td>
                  <td>{projectsById.get(event.project_id)?.name ?? 'Unknown project'}</td>
                  <td><Link href={`/runs/${event.run_id}`}><code className="mono-badge">{event.run_id.slice(0, 8)}</code></Link><div className="cell-secondary">{task?.title ?? ''}</div></td>
                  <td>{event.agent_run_id ? <code>{event.agent_run_id.slice(0, 8)}</code> : 'System'}</td>
                  <td className="cell-wrap">{summary || 'No event payload.'}</td>
                </tr>
              )
            })}
          </TableShell>
        )}
      </div>
    </div>
  )
}
