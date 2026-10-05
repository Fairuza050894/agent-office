import { useEffect, useState } from 'react'

import {
  api,
  type AuditRecord,
  type Evidence,
  type Finding,
  type Project,
  type ResultReview,
  type Run,
  type Task,
  type VerificationStatus,
  type WorkspaceStatusResponse,
} from '../api'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { RunActivityTab } from '../components/RunActivityTab'
import { RunChangesTab } from '../components/RunChangesTab'
import { RunEvidenceTab } from '../components/RunEvidenceTab'
import { RunFindingsTab } from '../components/RunFindingsTab'
import { RunTestsTab } from '../components/RunTestsTab'
import { Link } from '../router/Link'
import {
  acceptedChangeDossierFilename,
  buildAcceptedChangeDossier,
} from '../trust/changeDossier'

function timestamp(value: string | null | undefined): string {
  if (!value) return 'Unavailable'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

export function TaskDossierPage({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const [review, setReview] = useState<ResultReview | null>(null)
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [findings, setFindings] = useState<Finding[]>([])
  const [audit, setAudit] = useState<AuditRecord[]>([])
  const [verification, setVerification] = useState<VerificationStatus | null>(null)
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
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
        const latest =
          loadedRuns.length > 0
            ? loadedRuns
                .slice()
                .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
            : null
        if (!latest) {
          if (!active) return
          setTask(loadedTask)
          setProject(loadedProject)
          return
        }
        const [loadedReview, loadedEvidence, loadedFindings, loadedAudit, loadedVerification, loadedWorkspaces] =
          await Promise.all([
            api.getResultReview(latest.id),
            api.getRunEvidence(latest.id),
            api.getRunFindings(latest.id),
            api.getRunAudit(latest.id),
            api.getRunVerification(latest.id).catch(() => null),
            api.getRunWorkspaces(latest.id).catch(() => []),
          ])
        let status: WorkspaceStatusResponse | null = null
        if (latest.candidate_workspace_id) {
          const candidate = loadedWorkspaces.find(
            (workspace) => workspace.id === latest.candidate_workspace_id,
          )
          if (candidate) {
            status = await api.getWorkspaceStatus(candidate.id).catch(() => null)
          }
        }
        if (!active) return
        setTask(loadedTask)
        setProject(loadedProject)
        setRun(latest)
        setReview(loadedReview)
        setEvidence(loadedEvidence)
        setFindings(loadedFindings.findings)
        setAudit(loadedAudit)
        setVerification(loadedVerification)
        setWorkspaceStatus(status)
      } catch (reason) {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'Dossier could not be loaded.')
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void Promise.resolve().then(load)
    return () => {
      active = false
    }
  }, [taskId])

  if (isLoading) {
    return (
      <div className="page-view">
        <PageHeader title="Change dossier" description="Loading canonical dossier facts..." />
        <div className="status-feedback" role="status">
          <span className="status-spinner" /> Loading dossier...
        </div>
      </div>
    )
  }

  if (error || !task) {
    return (
      <div className="page-view">
        <PageHeader title="Dossier unavailable" description="The dossier could not be loaded." />
        <EmptyState title="Could not load dossier" message={error ?? 'Task not found.'} />
      </div>
    )
  }

  if (!run || !review) {
    return (
      <div className="page-view">
        <PageHeader
          title="Change dossier"
          description={`Read-only dossier for ${task.title}.`}
        />
        <EmptyState
          title="No execution Run yet"
          message="A dossier is projected only from an executed Run with human review facts."
        >
          <Link href={`/tasks/${task.id}`}>Open Task</Link>
        </EmptyState>
      </div>
    )
  }

  const decisions = audit
    .slice()
    .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at))
    .filter((record) =>
      ['RESULT_CHANGES_REQUESTED', 'RESULT_REMEDIATION_CREATED', 'RESULT_APPROVED', 'RESULT_DELIVERED'].includes(
        record.action,
      ),
    )
  const evidenceKinds = [...new Set(evidence.map((item) => item.kind))]
  const securityFindings = findings.filter(
    (finding) => finding.category.toUpperCase() === 'SECURITY',
  )
  const summary = workspaceStatus?.change_summary

  const exportMarkdown = () => {
    if (!project || review.state !== 'DELIVERED') return
    const markdown = buildAcceptedChangeDossier({
      project,
      task,
      run,
      review,
      evidence,
      findings,
      audit,
    })
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = acceptedChangeDossierFilename(task, run)
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(href)
  }

  return (
    <div className="page-view">
      <PageHeader
        title="Change dossier"
        description={`Read-only projection for ${task.title}. Same source as the Markdown export.`}
        action={
          <div className="task-header-decisions" role="group" aria-label="Dossier actions">
            <Link href={`/tasks/${task.id}`}>Open Task</Link>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={review.state !== 'DELIVERED'}
              title={
                review.state === 'DELIVERED'
                  ? 'Download the canonical Markdown dossier'
                  : 'Export is available only after human acceptance and managed delivery'
              }
              onClick={exportMarkdown}
            >
              Download Markdown
            </button>
          </div>
        }
      />

      <section className="dashboard-section" aria-labelledby="dossier-overview">
        <div className="section-header">
          <h2 id="dossier-overview" className="section-title">Overview</h2>
          <span className="badge badge-neutral">{review.state}</span>
        </div>
        <div className="section-body">
          <dl className="task-summary-grid">
            <div>
              <dt>Project</dt>
              <dd>{project?.name ?? task.project_id}</dd>
            </div>
            <div>
              <dt>Task</dt>
              <dd>{task.title}</dd>
            </div>
            <div className="task-summary-full">
              <dt>Objective</dt>
              <dd>{task.objective}</dd>
            </div>
            <div>
              <dt>Technical status</dt>
              <dd>{run.status}</dd>
            </div>
            <div>
              <dt>Human result state</dt>
              <dd>{review.state}</dd>
            </div>
            <div>
              <dt>Delivered to managed branch</dt>
              <dd>
                {review.delivered_branch ? (
                  <code className="mono-badge">{review.delivered_branch}</code>
                ) : (
                  'Unavailable'
                )}
              </dd>
            </div>
            <div>
              <dt>Managed commit</dt>
              <dd>
                {review.delivered_commit ? (
                  <code className="mono-badge">{review.delivered_commit.slice(0, 12)}</code>
                ) : (
                  'Unavailable'
                )}
              </dd>
            </div>
            <div>
              <dt>Run completed at</dt>
              <dd>{timestamp(run.completed_at)}</dd>
            </div>
            <div>
              <dt>Delivered at</dt>
              <dd>{timestamp(review.delivered_at)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="dossier-changes">
        <div className="section-header">
          <h2 id="dossier-changes" className="section-title">Changes</h2>
          {summary && <span className="section-meta">{summary.files_changed} file(s)</span>}
        </div>
        <div className="section-body">
          <RunChangesTab run={run} />
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="dossier-verification">
        <div className="section-header">
          <h2 id="dossier-verification" className="section-title">Verification</h2>
          {verification && (
            <span className="section-meta">{verification.checks.length} check(s)</span>
          )}
        </div>
        <div className="section-body">
          <RunTestsTab runId={run.id} />
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="dossier-evidence">
        <div className="section-header">
          <h2 id="dossier-evidence" className="section-title">Evidence</h2>
          <span className="section-meta">
            {evidence.length} record(s)
            {evidenceKinds.length > 0 ? ` · ${evidenceKinds.join(', ')}` : ''}
          </span>
        </div>
        <div className="section-body">
          <RunEvidenceTab runId={run.id} />
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="dossier-decisions">
        <div className="section-header">
          <h2 id="dossier-decisions" className="section-title">Human decisions</h2>
          <span className="section-meta">Local owner acts; no personal identity is recorded</span>
        </div>
        <div className="section-body">
          {decisions.length === 0 ? (
            <p className="cell-secondary">No result-decision AuditRecords were available.</p>
          ) : (
            <ul className="plain-list">
              {decisions.map((record) => (
                <li key={record.id}>
                  <code className="mono-badge">{record.action}</code>{' '}
                  <span className="cell-secondary">
                    {timestamp(record.occurred_at)} · {record.actor_type}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {review.feedback && (
            <p>
              <strong>Recorded feedback:</strong> {review.feedback}
            </p>
          )}
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="dossier-findings">
        <div className="section-header">
          <h2 id="dossier-findings" className="section-title">Security facts</h2>
          <span className="section-meta">
            {securityFindings.length} security finding(s); facts only, never certification
          </span>
        </div>
        <div className="section-body">
          {securityFindings.length === 0 ? (
            <p className="cell-secondary">
              No SECURITY-category Findings were recorded for this Run. Absence of records is
              not a claim of zero issues.
            </p>
          ) : (
            <RunFindingsTab runId={run.id} />
          )}
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="dossier-timeline">
        <div className="section-header">
          <h2 id="dossier-timeline" className="section-title">Timeline</h2>
        </div>
        <div className="section-body">
          <RunActivityTab runId={run.id} />
        </div>
      </section>
    </div>
  )
}
