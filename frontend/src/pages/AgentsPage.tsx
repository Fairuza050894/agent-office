import { useEffect, useState } from 'react'
import { api, type AgentProfile } from '../api'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'

export function AgentsPage() {
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api.listAgentProfiles()
      .then((items) => {
        if (active) setProfiles(items)
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Agent Profiles are unavailable.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="page-view agents-view">
      <PageHeader
        eyebrow="ENGINEERING"
        title="Agents"
        description="Reusable Agent Profiles. Concrete Agent Runs are inspected inside each Run."
      />

      <div className="page-content">
        {isLoading ? (
          <div className="status-feedback" role="status"><span className="status-spinner" /> Loading Agent Profiles...</div>
        ) : error ? (
          <div className="status-feedback" role="alert"><p className="status-error-text">{error}</p></div>
        ) : profiles.length === 0 ? (
          <EmptyState title="No agent profiles loaded." message="The backend AgentProfile catalog is empty." detail="Agent Profiles define reusable responsibilities independently of executors." />
        ) : (
          <TableShell columns={['Role', 'Key', 'Access mode', 'Version', 'Status', 'Description']} caption="Agent Profiles" emptyTitle="No agent profiles." emptyMessage="No profiles exist.">
            {profiles.map((profile) => (
              <tr key={profile.id}>
                <td><strong>{profile.name}</strong></td>
                <td><code>{profile.key}</code></td>
                <td>{profile.default_access_mode}</td>
                <td>{profile.version}</td>
                <td><span className="badge badge-neutral">{profile.status}</span></td>
                <td className="cell-wrap">{profile.description}</td>
              </tr>
            ))}
          </TableShell>
        )}
      </div>
    </div>
  )
}
