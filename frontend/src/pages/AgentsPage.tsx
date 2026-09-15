import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'

export function AgentsPage() {
  const columns = [
    'Role',
    'Access mode',
    'Version',
    'Required capabilities',
    'Status',
  ]

  return (
    <div className="page-view agents-view">
      <PageHeader
        eyebrow="ENGINEERING"
        title="Agents"
        description="Reusable Agent Profiles and role definitions (distinct from underlying executors)."
      />

      <div className="page-content">
        <TableShell
          columns={columns}
          caption="Agent profiles table"
          emptyTitle="No agent profiles loaded."
          emptyMessage="Agent Profiles define responsibilities, access modes, and capability requirements."
          emptyDetail="Agent profiles will be loaded from backend configuration."
        />
      </div>
    </div>
  )
}
