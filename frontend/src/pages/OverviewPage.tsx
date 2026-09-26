import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  api,
  type AgentEvent,
  type AgentRun,
  type Executor,
  type Project,
  type Run,
  type RunStage,
  type Task,
} from '../api'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'
import { Link } from '../router/Link'

interface RunOps {
  stages: RunStage[]
  agents: AgentRun[]
}

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

function activeAgent(agent: AgentRun): boolean {
  return ['CREATED', 'STARTING', 'RUNNING', 'WAITING'].includes(agent.status)
}

function SummaryItem({ value, label, detail }: { value: number; label: string; detail: string }) {
  return (
    <div className="summary-item">
      <strong className="summary-value">{value}</strong>
      <div>
        <div className="summary-label">{label}</div>
        <div className="summary-detail">{detail}</div>
      </div>
    </div>
  )
}

export function OverviewPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [opsByRun, setOpsByRun] = useState<Record<string, RunOps>>({})
  const [executors, setExecutors] = useState<Executor[]>([])
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [loadedProjects, loadedExecutors] = await Promise.all([
        api.listProjects(),
        api.listExecutors(),
      ])
      const taskGroups = await Promise.all(loadedProjects.map((project) => api.listTasks(project.id)))
      const loadedTasks = taskGroups.flat()
      const runGroups = await Promise.all(loadedTasks.map((task) => api.listRuns(task.id)))
      const loadedRuns = runGroups.flat()

      const opsEntries = await Promise.all(
        loadedRuns.map(async (run) => {
          const [stages, agents] = await Promise.all([
            api.getRunStages(run.id),
            api.getRunAgents(run.id),
          ])
          return [run.id, { stages, agents }] as const
        }),
      )

      const recentRuns = loadedRuns
        .slice()
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
        .slice(0, 10)
      const eventGroups = await Promise.all(recentRuns.map((run) => api.getRunEvents(run.id)))
      const loadedEvents = eventGroups
        .flatMap((page) => page.events)
        .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
        .slice(0, 10)

      setProjects(loadedProjects)
      setExecutors(loadedExecutors)
      setTasks(loadedTasks)
      setRuns(loadedRuns)
      setOpsByRun(Object.fromEntries(opsEntries))
      setEvents(loadedEvents)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operational overview is unavailable.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const activeRuns = runs.filter((run) => !TERMINAL.has(run.status))
  const attentionRuns = runs.filter((run) => run.status === 'BLOCKED' || run.failure_code === 'UNKNOWN_EXECUTION_STATE')
  const onlineExecutors = executors.filter((executor) => ['AVAILABLE', 'DEGRADED'].includes(executor.status))

  if (isLoading) {
    return (
      <div className="page-view overview-view">
        <PageHeader title="Overview" description="Canonical operational status." />
        <div className="status-feedback" role="status"><span className="status-spinner" /> Loading overview...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-view overview-view">
        <PageHeader title="Overview" description="Canonical operational status." />
        <div className="status-feedback" role="alert">
          <p className="status-error-text">{error}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-view overview-view">
      <PageHeader
        title="Overview"
        description="Live control-plane state derived from Projects, Runs, Executors, and normalized Events."
      />

      <div className="overview-summary" aria-label="Operational summary">
        <SummaryItem value={projects.length} label="Projects" detail="registered repositories" />
        <SummaryItem value={activeRuns.length} label="Active runs" detail="non-terminal execution" />
        <SummaryItem value={onlineExecutors.length} label="Executors online" detail="available or degraded" />
        <SummaryItem value={attentionRuns.length} label="Needs attention" detail="blocked or unknown" />
      </div>

      <div className="overview-grid">
        <section className="dashboard-section" aria-labelledby="heading-needs-attention">
          <div className="section-header">
            <h2 id="heading-needs-attention" className="section-title">Needs attention</h2>
            <span className="section-meta">{attentionRuns.length} actionable</span>
          </div>
          <div className="section-body">
            {attentionRuns.length === 0 ? (
              <EmptyState title="No items requiring attention" message="No blocked or unknown-execution Run is currently reported." />
            ) : (
              <TableShell columns={['Run', 'Project', 'State', 'Cause', 'Action']} caption="Runs requiring attention" emptyTitle="No attention items." emptyMessage="No Runs require attention.">
                {attentionRuns.map((run) => (
                  <tr key={run.id}>
                    <td><Link href={`/runs/${run.id}`}><code className="mono-badge">{run.id.slice(0, 8)}</code></Link></td>
                    <td>{projectsById.get(run.project_id)?.name ?? 'Unknown project'}</td>
                    <td><span className="badge badge-neutral">{run.status}</span></td>
                    <td className="cell-wrap">{run.failure_summary ?? run.failure_code ?? 'Cause unavailable'}</td>
                    <td><Link href={`/runs/${run.id}`}>Inspect</Link></td>
                  </tr>
                ))}
              </TableShell>
            )}
          </div>
        </section>

        <section className="dashboard-section" aria-labelledby="heading-active-runs">
          <div className="section-header">
            <h2 id="heading-active-runs" className="section-title">Active runs</h2>
            <span className="section-meta">{activeRuns.length} active</span>
          </div>
          <div className="section-body">
            {activeRuns.length === 0 ? (
              <EmptyState title="No active runs in progress" message="Create a Run from a Task and start it from Run Detail.">
                {projects.length === 0 && <Link href="/projects">Register a project</Link>}
              </EmptyState>
            ) : (
              <TableShell columns={['Run', 'Project', 'Task', 'Stage', 'Active agents', 'Executor', 'State', 'Started']} caption="Active execution Runs" emptyTitle="No active Runs." emptyMessage="No active Runs exist.">
                {activeRuns.map((run) => {
                  const ops = opsByRun[run.id] ?? { stages: [], agents: [] }
                  const stage = ops.stages
                    .filter((item) => ['RUNNING', 'READY', 'BLOCKED'].includes(item.status))
                    .sort((left, right) => left.order_hint - right.order_hint)[0]
                  return (
                    <tr key={run.id}>
                      <td><Link href={`/runs/${run.id}`}><code className="mono-badge">{run.id.slice(0, 8)}</code></Link></td>
                      <td>{projectsById.get(run.project_id)?.name ?? 'Unknown project'}</td>
                      <td>{tasksById.get(run.task_id)?.title ?? run.task_id.slice(0, 8)}</td>
                      <td>{stage?.stage_key ?? (run.status === 'CREATED' ? 'Not started' : 'Unavailable')}</td>
                      <td>{ops.agents.filter(activeAgent).length}</td>
                      <td>{run.resolved_executor_id ?? run.requested_executor_id ?? 'Unavailable'}</td>
                      <td><span className="badge badge-neutral">{run.status}</span></td>
                      <td>{run.started_at ? new Date(run.started_at).toLocaleString() : 'Unavailable'}</td>
                    </tr>
                  )
                })}
              </TableShell>
            )}
          </div>
        </section>

        <div className="overview-split">
          <section className="dashboard-section" aria-labelledby="heading-executors">
            <div className="section-header">
              <h2 id="heading-executors" className="section-title">Executors</h2>
              <Link href="/executors">Inspect registry</Link>
            </div>
            <div className="section-body">
              {executors.length === 0 ? (
                <EmptyState title="No executors registered" message="The backend has no executor adapters." />
              ) : (
                <div className="overview-resource-list">
                  {executors.map((executor) => (
                    <div key={executor.id} className="overview-resource-row">
                      <div>
                        <strong>{executor.name}</strong>
                        <div className="cell-secondary">{executor.kind} · {executor.runtime_version ?? 'runtime unavailable'}</div>
                      </div>
                      <span className={`status-inline status-${executor.status.toLowerCase()}`}>{executor.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="dashboard-section" aria-labelledby="heading-activity">
            <div className="section-header">
              <h2 id="heading-activity" className="section-title">Recent activity</h2>
              <Link href="/activity">Open activity</Link>
            </div>
            <div className="section-body">
              {events.length === 0 ? (
                <EmptyState title="No recent events recorded" message="No normalized Run event has been persisted yet." />
              ) : (
                <div className="overview-resource-list">
                  {events.map((event) => (
                    <div key={event.id} className="overview-resource-row">
                      <div>
                        <strong className="technical-label">{event.event_type}</strong>
                        <div className="cell-secondary">{event.source} · {new Date(event.occurred_at).toLocaleString()}</div>
                      </div>
                      <Link href={`/runs/${event.run_id}`}>Run</Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
