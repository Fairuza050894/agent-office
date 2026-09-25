import { useEffect, useMemo, useState } from 'react'
import { api, type AuditRecord, type Project, type Run, type Task } from '../api'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'
import { Link } from '../router/Link'

export function AuditPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [records, setRecords] = useState<AuditRecord[]>([])
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
        const recordGroups = await Promise.all(loadedRuns.map((run) => api.getRunAudit(run.id)))
        if (!active) return
        setProjects(loadedProjects)
        setTasks(loadedTasks)
        setRuns(loadedRuns)
        setRecords(
          recordGroups.flat().sort((left, right) => right.occurred_at.localeCompare(left.occurred_at)),
        )
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Audit history is unavailable.')
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
    <div className="page-view audit-view">
      <PageHeader
        eyebrow="CONTROL"
        title="Audit"
        description="Append-only records of attributable control-plane interventions."
      />

      <div className="page-content">
        {isLoading ? (
          <div className="status-feedback" role="status"><span className="status-spinner" /> Loading audit history...</div>
        ) : error ? (
          <div className="status-feedback" role="alert"><p className="status-error-text">{error}</p></div>
        ) : records.length === 0 ? (
          <EmptyState title="No audit records logged." message="No attributable operator or control-plane intervention has been recorded." detail="Risk acceptance, reconciliation, release, and other bounded interventions appear here." />
        ) : (
          <TableShell columns={['Time', 'Actor', 'Action', 'Target', 'Project', 'Run']} caption="Audit history" emptyTitle="No audit records." emptyMessage="No audit history exists.">
            {records.map((record) => {
              const run = record.run_id ? runsById.get(record.run_id) : undefined
              const task = run ? tasksById.get(run.task_id) : undefined
              return (
                <tr key={record.id}>
                  <td className="cell-nowrap">{new Date(record.occurred_at).toLocaleString()}</td>
                  <td>{record.actor_type}{record.actor_id ? ` · ${record.actor_id}` : ''}</td>
                  <td><strong>{record.action}</strong></td>
                  <td>{record.target_type}{record.target_id ? ` · ${record.target_id.slice(0, 8)}` : ''}</td>
                  <td>{record.project_id ? projectsById.get(record.project_id)?.name ?? record.project_id.slice(0, 8) : 'Unavailable'}</td>
                  <td>{record.run_id ? <><Link href={`/runs/${record.run_id}`}><code>{record.run_id.slice(0, 8)}</code></Link><div className="cell-secondary">{task?.title ?? ''}</div></> : 'Unavailable'}</td>
                </tr>
              )
            })}
          </TableShell>
        )}
      </div>
    </div>
  )
}
