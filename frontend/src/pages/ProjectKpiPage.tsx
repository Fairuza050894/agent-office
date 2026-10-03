import { useCallback, useEffect, useMemo, useState } from 'react'

import { api, type Project, type Run, type Task } from '../api'
import { projectKpiSnapshot } from '../analytics/projectKpi'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'
import { Link } from '../router/Link'
import { useRouter } from '../router/useRouter'

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`
}

function formatMinutes(value: number | null): string {
  if (value === null) return '—'
  if (value < 60) return `${Math.round(value)}m`
  const hours = Math.floor(value / 60)
  const minutes = Math.round(value % 60)
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

function KpiItem({
  value,
  label,
  detail,
}: {
  value: string | number
  label: string
  detail: string
}) {
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

export function ProjectKpiPage() {
  const { currentSearch, navigate } = useRouter()
  const requestedProjectId = useMemo(
    () => new URLSearchParams(currentSearch).get('project') ?? '',
    [currentSearch],
  )
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRegistry = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const loadedProjects = await api.listProjects()
      setProjects(loadedProjects)
      const requested = loadedProjects.find(
        (project) => project.id === requestedProjectId,
      )
      const initial =
        requested ??
        loadedProjects.find((project) => project.status === 'ACTIVE') ??
        loadedProjects[0] ??
        null
      setSelectedProjectId(initial?.id ?? '')
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Project KPI registry is unavailable.',
      )
    } finally {
      setIsLoading(false)
    }
  }, [requestedProjectId])

  useEffect(() => {
    void Promise.resolve().then(loadRegistry)
  }, [loadRegistry])

  useEffect(() => {
    let active = true
    if (!selectedProjectId) {
      setTasks([])
      setRuns([])
      return () => {
        active = false
      }
    }

    setIsLoading(true)
    setError(null)
    api
      .listTasks(selectedProjectId)
      .then(async (loadedTasks) => {
        const runGroups = await Promise.all(
          loadedTasks.map((task) => api.listRuns(task.id)),
        )
        if (!active) return
        setTasks(loadedTasks)
        setRuns(runGroups.flat())
      })
      .catch((reason) => {
        if (!active) return
        setError(
          reason instanceof Error
            ? reason.message
            : 'Project KPI facts are unavailable.',
        )
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [selectedProjectId])

  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId,
  )
  const snapshot = useMemo(
    () => projectKpiSnapshot(tasks, runs),
    [runs, tasks],
  )

  const changeProject = (projectId: string) => {
    setSelectedProjectId(projectId)
    navigate(projectId ? `/kpi?project=${encodeURIComponent(projectId)}` : '/kpi')
  }

  if (isLoading && projects.length === 0) {
    return (
      <div className="page-view overview-view">
        <PageHeader
          title="Project KPI"
          description="Task and Run performance derived from canonical execution facts."
        />
        <div className="status-feedback" role="status">
          <span className="status-spinner" /> Loading KPI facts...
        </div>
      </div>
    )
  }

  if (error && projects.length === 0) {
    return (
      <div className="page-view overview-view">
        <PageHeader
          title="Project KPI"
          description="Task and Run performance derived from canonical execution facts."
        />
        <div className="status-feedback" role="alert">
          <p className="status-error-text">{error}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void loadRegistry()}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-view overview-view">
      <PageHeader
        title="Project KPI"
        description="Commercially useful delivery metrics derived only from canonical Task and Run facts—no invented productivity score."
      />

      <section className="dashboard-section" aria-labelledby="kpi-project-context">
        <div className="section-header">
          <div>
            <h2 id="kpi-project-context" className="section-title">
              Delivery context
            </h2>
            <span className="section-meta">
              {selectedProject?.repository.name ?? 'No repository selected'}
            </span>
          </div>
          <div className="table-actions">
            <select
              aria-label="KPI project"
              value={selectedProjectId}
              onChange={(event) => changeProject(event.target.value)}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            {selectedProjectId && (
              <Link href={`/office?project=${encodeURIComponent(selectedProjectId)}`}>
                Open Office
              </Link>
            )}
          </div>
        </div>
      </section>

      {projects.length === 0 ? (
        <EmptyState
          title="No project registered"
          message="Register a repository before Agent Office can derive project KPI."
        >
          <Link href="/projects">Register project</Link>
        </EmptyState>
      ) : (
        <>
          <div className="overview-summary" aria-label="Project KPI summary">
            <KpiItem
              value={snapshot.totalTasks}
              label="Tasks"
              detail={`${snapshot.unstartedTasks} not started`}
            />
            <KpiItem
              value={formatPercent(snapshot.taskDeliveryRate)}
              label="Task delivery"
              detail={`${snapshot.deliveredTasks} latest runs completed`}
            />
            <KpiItem
              value={formatPercent(snapshot.runSuccessRate)}
              label="Run success"
              detail={`${snapshot.completedRuns} completed · ${snapshot.failedRuns} failed`}
            />
            <KpiItem
              value={formatMinutes(snapshot.averageCompletedCycleMinutes)}
              label="Avg cycle"
              detail="completed runs with valid start/end"
            />
          </div>

          <div className="overview-summary" aria-label="Project execution health">
            <KpiItem
              value={snapshot.activeRuns}
              label="Active runs"
              detail="non-terminal execution"
            />
            <KpiItem
              value={snapshot.tasksWithRetries}
              label="Retried tasks"
              detail="more than one Run attempt"
            />
            <KpiItem
              value={snapshot.totalRemediationCycles}
              label="Remediation cycles"
              detail="canonical Run remediation count"
            />
            <KpiItem
              value={snapshot.cancelledRuns}
              label="Cancelled runs"
              detail={
                snapshot.latestActivityAt
                  ? `latest activity ${new Date(snapshot.latestActivityAt).toLocaleString()}`
                  : 'no recorded activity'
              }
            />
          </div>

          <section className="dashboard-section" aria-labelledby="kpi-task-report">
            <div className="section-header">
              <h2 id="kpi-task-report" className="section-title">
                Task delivery report
              </h2>
              <span className="section-meta">
                {snapshot.tasksWithRuns}/{snapshot.totalTasks} tasks have execution history
              </span>
            </div>
            <div className="section-body">
              {snapshot.taskRows.length === 0 ? (
                <EmptyState
                  title="No Tasks yet"
                  message="Use the Universal Composer or Tasks page to create canonical work."
                >
                  <Link href={`/office?project=${encodeURIComponent(selectedProjectId)}`}>
                    Open Universal Composer
                  </Link>
                </EmptyState>
              ) : (
                <TableShell
                  columns={[
                    'Task',
                    'Attempts',
                    'Latest Run',
                    'State',
                    'Cycle',
                    'Completed',
                  ]}
                  caption="Canonical task KPI report"
                  emptyTitle="No task KPI rows."
                  emptyMessage="No canonical Task exists for this Project."
                >
                  {snapshot.taskRows.map((row) => (
                    <tr key={row.taskId}>
                      <td>
                        <strong>{row.title}</strong>
                        <div className="cell-secondary">
                          {row.taskId.slice(0, 8)}
                        </div>
                      </td>
                      <td>{row.attempts}</td>
                      <td>
                        {row.latestRunId ? (
                          <Link href={`/runs/${row.latestRunId}`}>
                            <code className="mono-badge">
                              {row.latestRunId.slice(0, 8)}
                            </code>
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <span className="badge badge-neutral">
                          {row.latestStatus}
                        </span>
                      </td>
                      <td>{formatMinutes(row.cycleMinutes)}</td>
                      <td>
                        {row.completedAt
                          ? new Date(row.completedAt).toLocaleString()
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </TableShell>
              )}
            </div>
          </section>

          <p className="cell-secondary">
            KPI is descriptive, not evaluative. It does not rank agents or infer individual productivity.
          </p>
        </>
      )}
    </div>
  )
}
