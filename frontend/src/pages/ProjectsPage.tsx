import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'
import { EmptyState } from '../components/EmptyState'
import { RegisterProjectModal } from '../components/RegisterProjectModal'
import { ArchiveProjectModal } from '../components/ArchiveProjectModal'
import { api, type Project } from '../api'

const COLUMNS = [
  'Project',
  'Repository',
  'Default branch',
  'Preferred executor',
  'Default workflow',
  'Active runs',
  'Status',
  'Action',
]

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [projectToArchive, setProjectToArchive] = useState<Project | null>(null)

  const loadProjects = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.listProjects()
      setProjects(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load projects from backend.'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    api.listProjects()
      .then((data) => {
        if (active) {
          setProjects(data)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (active) {
          const msg = err instanceof Error ? err.message : 'Failed to load projects from backend.'
          setError(msg)
          setIsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  const handleRegisterSuccess = (newProject: Project) => {
    setProjects((prev) => {
      const exists = prev.some((p) => p.id === newProject.id)
      if (exists) {
        return prev.map((p) => (p.id === newProject.id ? newProject : p))
      }
      return [...prev, newProject]
    })
  }

  const handleArchiveSuccess = (archivedProject: Project) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === archivedProject.id ? archivedProject : p))
    )
  }

  const renderTableBody = () => {
    if (isLoading) {
      return (
        <tr>
          <td colSpan={COLUMNS.length} className="table-status-cell">
            <div className="status-feedback loading" role="status" aria-live="polite">
              <span className="status-spinner" aria-hidden="true" />
              <span>Loading project registry...</span>
            </div>
          </td>
        </tr>
      )
    }

    if (error) {
      return (
        <tr>
          <td colSpan={COLUMNS.length} className="table-status-cell">
            <div className="status-feedback error" role="alert">
              <p className="status-error-text">{error}</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={loadProjects}
              >
                Retry
              </button>
            </div>
          </td>
        </tr>
      )
    }

    if (projects.length === 0) {
      return (
        <tr>
          <td colSpan={COLUMNS.length} className="table-empty-cell">
            <EmptyState
              title="No projects registered yet."
              message="Register local Git repositories to coordinate autonomous tasks and workflows."
              detail="Use the Register Project button to add a local Git repository."
            />
          </td>
        </tr>
      )
    }

    return projects.map((project) => {
      const isArchived = project.status === 'ARCHIVED'
      return (
        <tr key={project.id} data-testid={`project-row-${project.id}`}>
          <td className="cell-project-name">
            <strong>{project.name}</strong>
          </td>
          <td>
            <code className="mono-badge">{project.repository.name}</code>
          </td>
          <td>
            <code className="mono-badge">{project.default_branch}</code>
          </td>
          <td>{project.preferred_executor_id ?? '—'}</td>
          <td>{project.default_workflow_id ?? '—'}</td>
          <td>—</td>
          <td>
            <span
              className={`badge ${isArchived ? 'badge-archived' : 'badge-active'}`}
            >
              {isArchived ? 'Archived' : 'Active'}
            </span>
          </td>
          <td>
            {isArchived ? (
              <span className="cell-action-disabled" title="Project is archived">
                —
              </span>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setProjectToArchive(project)}
                aria-label={`Archive project ${project.name}`}
              >
                Archive
              </button>
            )}
          </td>
        </tr>
      )
    })
  }

  return (
    <div className="page-view projects-view">
      <PageHeader
        eyebrow="WORK"
        title="Projects"
        description="Local Git repositories registered and managed by Agent Office."
        action={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsRegisterOpen(true)}
          >
            Register Project
          </button>
        }
      />

      <div className="page-content">
        <TableShell
          columns={COLUMNS}
          caption="Registered projects table"
          emptyTitle="No projects registered yet."
          emptyMessage="Register local Git repositories to coordinate autonomous tasks and workflows."
        >
          {renderTableBody()}
        </TableShell>
      </div>

      <RegisterProjectModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onSuccess={handleRegisterSuccess}
        onRegister={api.registerProject}
      />

      <ArchiveProjectModal
        project={projectToArchive}
        onClose={() => setProjectToArchive(null)}
        onSuccess={handleArchiveSuccess}
        onArchive={api.archiveProject}
      />
    </div>
  )
}
