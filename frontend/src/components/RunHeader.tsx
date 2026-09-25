import { useState } from 'react'
import { api, type Project, type Run, type Task } from '../api'

export interface RunHeaderProps {
  run: Run
  project?: Project | null
  task?: Task | null
  onRunUpdated?: (run: Run) => void
}

function runBadgeClass(status: string): string {
  switch (status.toUpperCase()) {
    case 'RUNNING':
    case 'PLANNING':
    case 'READY':
    case 'REVIEWING':
    case 'REMEDIATING':
    case 'VERIFYING':
      return 'badge-running'
    case 'COMPLETED':
      return 'badge-success'
    case 'FAILED':
      return 'badge-failed'
    case 'CANCELLED':
      return 'badge-cancelled'
    default:
      return 'badge-neutral'
  }
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function RunHeader({ run, project, task, onRunUpdated }: RunHeaderProps) {
  const [isActing, setIsActing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const shortId = run.id.slice(0, 8)

  const mutate = async (action: () => Promise<Run>) => {
    setIsActing(true)
    setActionError(null)
    try {
      const updated = await action()
      onRunUpdated?.(updated)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The requested Run action failed.')
    } finally {
      setIsActing(false)
    }
  }

  const activeStatuses = new Set([
    'PLANNING',
    'READY',
    'RUNNING',
    'REVIEWING',
    'REMEDIATING',
    'VERIFYING',
  ])
  const executionUnknown =
    run.failure_code === 'UNKNOWN_EXECUTION_STATE' ||
    run.failure_code === 'CANCELLATION_UNKNOWN'
  const canStart = run.status === 'CREATED'
  const canResume = run.status === 'BLOCKED' && !executionUnknown
  const canReconcile = run.status === 'BLOCKED'
  const canCancel = activeStatuses.has(run.status)

  return (
    <div className="run-header panel">
      <div className="run-header-top">
        <div>
          <div className="page-eyebrow">RUN</div>
          <h1 className="run-title">Run #{shortId}</h1>
          <div className="run-task-title">{task?.title ?? 'Unknown Task'}</div>
        </div>
        <div className="run-header-actions" aria-label="Run controls">
          {canStart && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={isActing}
              onClick={() => void mutate(() => api.startRun(run.id))}
            >
              {isActing ? 'Starting...' : 'Start Run'}
            </button>
          )}
          {canResume && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={isActing}
              onClick={() => void mutate(() => api.resumeRun(run.id))}
            >
              {isActing ? 'Resuming...' : 'Resume'}
            </button>
          )}
          {canReconcile && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isActing}
              onClick={() => void mutate(() => api.reconcileRun(run.id))}
            >
              Reconcile
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              className="btn btn-warning"
              disabled={isActing}
              onClick={() => void mutate(() => api.cancelRun(run.id))}
            >
              Cancel Run
            </button>
          )}
        </div>
      </div>

      {executionUnknown && (
        <div className="run-alert run-alert-warning" role="alert">
          <strong>Execution status unknown / Workspace retained for safety.</strong>
          <span>Reconcile the Run to refresh canonical executor state before continuing.</span>
        </div>
      )}

      {run.status === 'BLOCKED' && !executionUnknown && (
        <div className="run-alert run-alert-danger" role="alert">
          <strong>{run.failure_code ?? 'Run blocked'}</strong>
          <span>{run.failure_summary ?? 'The backend has not supplied a more specific block summary.'}</span>
          <span>Use Resume only after the blocking condition is resolved.</span>
        </div>
      )}

      {actionError && (
        <div className="run-alert run-alert-danger" role="alert">
          <strong>Action failed</strong>
          <span>{actionError}</span>
        </div>
      )}

      <dl className="run-facts">
        <div>
          <dt>Project</dt>
          <dd>{project?.name ?? run.project_id}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd><span className={`badge ${runBadgeClass(run.status)}`}>{run.status}</span></dd>
        </div>
        <div>
          <dt>Workflow</dt>
          <dd>{run.workflow_snapshot_id ? <code>{run.workflow_snapshot_id.slice(0, 8)}</code> : task?.requested_workflow_id ?? 'Not frozen'}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{formatTimestamp(run.started_at)}</dd>
        </div>
        <div>
          <dt>Executor</dt>
          <dd>{run.resolved_executor_id ?? run.requested_executor_id ?? 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Candidate workspace</dt>
          <dd>{run.candidate_workspace_id ? <code>{run.candidate_workspace_id.slice(0, 8)}</code> : 'Unavailable'}</dd>
        </div>
      </dl>
    </div>
  )
}
