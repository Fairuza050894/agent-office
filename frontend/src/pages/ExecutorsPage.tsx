import { useEffect, useState } from 'react'
import { api, type Executor } from '../api'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'

function supportClass(value: string): string {
  return `capability-support support-${value.toLowerCase()}`
}

function healthDotClass(status: string): string {
  if (status === 'AVAILABLE') return 'connected'
  if (status === 'DEGRADED') return 'checking'
  return 'disconnected'
}

function splitSecurityLimitation(value: string): [string | null, string] {
  const separator = value.indexOf(':')
  if (separator < 0) return [null, value]

  const key = value.slice(0, separator).trim()
  const detail = value.slice(separator + 1).trim()
  return [key || null, detail || value]
}

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
        title="Executors"
        description="Runtime health, capabilities, and enforced security boundaries for every registered adapter."
      />

      <div className="page-content">
        {isLoading ? (
          <div className="status-feedback" role="status"><span className="status-spinner" /> Loading executors...</div>
        ) : error ? (
          <div className="status-feedback" role="alert"><p className="status-error-text">{error}</p></div>
        ) : executors.length === 0 ? (
          <EmptyState
            title="No executors registered."
            message="The backend has no registered executor adapter."
            detail="Unavailable executor state is shown explicitly rather than inferred."
          />
        ) : (
          <div className="executor-list">
            {executors.map((executor) => (
              <article
                key={executor.id}
                className="executor-panel"
                aria-labelledby={`executor-${executor.id}-name`}
              >
                <header className="executor-panel-header">
                  <div>
                    <div className="executor-kind">{executor.kind}</div>
                    <h2 id={`executor-${executor.id}-name`} className="executor-name">{executor.name}</h2>
                    <code className="executor-id">{executor.id}</code>
                  </div>
                  <div className={`executor-health status-${executor.status.toLowerCase()}`}>
                    <span className={`status-dot ${healthDotClass(executor.status)}`} aria-hidden="true" />
                    <span>{executor.status}</span>
                  </div>
                </header>

                <dl className="executor-facts">
                  <div>
                    <dt>Runtime</dt>
                    <dd>{executor.runtime_version ?? 'Unavailable'}</dd>
                  </div>
                  <div>
                    <dt>Last checked</dt>
                    <dd>{new Date(executor.last_check).toLocaleString()}</dd>
                  </div>
                  <div className="executor-health-summary">
                    <dt>Health</dt>
                    <dd>{executor.health_summary ?? 'No health summary reported.'}</dd>
                  </div>
                </dl>

                <div className="executor-detail-grid">
                  <section aria-labelledby={`executor-${executor.id}-capabilities`}>
                    <h3 id={`executor-${executor.id}-capabilities`} className="executor-section-title">Capabilities</h3>
                    <div className="capability-list">
                      {executor.capabilities.map((item) => (
                        <div key={item.capability} className="capability-row">
                          <code>{item.capability}</code>
                          <span className={supportClass(item.support)}>{item.support}</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section aria-labelledby={`executor-${executor.id}-security`}>
                    <h3 id={`executor-${executor.id}-security`} className="executor-section-title">Security boundary</h3>
                    {executor.security_limitations.length === 0 ? (
                      <p className="executor-muted">No security limitations reported.</p>
                    ) : (
                      <div className="executor-limitations">
                        {executor.security_limitations.map((limitation) => {
                          const [key, detail] = splitSecurityLimitation(limitation)
                          return (
                            <div key={limitation} className="security-limitation-row">
                              {key && <code className="security-limitation-key">{key}</code>}
                              <span className="security-limitation-value">{detail}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </section>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
