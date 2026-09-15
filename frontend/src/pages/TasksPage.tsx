import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'

export function TasksPage() {
  const columns = [
    'Task',
    'Project',
    'Created',
    'Latest Run',
    'Latest state',
    'Workflow',
    'Action',
  ]

  return (
    <div className="page-view tasks-view">
      <PageHeader
        eyebrow="WORK"
        title="Tasks"
        description="Engineering objectives assigned to registered projects."
      />

      <div className="page-content">
        <TableShell
          columns={columns}
          caption="Tasks registry table"
          emptyTitle="No tasks created yet."
          emptyMessage="Tasks define engineering objectives and constraints across project runs."
        />
      </div>
    </div>
  )
}
