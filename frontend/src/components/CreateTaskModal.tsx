import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ApiError, type CreateTaskRequest, type Project, type Task } from '../api'

export interface CreateTaskModalProps {
  isOpen: boolean
  projects: Project[]
  initialProjectId?: string | null
  onClose: () => void
  onSuccess: (task: Task) => void
  onCreate: (projectId: string, data: CreateTaskRequest) => Promise<Task>
}

export function CreateTaskModal({
  isOpen,
  projects,
  initialProjectId,
  onClose,
  onSuccess,
  onCreate,
}: CreateTaskModalProps) {
  const activeProjects = useMemo(
    () => projects.filter((project) => project.status === 'ACTIVE'),
    [projects],
  )
  const initialProjectIdValue =
    activeProjects.find((project) => project.id === initialProjectId)?.id ??
    activeProjects[0]?.id ??
    ''
  const [projectId, setProjectId] = useState(initialProjectIdValue)
  const [title, setTitle] = useState('')
  const [objective, setObjective] = useState('')
  const [constraints, setConstraints] = useState('')
  const [workflowId, setWorkflowId] = useState('')
  const [executorId, setExecutorId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    window.setTimeout(() => titleRef.current?.focus(), 0)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isSubmitting, onClose])

  if (!isOpen) {
    return null
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    const trimmedTitle = title.trim()
    const trimmedObjective = objective.trim()

    if (!projectId) {
      setError('An active project is required.')
      return
    }
    if (!trimmedTitle) {
      setError('Task title is required.')
      return
    }
    if (!trimmedObjective) {
      setError('Task objective is required.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const payload: CreateTaskRequest = {
        title: trimmedTitle,
        objective: trimmedObjective,
        constraints: constraints.trim() || null,
        requested_workflow_id: workflowId.trim() || null,
        requested_executor_id: executorId.trim() || null,
      }
      const task = await onCreate(projectId, payload)
      onSuccess(task)
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail || err.message)
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('An unexpected error occurred while creating the task.')
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
      aria-labelledby="create-task-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onClose()
        }
      }}
    >
      <div className="modal-dialog modal-dialog-wide">
        <div className="modal-header">
          <h2 id="create-task-title" className="modal-title">
            Create Task
          </h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close task creation dialog"
            disabled={isSubmitting}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error" role="alert">{error}</div>}

            <div className="form-group">
              <label htmlFor="task-project" className="form-label">
                Project <span aria-hidden="true">*</span>
              </label>
              <select
                id="task-project"
                className="form-input"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                disabled={isSubmitting || activeProjects.length === 0}
                required
              >
                {activeProjects.length === 0 && <option value="">No active projects</option>}
                {activeProjects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              <span className="form-hint">Archived projects remain readable but are not offered for new task creation.</span>
            </div>

            <div className="form-group">
              <label htmlFor="task-title" className="form-label">
                Task Title <span aria-hidden="true">*</span>
              </label>
              <input
                ref={titleRef}
                id="task-title"
                className="form-input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={isSubmitting}
                maxLength={500}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="task-objective" className="form-label">
                Objective <span aria-hidden="true">*</span>
              </label>
              <textarea
                id="task-objective"
                className="form-input form-textarea"
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="task-constraints" className="form-label">Constraints</label>
              <textarea
                id="task-constraints"
                className="form-input form-textarea"
                value={constraints}
                onChange={(event) => setConstraints(event.target.value)}
                disabled={isSubmitting}
                placeholder="Optional execution constraints or safety boundaries"
              />
            </div>

            <div className="form-grid-two">
              <div className="form-group">
                <label htmlFor="task-workflow" className="form-label">Requested Workflow ID</label>
                <input
                  id="task-workflow"
                  className="form-input"
                  value={workflowId}
                  onChange={(event) => setWorkflowId(event.target.value)}
                  disabled={isSubmitting}
                  placeholder="Optional"
                />
              </div>
              <div className="form-group">
                <label htmlFor="task-executor" className="form-label">Requested Executor ID</label>
                <input
                  id="task-executor"
                  className="form-input"
                  value={executorId}
                  onChange={(event) => setExecutorId(event.target.value)}
                  disabled={isSubmitting}
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting || activeProjects.length === 0}>
              {isSubmitting ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
