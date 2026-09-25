import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, type CreateRunRequest, type Run, type Task } from '../api'

export interface CreateRunModalProps {
  task: Task | null
  onClose: () => void
  onSuccess: (run: Run) => void
  onCreate: (taskId: string, data: CreateRunRequest) => Promise<Run>
}

export function CreateRunModal({ task, onClose, onSuccess, onCreate }: CreateRunModalProps) {
  const [executorId, setExecutorId] = useState(() => task?.requested_executor_id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const executorRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!task) return
    window.setTimeout(() => executorRef.current?.focus(), 0)
  }, [task])

  useEffect(() => {
    if (!task) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSubmitting, onClose, task])

  if (!task) {
    return null
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const payload: CreateRunRequest = {
        requested_executor_id: executorId.trim() || null,
      }
      const run = await onCreate(task.id, payload)
      onSuccess(run)
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail || err.message)
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('An unexpected error occurred while creating the run.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-run-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onClose()
        }
      }}
    >
      <div className="modal-dialog">
        <div className="modal-header">
          <h2 id="create-run-title" className="modal-title">Create Run</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close run creation dialog"
            disabled={isSubmitting}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error" role="alert">{error}</div>}

            <p className="modal-description">
              Create a durable Run record for <strong>{task.title}</strong>. Creation alone does not start workflow execution.
            </p>

            <div className="modal-notice">
              <span className="notice-icon" aria-hidden="true">i</span>
              <span>Run creation records an execution attempt only. Start the Run from Run Detail when it is ready for ReferenceExecutor orchestration.</span>
            </div>

            <div className="form-group modal-field-after-notice">
              <label htmlFor="run-executor" className="form-label">Requested Executor ID</label>
              <input
                ref={executorRef}
                id="run-executor"
                className="form-input"
                value={executorId}
                onChange={(event) => setExecutorId(event.target.value)}
                disabled={isSubmitting}
                placeholder="Optional"
              />
              <span className="form-hint">Leave empty to create the Run without selecting an executor.</span>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Run'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
