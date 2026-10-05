import { useEffect, useMemo, useState } from 'react'

import {
  api,
  type AgentRun,
  type Project,
  type ResultReview,
  type Run,
  type Task,
  type VerificationStatus,
  type WorkflowSnapshot,
  type WorkspaceStatusResponse,
} from '../api'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { RunActivityTab } from '../components/RunActivityTab'
import { RunChangesTab } from '../components/RunChangesTab'
import { RunEvidenceTab } from '../components/RunEvidenceTab'
import { RunFindingsTab } from '../components/RunFindingsTab'
import { RunResultReviewPanel } from '../components/RunResultReviewPanel'
import { RunTestsTab } from '../components/RunTestsTab'
import { columnForTask } from '../components/taskBoardProjection'
import { deriveFiveSteps, type FiveStep } from '../components/taskFiveSteps'
import {
  approveDisabledReason,
  requestChangesDisabledReason,
  useResultReview,
} from '../components/useResultReview'
import { Link } from '../router/Link'
import {
  acceptedChangeDossierFilename,
  buildAcceptedChangeDossier,
} from '../trust/changeDossier'

type TaskTab = 'changes' | 'findings' | 'evidence' | 'checks' | 'timeline'

const TABS: Array<{ id: TaskTab; label: string }> = [
  { id: 'changes', label: 'Changes' },
  { id: 'findings', label: 'Findings' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'checks', label: 'Checks' },
  { id: 'timeline', label: 'Timeline' },
]

function latestByUpdated(runs: Run[]): Run | null {
  if (runs.length === 0) return null
  return runs.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
}

function formatCount(value: number | null): string {
  return value === null ? '—' : String(value)
}

function stepGlyph(state: FiveStep['state']): string {
  switch (state) {
    case 'done':
      return '●'
    case 'current':
      return '◐'
    case 'blocked':
      return '■'
    case 'unavailable':
      return '?'
    default:
      return '○'
  }
}

