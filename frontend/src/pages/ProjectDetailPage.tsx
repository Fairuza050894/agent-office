import { useEffect, useMemo, useState } from 'react'
import { api, type Project, type Run, type Task } from '../api'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'
import { Link } from '../router/Link'

export interface ProjectDetailPageProps {
  projectId: string
}

type ProjectTab = 'overview' | 'tasks' | 'runs' | 'repository' | 'settings'

const TABS: Array<{ id: ProjectTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'runs', label: 'Runs' },
  { id: 'repository', label: 'Repository' },
  { id: 'settings', label: 'Settings' },
]

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

export function ProjectDetailPage({ projectId }: ProjectDetailPageProps) {
  const [tab, setTab] = useState<ProjectTab>('overview')
  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const loadedProject = await api.getProject(projectId)
        const loadedTasks = await api.listTasks(projectId)
        const runGroups = await Promise.all(loadedTasks.map((task) => api.listRuns(task.id)))
        if (!active) return
        setProject(loadedProject)
        setTasks(loadedTasks)
        setRuns(runGroups.flat())
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Project detail is unavailable.')
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [projectId])

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const activeRuns = runs.filter((run) => !TERMINAL.has(run.status))

  if (isLoading) {
    return <div className="status-feedback" role="status"><span className="status-spinner" /> Loading project...</div>
  }

  if (error || !project) {
    return (
      <div className="page-view">
        <PageHeader title="Project Not Found" description="The project could not be loaded." />
        <EmptyState title="Project unavailable." message={error ?? 'Project not found.'} detail="Return to Projects and select a registered repository." />
      </div>
    )
  }

  return (
    <div className="page-view project-detail-view">
      <PageHeader
        eyebrow="PROJECT"
        title={project.name}
        description={`${project.repository.name} · ${project.status}`}
      />

      <div className="run-tabs" role="tablist" aria-label="Project detail">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`run-tab-button ${tab === item.id ? 'active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="run-overview-grid">
          <section className="panel run-overview-section">
            <h2 className="run-section-title">Status</h2>
            <p>{project.status}</p>
          </section>
          <section className="panel run-overview-section">
            <h2 className="run-section-title">Tasks</h2>
            <p>{tasks.length}</p>
          </section>
          <section className="panel run-overview-section">
            <h2 className="run-section-title">Active runs</h2>
            <p>{activeRuns.length}</p>
          </section>
          <section className="panel run-overview-section">
            <h2 className="run-section-title">Default workflow</h2>
            <p>{project.default_workflow_id ?? 'Built-in default'}</p>
          </section>
        </div>
      )}

      {tab === 'tasks' && (
        tasks.length === 0 ? (
          <EmptyState title="No project tasks." message="This project has no durable engineering tasks." detail="Create a Task from the Tasks registry." />
        ) : (
          <TableShell columns={['Task', 'Objective', 'Workflow', 'Created']} caption="Project tasks" emptyTitle="No tasks." emptyMessage="No tasks exist.">
            {tasks.map((task) => (
              <tr key={task.id}>
                <td><strong>{task.title}</strong><div className="cell-secondary"><code>{task.id.slice(0, 8)}</code></div></td>
                <td className="cell-wrap">{task.objective}</td>
                <td>{task.requested_workflow_id ?? 'Default'}</td>
                <td>{new Date(task.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </TableShell>
        )
      )}

      {tab === 'runs' && (
        runs.length === 0 ? (
          <EmptyState title="No project runs." message="This project has no execution-attempt history." detail="Create a Run from a project Task." />
        ) : (
          <TableShell columns={['Run', 'Task', 'State', 'Executor', 'Started']} caption="Project runs" emptyTitle="No runs." emptyMessage="No runs exist.">
            {runs.map((run) => (
              <tr key={run.id}>
                <td><Link href={`/runs/${run.id}`}><code className="mono-badge">{run.id.slice(0, 8)}</code></Link></td>
                <td>{taskById.get(run.task_id)?.title ?? run.task_id.slice(0, 8)}</td>
                <td><span className="badge badge-neutral">{run.status}</span></td>
                <td>{run.resolved_executor_id ?? run.requested_executor_id ?? 'Unavailable'}</td>
                <td>{run.started_at ? new Date(run.started_at).toLocaleString() : 'Unavailable'}</td>
              </tr>
            ))}
          </TableShell>
        )
      )}

      {tab === 'repository' && (
        <div className="settings-card">
          <div className="setting-row"><div className="setting-info"><span className="setting-name">Repository</span><span className="setting-desc">Registered repository identity</span></div><span className="setting-value mono">{project.repository.name}</span></div>
          <div className="setting-row"><div className="setting-info"><span className="setting-name">Default branch</span><span className="setting-desc">Main working-tree branch recorded at registration</span></div><span className="setting-value mono">{project.default_branch}</span></div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="settings-card">
          <div className="setting-row"><div className="setting-info"><span className="setting-name">Preferred executor</span><span className="setting-desc">Project-level executor preference</span></div><span className="setting-value">{project.preferred_executor_id ?? 'Unavailable'}</span></div>
          <div className="setting-row"><div className="setting-info"><span className="setting-name">Default workflow</span><span className="setting-desc">Project-level workflow preference</span></div><span className="setting-value">{project.default_workflow_id ?? 'Built-in default'}</span></div>
          <div className="setting-row"><div className="setting-info"><span className="setting-name">Lifecycle</span><span className="setting-desc">Current canonical project state</span></div><span className="setting-value">{project.status}</span></div>
        </div>
      )}
    </div>
  )
}
