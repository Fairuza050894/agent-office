import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'

export function WorkflowsPage() {
  const columns = [
    'Workflow',
    'Version',
    'Stages',
    'Required roles',
    'Status',
    'Used by projects',
  ]

  return (
    <div className="page-view workflows-view">
      <PageHeader
        eyebrow="ENGINEERING"
        title="Workflows"
        description="Versioned engineering workflow definitions and stage graph contracts."
      />

      <div className="page-content">
        <TableShell
          columns={columns}
          caption="Workflow definitions table"
          emptyTitle="No workflow definitions loaded."
          emptyMessage="Workflows orchestrate discovery, implementation, review, and verification stages."
          emptyDetail="Workflow definitions will be synchronized from the backend."
        />
      </div>
    </div>
  )
}
