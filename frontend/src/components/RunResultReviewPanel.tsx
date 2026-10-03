import { useCallback, useEffect, useState } from 'react'

import { api, type ResultReview, type Run } from '../api'
import { Link } from '../router/Link'

export interface RunResultReviewPanelProps {
  run: Run
}

function stateLabel(state: ResultReview['state']): string {
  switch (state) {
    case 'NOT_READY':
      return 'Technical work in progress'
    case 'AWAITING_REVIEW':
      return 'Needs your review'
    case 'CHANGES_REQUESTED':
      return 'Changes requested'
    case 'APPROVED':
      return 'Approved · delivery pending'
    case 'DELIVERED':
      return 'Accepted & delivered'
  }
}

export function RunResultReviewPanel({ run }: RunResultReviewPanelProps) {
  const [review, setReview] = useState<ResultReview | null>(null)
  const [feedback, setFeedback] = useState('')
  const [note, setNote] = useState('')
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await api.getResultReview(run.id)
      setReview(result)
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Result review is unavailable.')
    }
  }, [run.id])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  const requestChanges = async () => {
    const normalized = feedback.trim()
    if (!normalized || isWorking) return

    setIsWorking(true)
    setError(null)
    try {
      const result = await api.requestResultChanges(run.id, { feedback: normalized })
      setReview(result)
      setFeedback('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Changes could not be requested.')
    } finally {
      setIsWorking(false)
    }
  }

  const approveAndDeliver = async () => {
    if (isWorking) return

    setIsWorking(true)
    setError(null)
    try {
      const result = await api.approveAndDeliverResult(run.id, {
        note: note.trim() || null,
      })
      setReview(result)
      setNote('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Result could not be delivered.')
    } finally {
      setIsWorking(false)
    }
  }

  if (!review && !error) {
    return (
      <section className="dashboard-section" aria-label="Human result review">
        <div className="status-feedback" role="status">
          <span className="status-spinner" /> Loading result decision...
        </div>
      </section>
    )
  }

  return (
    <section className="dashboard-section" aria-labelledby="result-review-heading">
      <div className="section-header">
        <div>
          <h2 id="result-review-heading" className="section-title">
            Result decision
          </h2>
          <span className="section-meta">
            Technical completion and human acceptance are separate facts.
          </span>
        </div>
        {review && <span className="badge badge-neutral">{stateLabel(review.state)}</span>}
      </div>

      <div className="section-body">
        {error && (
          <div className="status-feedback" role="alert">
            <p className="status-error-text">{error}</p>
            <button type="button" className="btn btn-secondary" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}

        {review?.state === 'NOT_READY' && (
          <p className="cell-secondary">
            No acceptance decision is available until the Run reaches technical COMPLETED state
            with a verified candidate Workspace.
          </p>
        )}

        {review?.state === 'AWAITING_REVIEW' && (
          <div className="result-decision-grid">
            <div className="result-decision-card">
              <h3>Accept this result</h3>
              <p className="cell-secondary">
                Approval records the human gate, commits the verified candidate locally, and
                creates a managed accepted branch. It never pushes or merges to main.
              </p>
              <label htmlFor="result-approval-note">Approval note (optional)</label>
              <textarea
                id="result-approval-note"
                rows={2}
                value={note}
                maxLength={1000}
                disabled={isWorking}
                onChange={(event) => setNote(event.target.value)}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={isWorking}
                onClick={() => void approveAndDeliver()}
              >
                {isWorking ? 'Delivering…' : 'Approve & deliver'}
              </button>
            </div>

            <div className="result-decision-card">
              <h3>Request changes</h3>
              <p className="cell-secondary">
                Feedback is added to the same Task and a new remediation Run is created. The
                completed Run remains immutable history.
              </p>
              <label htmlFor="result-review-feedback">What must change?</label>
              <textarea
                id="result-review-feedback"
                rows={3}
                value={feedback}
                maxLength={2000}
                disabled={isWorking}
                onChange={(event) => setFeedback(event.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isWorking || !feedback.trim()}
                onClick={() => void requestChanges()}
              >
                Request changes
              </button>
            </div>
          </div>
        )}

        {review?.state === 'CHANGES_REQUESTED' && (
          <div className="result-decision-card">
            <h3>Feedback recorded</h3>
            {review.feedback && <p>{review.feedback}</p>}
            {review.remediation_run_id && (
              <p>
                New remediation Run:{' '}
                <Link href={`/runs/${review.remediation_run_id}`}>
                  <code>{review.remediation_run_id.slice(0, 8)}</code>
                </Link>
              </p>
            )}
          </div>
        )}

        {review?.state === 'APPROVED' && (
          <div className="result-decision-card">
            <h3>Approved, delivery not yet recorded</h3>
            <p className="cell-secondary">
              Retry delivery only; the approval record is already durable and will not be
              duplicated.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isWorking}
              onClick={() => void approveAndDeliver()}
            >
              Retry managed delivery
            </button>
          </div>
        )}

        {review?.state === 'DELIVERED' && (
          <div className="result-decision-card">
            <h3>Accepted change</h3>
            <dl className="run-meta-grid">
              <div>
                <dt>Managed branch</dt>
                <dd><code>{review.delivered_branch ?? 'Unavailable'}</code></dd>
              </div>
              <div>
                <dt>Commit</dt>
                <dd><code>{review.delivered_commit?.slice(0, 12) ?? 'Unavailable'}</code></dd>
              </div>
            </dl>
            <p className="cell-secondary">
              Local delivery is complete. The user's main branch was not touched and no push or
              merge was performed.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