export function TaskDecisionPage({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isStarting, setIsStarting] = useState(false)
  const [isExportingDossier, setIsExportingDossier] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TaskTab>('changes')

  const [verification, setVerification] = useState<VerificationStatus | null>(null)
  const [verificationMissing, setVerificationMissing] = useState(false)
  const [evidenceCount, setEvidenceCount] = useState<number | null>(null)
  const [findingsCount, setFindingsCount] = useState<number | null>(null)
  const [openBlockers, setOpenBlockers] = useState<number | null>(null)
  const [timelineCount, setTimelineCount] = useState<number | null>(null)
  const [filesChanged, setFilesChanged] = useState<number | null>(null)
  const [baseRevision, setBaseRevision] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot | null>(null)
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([])
  const [tabFactsMissing, setTabFactsMissing] = useState(false)

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

  const latestRun = useMemo(() => latestByUpdated(runs), [runs])
  const decision = useResultReview(latestRun?.id ?? null)
  const review: ResultReview | null = decision.review

  useEffect(() => {
    let active = true
    if (!latestRun) {
      return () => {
        active = false
      }
    }
    const runId = latestRun.id
    const load = async () => {
      const [verdict, evidence, findings, events, agents, workspaces] = await Promise.allSettled([
        api.getRunVerification(runId),
        api.getRunEvidence(runId),
        api.getRunFindings(runId),
        api.getRunEvents(runId),
        api.getRunAgents(runId),
        api.getRunWorkspaces(runId),
      ])
      if (!active) return

      if (verdict.status === 'fulfilled') {
        setVerification(verdict.value)
        setVerificationMissing(false)
      } else {
        setVerification(null)
        setVerificationMissing(true)
      }

      let missing = false
      if (evidence.status === 'fulfilled') {
        setEvidenceCount(evidence.value.length)
      } else {
        setEvidenceCount(null)
        missing = true
      }
      if (findings.status === 'fulfilled') {
        setFindingsCount(findings.value.findings.length)
        setOpenBlockers(findings.value.open_blockers)
      } else {
        setFindingsCount(null)
        setOpenBlockers(null)
        missing = true
      }
      if (events.status === 'fulfilled') {
        setTimelineCount(events.value.events.length)
      } else {
        setTimelineCount(null)
        missing = true
      }
      if (agents.status === 'fulfilled') {
        setAgentRuns(agents.value)
      } else {
        setAgentRuns([])
        missing = true
      }

      if (workspaces.status === 'fulfilled') {
        try {
          const statuses = await Promise.all(
            workspaces.value.map((workspace) => api.getWorkspaceStatus(workspace.id)),
          )
          if (!active) return
          const candidate: WorkspaceStatusResponse | null =
            statuses.find((status) => status.workspace.id === latestRun.candidate_workspace_id) ??
            null
          setFilesChanged(candidate?.change_summary?.files_changed ?? null)
          setBaseRevision(candidate?.change_summary?.base_revision ?? null)
        } catch {
          if (!active) return
          setFilesChanged(null)
          setBaseRevision(null)
          missing = true
        }
      } else {
        setFilesChanged(null)
        setBaseRevision(null)
        missing = true
      }

      try {
        const frozen = await api.getRunSnapshot(runId)
        if (!active) return
        setSnapshot(frozen)
      } catch {
        if (!active) return
        setSnapshot(null)
      }
      setTabFactsMissing(missing || verdict.status !== 'fulfilled')
    }
    void load()
    return () => {
      active = false
    }
  }, [latestRun])

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
      const [loadedReview, evidence, findingResponse, audit] = await Promise.all([
        api.getResultReview(latestRun.id),
        api.getRunEvidence(latestRun.id),
        api.getRunFindings(latestRun.id),
        api.getRunAudit(latestRun.id),
      ])
      const markdown = buildAcceptedChangeDossier({
        project,
        task,
        run: latestRun,
        review: loadedReview,
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

  const statusColumn = columnForTask({ latestRun, review })
  const steps = deriveFiveSteps({
    runCount: runs.length,
    latestRun,
    review,
    reviewUnavailable: !latestRun || (!review && !decision.isLoading && decision.error !== null),
    verification,
    verificationUnavailable: verificationMissing,
  })
  const assignedProfiles = (snapshot?.agent_assignments ?? []).map(
    (assignment) => assignment.profile_name,
  )
  const counts: Record<TaskTab, number | null> = {
    changes: filesChanged,
    findings: findingsCount,
    evidence: evidenceCount,
    checks: verification ? verification.checks.length : null,
    timeline: timelineCount,
  }

  const approveReason = approveDisabledReason(latestRun, review)
  const changesReason = requestChangesDisabledReason(latestRun, review)
  const dossierPath = `/tasks/${task.id}/dossier`

  const onTabKeyDown = (event: React.KeyboardEvent) => {
    const order: TaskTab[] = ['changes', 'findings', 'evidence', 'checks', 'timeline']
    const index = order.indexOf(activeTab)
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const next =
        event.key === 'ArrowRight'
          ? order[(index + 1) % order.length]
          : order[(index - 1 + order.length) % order.length]
      setActiveTab(next)
      document.getElementById(`task-tab-${next}`)?.focus()
    }
  }

  return (
    <div className="page-view task-detail-view">
      <PageHeader
        title={task.title}
        description="Task-centered decision surface. Execution detail remains available through each canonical Run."
        action={
          latestRun ? (
            <div className="task-header-decisions" role="group" aria-label="Result decision">
              <div className="task-header-decision">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={
                    changesReason !== null || decision.isWorking || !decision.feedback.trim()
                  }
                  title={changesReason ?? 'Request changes with feedback below'}
                  onClick={() => void decision.requestChanges()}
                >
                  {decision.isWorking ? 'Working…' : 'Request changes'}
                </button>
                {changesReason && (
                  <span className="task-header-reason" role="note">
                    {changesReason}
                  </span>
                )}
              </div>
              <div className="task-header-decision">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={approveReason !== null || decision.isWorking}
                  title={approveReason ?? 'Approve and deliver to managed branch'}
                  onClick={() => void decision.approveAndDeliver()}
                >
                  {decision.isWorking ? 'Delivering…' : 'Approve result'}
                </button>
                {approveReason && (
                  <span className="task-header-reason" role="note">
                    {approveReason}
                  </span>
                )}
              </div>
            </div>
          ) : undefined
        }
      />

      {error && (
        <div className="status-feedback" role="alert">
          <p className="status-error-text">{error}</p>
        </div>
      )}

      <section className="dashboard-section" aria-labelledby="task-summary-heading">
        <div className="section-header">
          <div>
            <span className="cell-secondary">{project?.name ?? task.project_id}</span>
            <h2 id="task-summary-heading" className="section-title">Task summary</h2>
          </div>
          <span className="badge badge-neutral">{statusColumn}</span>
        </div>
        <div className="section-body">
          <dl className="task-summary-grid">
            <div>
              <dt>Status</dt>
              <dd>
                {statusColumn}
                <span className="cell-secondary">
                  {' '}
                  · latest Run {latestRun ? `${latestRun.id.slice(0, 8)} ${latestRun.status}` : 'none'}
                </span>
              </dd>
            </div>
            <div>
              <dt>Task ID</dt>
              <dd>
                <code className="mono-badge">{task.id.slice(0, 8)}</code>
              </dd>
            </div>
            <div className="task-summary-full">
              <dt>Title</dt>
              <dd>{task.title}</dd>
            </div>
            <div className="task-summary-full">
              <dt>Objective</dt>
              <dd>{task.objective}</dd>
            </div>
            <div className="task-summary-full">
              <dt>Requirements & constraints</dt>
              <dd>{task.constraints ?? 'Unavailable — no constraints recorded'}</dd>
            </div>
            <div className="task-summary-full">
              <dt>Agents</dt>
              <dd>
                {agentRuns.length > 0
                  ? `${agentRuns.length} AgentRun(s): ${agentRuns
                      .slice(0, 6)
                      .map((agent) => agent.agent_profile_key)
                      .join(', ')}${agentRuns.length > 6 ? '…' : ''}`
                  : assignedProfiles.length > 0
                    ? `Frozen profiles: ${assignedProfiles.slice(0, 6).join(', ')}${assignedProfiles.length > 6 ? '…' : ''}`
                    : 'Unavailable — no AgentRuns or frozen assignments recorded'}
              </dd>
            </div>
            <div>
              <dt>Base revision</dt>
              <dd>
                {baseRevision ? <code className="mono-badge">{baseRevision.slice(0, 12)}</code> : 'Unavailable'}
              </dd>
            </div>
            <div>
              <dt>Review state</dt>
              <dd>{review ? review.state : 'Unavailable'}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="task-path-heading">
        <div className="section-header">
          <h2 id="task-path-heading" className="section-title">Five-step path</h2>
          <span className="section-meta">Plan · Work · Verify · Review · Deliver</span>
        </div>
        <div className="section-body">
          <ol className="task-steps" aria-label="Canonical five-step path">
            {steps.map((step) => (
              <li key={step.id} className="task-step" data-state={step.state}>
                <span className="task-step-glyph" aria-hidden="true">
                  {stepGlyph(step.state)}
                </span>
                <div>
                  <strong>{step.label}</strong>
                  <span className="task-step-state">{step.state}</span>
                  <span className="task-step-detail">{step.detail}</span>
                </div>
              </li>
            ))}
          </ol>
          <p className="cell-secondary task-steps-note">
            Derived from Run status, verification checks, and ResultReview. Mapping: docs/product/TARGET_UI_TASK_DETAIL_MAPPING.md
          </p>
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
              {latestRun.status === 'COMPLETED' && (
                <div className="task-inline-decision">
                  <label htmlFor="task-header-feedback">Change feedback</label>
                  <textarea
                    id="task-header-feedback"
                    rows={2}
                    value={decision.feedback}
                    maxLength={2000}
                    disabled={decision.isWorking}
                    placeholder="What must change before acceptance?"
                    onChange={(event) => decision.setFeedback(event.target.value)}
                  />
                  <label htmlFor="task-header-note">Approval note (optional)</label>
                  <textarea
                    id="task-header-note"
                    rows={2}
                    value={decision.note}
                    maxLength={1000}
                    disabled={decision.isWorking}
                    onChange={(event) => decision.setNote(event.target.value)}
                  />
                  {decision.error && (
                    <div className="status-feedback" role="alert">
                      <p className="status-error-text">{decision.error}</p>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => void decision.reload()}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {latestRun.status === 'COMPLETED' && (
            <RunResultReviewPanel run={latestRun} controller={decision} />
          )}

          <section className="dashboard-section" aria-labelledby="task-tabs-heading">
            <div className="section-header">
              <h2 id="task-tabs-heading" className="section-title">Run evidence</h2>
              {openBlockers !== null && openBlockers > 0 && (
                <span className="section-meta">{openBlockers} open blocker(s)</span>
              )}
            </div>
            <div
              className="run-tabs task-tabs"
              role="tablist"
              aria-label="Task detail tabs"
              onKeyDown={onTabKeyDown}
            >
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  id={`task-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`task-panel-${tab.id}`}
                  className={`run-tab-button ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label} · {formatCount(counts[tab.id])}
                </button>
              ))}
            </div>
            <div
              id={`task-panel-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`task-tab-${activeTab}`}
              className="run-tab-content"
            >
              {tabFactsMissing && (
                <p className="cell-secondary" role="note">
                  Some tab counts are unavailable because a canonical endpoint did not respond.
                  Displayed records remain factual.
                </p>
              )}
              {activeTab === 'changes' && <RunChangesTab key={latestRun.updated_at} run={latestRun} />}
              {activeTab === 'findings' && <RunFindingsTab key={latestRun.updated_at} runId={latestRun.id} />}
              {activeTab === 'evidence' && <RunEvidenceTab key={latestRun.updated_at} runId={latestRun.id} />}
              {activeTab === 'checks' && <RunTestsTab key={latestRun.updated_at} runId={latestRun.id} />}
              {activeTab === 'timeline' && <RunActivityTab key={latestRun.updated_at} runId={latestRun.id} />}
            </div>
          </section>

          <section className="dashboard-section" aria-labelledby="task-dossier-heading">
            <div className="section-header">
              <div>
                <h2 id="task-dossier-heading" className="section-title">Accepted change dossier</h2>
                <span className="section-meta">
                  Export canonical Task, Run, Evidence, Finding, acceptance, and delivery facts.
                </span>
              </div>
              <Link href={dossierPath}>Open dossier viewer</Link>
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
