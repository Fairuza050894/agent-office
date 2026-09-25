import { useEffect, useMemo, useState } from 'react'
import { api, type Evidence, type Project, type Run, type Task } from '../api'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'
import { Link } from '../router/Link'

export function EvidencePage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [evidence, setEvidence] = useState<Evidence[]>([])
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
        const evidenceGroups = await Promise.all(loadedRuns.map((run) => api.getRunEvidence(run.id)))
        if (!active) return
        setProjects(loadedProjects)
        setTasks(loadedTasks)
        setRuns(loadedRuns)
        setEvidence(
          evidenceGroups.flat().sort((left, right) => right.created_at.localeCompare(left.created_at)),
        )
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Evidence registry is unavailable.')
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
    <div className="page-view evidence-view">
      <PageHeader
        eyebrow="OBSERVABILITY"
        title="Evidence"
        description="Persisted, source-attributed verification evidence from Run execution."
      />

      <div className="page-content">
        {isLoading ? (
          <div className="status-feedback" role="status"><span className="status-spinner" /> Loading evidence...</div>
        ) : error ? (
          <div className="status-feedback" role="alert"><p className="status-error-text">{error}</p></div>
        ) : evidence.length === 0 ? (
          <EmptyState title="No evidence recorded yet." message="No persisted verification evidence exists." detail="Declared verification checks produce Evidence when executed against a candidate Workspace." />
        ) : (
          <TableShell columns={['Evidence', 'Kind', 'Project', 'Run', 'Status', 'Source', 'Created']} caption="Evidence registry" emptyTitle="No evidence." emptyMessage="No evidence exists.">
            {evidence.map((item) => {
              const run = runsById.get(item.run_id)
              const task = run ? tasksById.get(run.task_id) : undefined
              return (
                <tr key={item.id}>
                  <td><code className="mono-badge">{item.id.slice(0, 8)}</code><div className="cell-secondary">{item.summary}</div></td>
                  <td>{item.kind}</td>
                  <td>{projectsById.get(item.project_id)?.name ?? 'Unknown project'}</td>
                  <td><Link href={`/runs/${item.run_id}`}><code>{item.run_id.slice(0, 8)}</code></Link><div className="cell-secondary">{task?.title ?? ''}</div></td>
                  <td><span className="badge badge-neutral">{item.status}</span></td>
                  <td>{item.agent_run_id ? `AgentRun ${item.agent_run_id.slice(0, 8)}` : 'Control plane'}</td>
                  <td className="cell-nowrap">{new Date(item.created_at).toLocaleString()}</td>
                </tr>
              )
            })}
          </TableShell>
        )}
      </div>
    </div>
  )
}
