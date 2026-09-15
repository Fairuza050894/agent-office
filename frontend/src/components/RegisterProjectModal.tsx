import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../api'
import type { Project, RegisterProjectRequest } from '../api'

export interface RegisterProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (project: Project) => void
  onRegister: (data: RegisterProjectRequest) => Promise<Project>
}

interface RegisterProjectDialogProps {
  onClose: () => void
  onSuccess: (project: Project) => void
  onRegister: (data: RegisterProjectRequest) => Promise<Project>
}

function RegisterProjectDialog({
  onClose,
  onSuccess,
  onRegister,
}: RegisterProjectDialogProps) {
  const [name, setName] = useState('')
  const [repositoryPath, setRepositoryPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const nameInputRef = useRef<HTMLInputElement>(null)

  // Focus the first input on mount
  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const trimmedName = name.trim()
    const trimmedPath = repositoryPath.trim()

    if (!trimmedName) {
      setError('Project name is required.')
      return
    }

    if (!trimmedPath) {
      setError('Repository path is required.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const createdProject = await onRegister({
        name: trimmedName,
        repository_path: trimmedPath,
      })
      onSuccess(createdProject)
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 400) {
          setError(
            err.detail ||
              'Invalid local Git repository. Verify the directory exists and is a valid Git repository.',
          )
        } else if (err.status === 409) {
          setError('This repository is already registered as a project.')
        } else if (err.status === 422) {
          setError(err.detail || 'Validation error: please check project name and repository path.')
        } else {
          setError(err.message)
        }
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('An unexpected error occurred during project registration.')
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
      aria-labelledby="register-project-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="modal-dialog">
        <div className="modal-header">
          <h2 id="register-project-title" className="modal-title">
            Register Project
          </h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close registration dialog"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="project-name" className="form-label">
                Project Name <span aria-hidden="true">*</span>
              </label>
              <input
                ref={nameInputRef}
                id="project-name"
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Technical Documentation Platform"
                required
                disabled={isSubmitting}
              />
              <span className="form-hint">
                Human-readable project identifier used across Agent Office.
              </span>
            </div>

            <div className="form-group">
              <label htmlFor="project-repo-path" className="form-label">
                Local Repository Path <span aria-hidden="true">*</span>
              </label>
              <input
                id="project-repo-path"
                type="text"
                className="form-input"
                value={repositoryPath}
                onChange={(e) => setRepositoryPath(e.target.value)}
                placeholder="e.g. /Users/user/Projects/my-repo"
                required
                disabled={isSubmitting}
              />
              <span className="form-hint">
                Absolute path to an existing local Git repository on this host.
              </span>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Registering...' : 'Register Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function RegisterProjectModal({
  isOpen,
  onClose,
  onSuccess,
  onRegister,
}: RegisterProjectModalProps) {
  if (!isOpen) {
    return null
  }

  return (
    <RegisterProjectDialog
      onClose={onClose}
      onSuccess={onSuccess}
      onRegister={onRegister}
    />
  )
}
