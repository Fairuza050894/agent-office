import { useEffect, useState } from 'react'
import type { Project } from '../api'
import { ApiError } from '../api'

export interface ArchiveProjectModalProps {
  project: Project | null
  onClose: () => void
  onSuccess: (archivedProject: Project) => void
  onArchive: (projectId: string) => Promise<Project>
}

interface ArchiveProjectDialogProps {
  project: Project
  onClose: () => void
  onSuccess: (archivedProject: Project) => void
  onArchive: (projectId: string) => Promise<Project>
}

function ArchiveProjectDialog({
  project,
  onClose,
  onSuccess,
  onArchive,
}: ArchiveProjectDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  const handleConfirm = async () => {
    setIsSubmitting(true)
    setError(null)

    try {
      const updated = await onArchive(project.id)
      onSuccess(updated)
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail || err.message)
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('An unexpected error occurred while archiving the project.')
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
      aria-labelledby="archive-project-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="modal-dialog">
        <div className="modal-header">
          <h2 id="archive-project-title" className="modal-title">
            Archive Project
          </h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close archive dialog"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          <p className="modal-description">
            Are you sure you want to archive <strong>{project.name}</strong>?
          </p>
          <div className="modal-notice">
            <span className="notice-icon" aria-hidden="true">
              ℹ
            </span>
            <span>
              <strong>Archiving is not deletion.</strong> All existing project runs,
              tasks, findings, and evidence are preserved. However, no new runs can
              be created for an archived project.
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
            type="button"
            className="btn btn-warning"
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Archiving...' : 'Archive Project'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ArchiveProjectModal({
  project,
  onClose,
  onSuccess,
  onArchive,
}: ArchiveProjectModalProps) {
  if (!project) {
    return null
  }

  return (
    <ArchiveProjectDialog
      key={project.id}
      project={project}
      onClose={onClose}
      onSuccess={onSuccess}
      onArchive={onArchive}
    />
  )
}
