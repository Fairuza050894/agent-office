import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'

export function ExecutorsPage() {
  const columns = [
    'Executor',
    'Kind',
    'Status',
    'Runtime',
    'Capabilities',
    'Last checked',
    'Action',
  ]

  return (
    <div className="page-view executors-view">
      <PageHeader
        eyebrow="ENGINEERING"
        title="Executors"
        description="Execution backends and runtime adapters for agent runs."
      />

      <div className="page-content">
        <TableShell
          columns={columns}
          caption="Executors registry table"
          emptyTitle="Executor information will be available after backend integration."
          emptyMessage="Agent Office interfaces with deterministic ReferenceExecutor and external AI coding engines via provider-neutral adapters."
          emptyDetail="No executor status or capability data is fabricated in the standalone shell."
        />
      </div>
    </div>
  )
}
