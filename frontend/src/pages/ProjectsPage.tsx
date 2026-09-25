import { useCallback, useEffect, useState } from 'react'
import { api, type Project } from '../api'
import { ArchiveProjectModal } from '../components/ArchiveProjectModal'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { RegisterProjectModal } from '../components/RegisterProjectModal'
import { TableShell } from '../components/TableShell'
import { useRouter } from '../router/useRouter'

const COLUMNS = [
  'Project',
  'Repository',
  'Default branch',
  'Preferred executor',
  'Workflow',
  'Active runs',
  'Status',
  'Action',
]

const TERMINAL_RUNS = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

export function ProjectsPage() {
  const { navigate } = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [activeRunsByProject, setActiveRunsByProject] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [projectToArchive, setProjectToArchive] = useState<Project | null>(null)

  const loadProjects = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const loadedProjects = await api.listProjects()
      const counts = await Promise.all(
        loadedProjects.map(async (project) => {
          const tasks = await api.listTasks(project.id)
          const groups = await Promise.all(tasks.map((task) => api.listRuns(task.id)))
          return [
            project.id,
            groups.flat().filter((run) => !TERMINAL_RUNS.has(run.status)).length,
          ] as const
        }),
      )
      setProjects(loadedProjects)
      setActiveRunsByProject(Object.fromEntries(counts))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects from backend.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  const handleRegisterSuccess = (newProject: Project) => {
    setProjects((current) => {
      const exists = current.some((project) => project.id === newProject.id)
      return exists
        ? current.map((project) => project.id === newProject.id ? newProject : project)
        : [...current, newProject]
    })
    setActiveRunsByProject((current) => ({ ...current, [newProject.id]: 0 }))
  }

  const handleArchiveSuccess = (archivedProject: Project) => {
    setProjects((current) =>
      current.map((project) => project.id === archivedProject.id ? archivedProject : project),
    )
  }

  const renderTableBody = () => {
    if (isLoading) {
      return (
        <tr>
          <td colSpan={COLUMNS.length} className="table-status-cell">
            <div className="status-feedback" role="status" aria-live="polite">
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
            <div className="status-feedback" role="alert">
              <p className="status-error-text">{error}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadProjects()}>
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
              detail="Use Register Project to add a repository."
            />
          </td>
        </tr>
      )
    }

    return projects.map((project) => {
      const isArchived = project.status === 'ARCHIVED'
      return (
        <tr key={project.id} data-testid={`project-row-${project.id}`}>
          <td className="cell-project-name"><strong>{project.name}</strong></td>
          <td><code className="mono-badge">{project.repository.name}</code></td>
          <td><code className="mono-badge">{project.default_branch}</code></td>
          <td>{project.preferred_executor_id ?? 'Unavailable'}</td>
          <td>{project.default_workflow_id ?? 'Built-in default'}</td>
          <td>{activeRunsByProject[project.id] ?? 0}</td>
          <td><span className={`badge ${isArchived ? 'badge-archived' : 'badge-active'}`}>{isArchived ? 'Archived' : 'Active'}</span></td>
          <td>
            <div className="table-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(`/projects/${project.id}`)} aria-label={`Open project ${project.name}`}>
                Open
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(`/tasks?project=${encodeURIComponent(project.id)}`)} aria-label={`View tasks for ${project.name}`}>
                Tasks
              </button>
              {!isArchived && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setProjectToArchive(project)} aria-label={`Archive project ${project.name}`}>
                  Archive
                </button>
              )}
            </div>
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
        description="Registered Git repositories, workflow defaults, and active Run state."
        action={<button type="button" className="btn btn-primary" onClick={() => setIsRegisterOpen(true)}>Register Project</button>}
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
