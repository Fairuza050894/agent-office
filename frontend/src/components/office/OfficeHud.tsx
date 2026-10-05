import type { AgentEvent, AgentRun, Executor, ResultReview } from '../../api'
import { officeAgentState } from '../../officeProjection'
import { Link } from '../../router/Link'

export interface OfficeHudProps {
  agents: AgentRun[]
  events: AgentEvent[]
  executors: Executor[]
  review: ResultReview | null
  reviewAvailable: boolean
  taskId: string | null
  runId: string | null
  compact?: boolean
}

function eventSummary(event: AgentEvent): string {
  const summary = event.payload.summary
  if (typeof summary === 'string' && summary.trim()) return summary.trim()
  const title = event.payload.title
  if (typeof title === 'string' && title.trim()) return title.trim()
  return event.event_type.replace(/[._-]+/g, ' ')
}

function redactionNote(event: AgentEvent): string | null {
  if (!event.redacted_keys || event.redacted_keys.length === 0) return null
  return `${event.redacted_keys.length} field${event.redacted_keys.length === 1 ? '' : 's'} redacted`
}

export function OfficeHud({
  agents,
  events,
  executors,
  review,
  reviewAvailable,
  taskId,
  runId,
  compact = false,
}: OfficeHudProps) {
  const counts = new Map<string, number>()
  for (const agent of agents) {
    const state = officeAgentState(agent.status)
    counts.set(state.key, (counts.get(state.key) ?? 0) + 1)
  }
  const countEntries = [...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )
  const recentEvents = events
    .slice()
    .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
    .slice(0, compact ? 3 : 5)
  const availableExecutors = executors.filter(
    (executor) => executor.status === 'AVAILABLE',
  )
  const hasExecutors = executors.length > 0
  const delivered = review?.state === 'DELIVERED'

  return (
    <div className="office-hud" aria-label="Office HUD">
      <div className="office-hud-strip" aria-label="Office status">
        <div className="office-hud-block">
          <span className="office-hud-label">AgentRuns</span>
          {agents.length === 0 ? (
            <small>No AgentRun in this scope.</small>
          ) : (
            <span className="office-hud-counts">
              {countEntries.map(([key, count]) => (
                <em key={key}>
                  {count} {key}
                </em>
              ))}
            </span>
          )}
        </div>

        <div className="office-hud-block">
          <span className="office-hud-label">Recent activity</span>
          {recentEvents.length === 0 ? (
            <small>No canonical Event in this scope.</small>
          ) : (
            <ul className="office-hud-events">
              {recentEvents.map((event) => (
                <li key={event.id}>
                  <time dateTime={event.occurred_at}>
                    {new Date(event.occurred_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                  <span>{eventSummary(event)}</span>
                  {redactionNote(event) && (
                    <small>{redactionNote(event)}</small>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="office-hud-block">
          <span className="office-hud-label">System status</span>
          {!hasExecutors ? (
            <small>Executor health unavailable.</small>
          ) : (
            <span className="office-hud-counts">
              <em>
                {availableExecutors.length} of {executors.length} executors available
              </em>
            </span>
          )}
          {!reviewAvailable ? (
            <small>Delivery status unavailable.</small>
          ) : delivered ? (
            <small>
              Delivered
              {review?.delivered_branch ? ` · ${review.delivered_branch}` : ''}
              {review?.delivered_commit
                ? ` · ${review.delivered_commit.slice(0, 12)}`
                : ''}
            </small>
          ) : (
            <small>Not delivered{review ? ` · ${review.state}` : ''}.</small>
          )}
        </div>

        {(taskId || runId) && (
          <div className="office-hud-block office-hud-links">
            <span className="office-hud-label">Focus</span>
            <span className="office-hud-counts">
              {taskId && <Link href={`/tasks/${taskId}`}>Open Task</Link>}
              {runId && <Link href={`/runs/${runId}/office`}>Watch Run</Link>}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
