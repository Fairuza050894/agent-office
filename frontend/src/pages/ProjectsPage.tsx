import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'

export function ProjectsPage() {
  const columns = [
    'Project',
    'Repository',
    'Default branch',
    'Preferred executor',
    'Default workflow',
    'Active runs',
    'Status',
    'Action',
  ]

  return (
    <div className="page-view projects-view">
      <PageHeader
        eyebrow="WORK"
        title="Projects"
        description="Local Git repositories registered and managed by Agent Office."
        action={
          <button
            type="button"
            className="btn btn-secondary"
            disabled
            title="Project registration will be enabled in Phase 1H"
          >
            Register Project
          </button>
        }
      />

      <div className="page-content">
        <TableShell
          columns={columns}
          caption="Registered projects table"
          emptyTitle="No projects registered yet."
          emptyMessage="Register local Git repositories to coordinate autonomous tasks and workflows."
          emptyDetail="Projects will be configurable via backend API in Phase 1H."
        />
      </div>
    </div>
  )
}
