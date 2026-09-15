import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'

export function ActivityPage() {
  const columns = [
    'Time',
    'Event type',
    'Project',
    'Run',
    'Agent',
    'Summary',
  ]

  return (
    <div className="page-view activity-view">
      <PageHeader
        eyebrow="OBSERVABILITY"
        title="Activity"
        description="Chronological feed of normalized lifecycle and execution events."
      />

      <div className="page-content">
        <TableShell
          columns={columns}
          caption="Activity event stream table"
          emptyTitle="No events recorded."
          emptyMessage="Normalized lifecycle events will stream here during execution."
          emptyDetail="Raw provider payloads are sanitized and normalized before control plane emission."
        />
      </div>
    </div>
  )
}
