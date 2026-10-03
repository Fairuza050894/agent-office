import { useEffect, useState } from 'react'

import { api, type Project, type Run, type Task } from '../api'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { RunResultReviewPanel } from '../components/RunResultReviewPanel'
import { Link } from '../router/Link'
import {
  acceptedChangeDossierFilename,
  buildAcceptedChangeDossier,
} from '../trust/changeDossier'

export function TaskDecisionPage({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isStarting, setIsStarting] = useState(false)
  const [isExportingDossier, setIsExportingDossier] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const loadedTask = await api.getTask(taskId)
        const [loadedProject, loadedRuns] = await Promise.all([
          api.getProject(loadedTask.project_id),
          api.listRuns(loadedTask.id),
        ])
        if (!active) return
        setTask(loadedTask)
        setProject(loadedProject)
        setRuns(loadedRuns)
      } catch (reason) {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'Task could not be loaded.')
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void Promise.resolve().then(load)
    return () => {
      active = false
    }
  }, [taskId])

  const latestRun = runs.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null

  const startLatestRun = async () => {
    if (!latestRun || isStarting) return
    setIsStarting(true)
    setError(null)
    try {
      const started = await api.startRun(latestRun.id)
      setRuns((current) => current.map((run) => (run.id === started.id ? started : run)))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Execution could not be started.')
    } finally {
      setIsStarting(false)
    }
  }

  const exportAcceptedDossier = async () => {
    if (!latestRun || !task || !project || isExportingDossier) return

    setIsExportingDossier(true)
    setError(null)
    try {
      const [review, evidence, findingResponse, audit] = await Promise.all([
        api.getResultReview(latestRun.id),
        api.getRunEvidence(latestRun.id),
        api.getRunFindings(latestRun.id),
        api.getRunAudit(latestRun.id),
      ])
      const markdown = buildAcceptedChangeDossier({
        project,
        task,
        run: latestRun,
        review,
        evidence,
        findings: findingResponse.findings,
        audit,
      })
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
      const href = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = acceptedChangeDossierFilename(task, latestRun)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(href)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Accepted change dossier could not be exported.',
      )
    } finally {
      setIsExportingDossier(false)
    }
  }

  if (isLoading) {
    return (
      <div className="page-view">
        <PageHeader title="Task" description="Loading canonical Task decision context..." />
        <div className="status-feedback" role="status">
          <span className="status-spinner" /> Loading Task...
        </div>
      </div>
    )
  }

  if (error && !task) {
    return (
      <div className="page-view">
        <PageHeader title="Task unavailable" description="The Task could not be loaded." />
        <EmptyState title="Could not load Task" message={error} />
      </div>
    )
  }

  if (!task) return null

  return (
    <div className="page-view">
      <PageHeader
        title={task.title}
        description="Task-centered decision surface. Execution detail remains available through each canonical Run."
      />

      {error && (
        <div className="status-feedback" role="alert">
          <p className="status-error-text">{error}</p>
        </div>
      )}

      <section className="dashboard-section" aria-labelledby="task-objective-heading">
        <div className="section-header">
          <div>
            <span className="cell-secondary">{project?.name ?? task.project_id}</span>
            <h2 id="task-objective-heading" className="section-title">Objective</h2>
          </div>
          <code className="mono-badge">{task.id.slice(0, 8)}</code>
        </div>
        <div className="section-body">
          <p>{task.objective}</p>
          {task.constraints && (
            <>
              <h3>Constraints & human review amendments</h3>
              <pre className="log">{task.constraints}</pre>
            </>
          )}
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="task-path-heading">
        <div className="section-header">
          <h2 id="task-path-heading" className="section-title">Task path</h2>
        </div>
        <div className="section-body">
          <div className="pipe" aria-label="Task lifecycle path">
            <span>Plan</span>
            <span>Promote</span>
            <span>Implement</span>
            <span>Verify</span>
            <span>Review</span>
            <span>Your review</span>
            <span>Deliver</span>
            <span>Accepted</span>
          </div>
        </div>
      </section>

      {!latestRun ? (
        <EmptyState
          title="No execution Run yet"
          message="Planning may still be in progress. Execution is created only through explicit promotion."
        />
      ) : (
        <>
          <section className="dashboard-section" aria-labelledby="task-next-action-heading">
            <div className="section-header">
              <div>
                <h2 id="task-next-action-heading" className="section-title">Latest execution</h2>
                <span className="section-meta">
                  Run {latestRun.id.slice(0, 8)} · {latestRun.status}
                </span>
              </div>
              <Link href={`/runs/${latestRun.id}`}>Open Run detail</Link>
            </div>
            <div className="section-body">
              {(latestRun.status === 'CREATED' || latestRun.status === 'READY') && (
                <div className="result-decision-card">
                  <h3>Your decision: start execution</h3>
                  <p className="cell-secondary">
                    This is an explicit promotion gate. Agent work starts only after this action.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={isStarting}
                    onClick={() => void startLatestRun()}
                  >
                    {isStarting ? 'Starting…' : 'Start execution'}
                  </button>
                </div>
              )}
              {latestRun.status === 'BLOCKED' && (
                <div className="result-decision-card">
                  <h3>Execution needs your decision</h3>
                  <p>
                    {latestRun.failure_summary ??
                      'The Run is blocked and requires operator review.'}
                  </p>
                  <Link href={`/runs/${latestRun.id}`}>Resolve in Run detail</Link>
                </div>
              )}
              {!['CREATED', 'READY', 'BLOCKED'].includes(latestRun.status) && (
                <p className="cell-secondary">
                  Execution is {latestRun.status}. Agent Office will surface the next human gate
                  when required.
                </p>
              )}
            </div>
          </section>

          {latestRun.status === 'COMPLETED' && <RunResultReviewPanel run={latestRun} />}

          {latestRun.status === 'COMPLETED' && (
            <section className="dashboard-section" aria-labelledby="task-dossier-heading">
              <div className="section-header">
                <div>
                  <h2 id="task-dossier-heading" className="section-title">Accepted change dossier</h2>
                  <span className="section-meta">
                    Export canonical Task, Run, Evidence, Finding, acceptance, and delivery facts.
                  </span>
                </div>
              </div>
              <div className="section-body">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isExportingDossier}
                  onClick={() => void exportAcceptedDossier()}
                >
                  {isExportingDossier ? 'Preparing dossier…' : 'Export Markdown dossier'}
                </button>
                <p className="cell-secondary">
                  Export is allowed only after human acceptance and managed delivery. Technical
                  COMPLETED by itself is not treated as delivered.
                </p>
              </div>
            </section>
          )}
        </>
      )}

      <section className="dashboard-section" aria-labelledby="task-run-history-heading">
        <div className="section-header">
          <h2 id="task-run-history-heading" className="section-title">Run history</h2>
          <span className="section-meta">{runs.length} attempt(s)</span>
        </div>
        <div className="section-body">
          {runs.length === 0 ? (
            <p className="cell-secondary">No Run history.</p>
          ) : (
            <ul className="plain-list">
              {runs
                .slice()
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .map((run) => (
                  <li key={run.id}>
                    <Link href={`/runs/${run.id}`}>Run {run.id.slice(0, 8)}</Link>{' '}
                    <span className="badge badge-neutral">{run.status}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
