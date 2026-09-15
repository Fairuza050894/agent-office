import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'

export function AuditPage() {
  const columns = [
    'Time',
    'Actor',
    'Action',
    'Target',
    'Project',
    'Run',
  ]

  return (
    <div className="page-view audit-view">
      <PageHeader
        eyebrow="CONTROL"
        title="Audit"
        description="Attributable record of security decisions, command approvals, and state changes."
      />

      <div className="page-content">
        <TableShell
          columns={columns}
          caption="Audit trail table"
          emptyTitle="No audit records logged."
          emptyMessage="Actions such as risk acceptance, executor switching, and command approvals are durably tracked."
        />
      </div>
    </div>
  )
}
