import { useEffect, useState } from 'react'
import { api, type Executor } from '../api'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'

export function ExecutorsPage() {
  const [executors, setExecutors] = useState<Executor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api.listExecutors()
      .then((items) => {
        if (active) setExecutors(items)
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Executor status is unavailable.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="page-view executors-view">
      <PageHeader
        eyebrow="ENGINEERING"
        title="Executors"
        description="Factual adapter health, runtime version, capabilities, and security limitations."
      />

      <div className="page-content">
        {isLoading ? (
          <div className="status-feedback" role="status"><span className="status-spinner" /> Loading executors...</div>
        ) : error ? (
          <div className="status-feedback" role="alert"><p className="status-error-text">{error}</p></div>
        ) : executors.length === 0 ? (
          <EmptyState title="No executors registered." message="The backend has no registered executor adapter." detail="Phase 5 does not invent executor health or capability data." />
        ) : (
          <TableShell columns={['Executor', 'Kind', 'Status', 'Runtime', 'Capabilities', 'Security limitations', 'Last checked']} caption="Executor registry" emptyTitle="No executors." emptyMessage="No executor adapters exist.">
            {executors.map((executor) => (
              <tr key={executor.id}>
                <td><strong>{executor.name}</strong><div className="cell-secondary"><code>{executor.id}</code></div></td>
                <td>{executor.kind}</td>
                <td><span className="badge badge-neutral">{executor.status}</span><div className="cell-secondary">{executor.health_summary ?? 'No health summary'}</div></td>
                <td>{executor.runtime_version ?? 'Unavailable'}</td>
                <td className="cell-wrap">{executor.capabilities.map((item) => `${item.capability}: ${item.support}`).join(', ')}</td>
                <td className="cell-wrap">{executor.security_limitations.length ? executor.security_limitations.join(', ') : 'None reported'}</td>
                <td>{new Date(executor.last_check).toLocaleString()}</td>
              </tr>
            ))}
          </TableShell>
        )}
      </div>
    </div>
  )
}
