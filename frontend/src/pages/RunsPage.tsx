import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'

export function RunsPage() {
  const columns = [
    'Run',
    'Project',
    'Task',
    'Stage',
    'State',
    'Active agents',
    'Primary executor',
    'Started',
    'Action',
  ]

  return (
    <div className="page-view runs-view">
      <PageHeader
        eyebrow="WORK"
        title="Runs"
        description="Engineering workflow execution runs across all registered projects."
      />

      <div className="page-content">
        <TableShell
          columns={columns}
          caption="Runs registry table"
          emptyTitle="No runs have been created."
          emptyMessage="Workflow runs coordinate agent execution, isolated worktrees, and verification gates."
          emptyDetail="Runs can be dispatched once projects and tasks are connected."
        />
      </div>
    </div>
  )
}
