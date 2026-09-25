import { useCallback, useEffect, useState } from 'react'
import { api, type AgentEvent } from '../api'

export interface RunActivityTabProps {
  runId: string
}

function eventKey(event: AgentEvent): string {
  return event.id
}

export function RunActivityTab({ runId }: RunActivityTabProps) {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [liveState, setLiveState] = useState<'connected' | 'disconnected'>('disconnected')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const page = await api.getRunEvents(runId)
      setEvents(page.events)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activity history is unavailable.')
    } finally {
      setIsLoading(false)
    }
  }, [runId])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(refresh)

    if (typeof EventSource === 'undefined') {
      return () => {
        active = false
      }
    }

    const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events/stream`)
    source.onopen = () => {
      if (active) setLiveState('connected')
    }
    source.onmessage = (message) => {
      if (!active) return
      try {
        const event = JSON.parse(message.data) as AgentEvent
        setEvents((current) => {
          if (current.some((item) => eventKey(item) === eventKey(event))) return current
          return [...current, event].sort((left, right) =>
            left.recorded_at.localeCompare(right.recorded_at)
          )
        })
      } catch {
        // REST remains the reconciliation authority if a frame is malformed.
      }
    }
    source.onerror = () => {
      if (active) setLiveState('disconnected')
      source.close()
    }

    return () => {
      active = false
      source.close()
    }
  }, [refresh, runId])

  if (isLoading) {
    return <div className="status-feedback" role="status"><span className="status-spinner" /> Loading activity...</div>
  }

  return (
    <div className="run-tab-stack">
      <div className="run-live-status" role="status" aria-live="polite">
        <span className={`status-dot ${liveState === 'connected' ? 'connected' : 'disconnected'}`} aria-hidden="true" />
        {liveState === 'connected'
          ? 'Live updates connected.'
          : 'Live updates disconnected. REST reconciliation remains available.'}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      {error && <div className="run-alert run-alert-danger" role="alert"><span>{error}</span></div>}

      {events.length === 0 ? (
        <div className="run-muted">No activity recorded for this run.</div>
      ) : (
        <div className="run-activity">
          <div className="run-event-list">
            {events.map((event) => (
              <article key={event.id} className="panel run-event">
                <div className="run-event-meta">
                  <time dateTime={event.occurred_at}>{new Date(event.occurred_at).toLocaleString()}</time>
                  <span>{event.source}</span>
                </div>
                <strong>{event.event_type}</strong>
                <dl className="run-event-payload">
                  {Object.entries(event.payload).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value === null ? 'Unavailable' : String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
