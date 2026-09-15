import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'

export function EvidencePage() {
  const columns = [
    'Evidence',
    'Kind',
    'Project',
    'Run',
    'Status',
    'Source',
    'Created',
  ]

  return (
    <div className="page-view evidence-view">
      <PageHeader
        eyebrow="OBSERVABILITY"
        title="Evidence"
        description="Source-attributed verification artifacts, test results, and review findings."
      />

      <div className="page-content">
        <TableShell
          columns={columns}
          caption="Evidence registry table"
          emptyTitle="No evidence recorded yet."
          emptyMessage="Factual test outputs, diff summaries, and security scan artifacts are preserved here."
          emptyDetail="Large outputs are stored in content-addressed artifact storage."
        />
      </div>
    </div>
  )
}
