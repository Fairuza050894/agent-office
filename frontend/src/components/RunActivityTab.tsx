import { useState, useEffect } from 'react'
import { api, type AgentEvent } from '../api'

export interface RunActivityTabProps {
  runId: string
}

export function RunActivityTab({ runId }: RunActivityTabProps) {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const page = await api.getRunEvents(runId)
        if (!active) return
        setEvents(page.events)
        setIsLoading(false)
      } catch {
        if (!active) return
        setIsLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [runId])

  if (isLoading) {
    return <div className="status-feedback"><span className="status-spinner"/> Loading activity...</div>
  }

  if (events.length === 0) {
    return <div style={{ color: 'var(--text-secondary)' }}>No activity recorded for this run.</div>
  }

  return (
    <div className="run-activity">
      <div style={{ display: 'grid', gap: '1rem' }}>
        {events.map(event => (
          <div key={event.id} className="panel" style={{ padding: '1rem', borderLeft: '4px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              <span>{new Date(event.occurred_at).toLocaleString()}</span>
              <span>{event.source}</span>
            </div>
            <div style={{ fontWeight: 500 }}>
              {event.event_type}
            </div>
            <pre style={{ marginTop: '1rem', fontSize: '0.75rem', backgroundColor: 'var(--bg-secondary)', padding: '0.5rem', borderRadius: '4px', overflowX: 'auto' }}>
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  )
}
