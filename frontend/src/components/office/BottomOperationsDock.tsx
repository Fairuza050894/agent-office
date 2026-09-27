import { useMemo, useState } from 'react'

import type { AgentEvent, AgentProfile, AgentRun } from '../../api'
import { officeAgentState } from '../../officeProjection'

export type DockState = 'collapsed' | 'normal' | 'expanded'

export interface BottomOperationsDockProps {
  events: AgentEvent[]
  agents: AgentRun[]
  profiles: AgentProfile[]
  selectedAgentId: string | null
  onSelectAgent: (agentId: string) => void
  modeLabel: string
  defaultState?: DockState
  forceCollapsed?: boolean
}

const EVENT_LABELS: Record<string, string> = {
  'agent.started': 'Agent started',
  'agent.waiting': 'Agent waiting',
  'agent.completed': 'Agent completed',
  'agent.failed': 'Agent failed',
  'review.finding.created': 'Review finding created',
  'test.started': 'Verification started',
  'test.completed': 'Verification completed',
}

function eventLabel(event: AgentEvent): string {
  return (
    EVENT_LABELS[event.event_type] ??
    event.event_type.replace(/[._-]+/g, ' ')
  )
}

function eventDetail(event: AgentEvent): string {
  const summary = event.payload.summary
  if (typeof summary === 'string' && summary.trim()) return summary.trim()

  const title = event.payload.title
  if (typeof title === 'string' && title.trim()) return title.trim()

  if (event.event_type === 'test.completed') {
    const passed = event.payload.passed
    const failed = event.payload.failed
    const parts: string[] = []
    if (typeof passed === 'number') parts.push(`${passed} passed`)
    if (typeof failed === 'number') parts.push(`${failed} failed`)
    if (parts.length > 0) return parts.join(' · ')
  }

  return eventLabel(event)
}

export function BottomOperationsDock({
  events,
  agents,
  profiles,
  selectedAgentId,
  onSelectAgent,
  modeLabel,
  defaultState = 'normal',
  forceCollapsed = false,
}: BottomOperationsDockProps) {
  const [dockState, setDockState] = useState<DockState>(defaultState)
  const renderedState: DockState = forceCollapsed ? 'collapsed' : dockState
  const profileByKey = useMemo(
    () => new Map(profiles.map((profile) => [profile.key, profile])),
    [profiles],
  )
  const agentById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents],
  )

  const recent = events
    .slice()
    .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
    .slice(0, renderedState === 'expanded' ? 40 : 12)

  return (
    <section
      className={`office-operations-dock dock-${renderedState}`}
      aria-label="Bottom Operations Dock"
    >
      <div className="office-dock-header">
        <div className="office-dock-title">
          <strong>Operations Dock</strong>
          <span>{modeLabel}</span>
        </div>
        {!forceCollapsed && (
          <div className="office-dock-actions">
            <button
              type="button"
              className="office-dock-action"
              onClick={() =>
                setDockState((current) =>
                  current === 'collapsed' ? 'normal' : 'collapsed',
                )
              }
            >
              {renderedState === 'collapsed' ? 'Open' : 'Collapse'}
            </button>
            <button
              type="button"
              className="office-dock-action"
              onClick={() =>
                setDockState((current) =>
                  current === 'expanded' ? 'normal' : 'expanded',
                )
              }
            >
              {renderedState === 'expanded' ? 'Normal' : 'Expand'}
            </button>
          </div>
        )}
      </div>

      <div className="office-dock-content">
        <section className="office-dock-panel" aria-label="Canonical activity">
          <div className="office-dock-panel-heading">
            <span>Activity</span>
            <span>{events.length} canonical events</span>
          </div>
          <div className="office-dock-scroll">
            {recent.length === 0 ? (
              <div className="office-dock-empty">
                No canonical Event is available in this scope.
              </div>
            ) : (
              recent.map((event) => {
                const agent = event.agent_run_id
                  ? agentById.get(event.agent_run_id)
                  : undefined
                const role = agent
                  ? profileByKey.get(agent.agent_profile_key)?.name ??
                    agent.agent_profile_key
                  : event.source

                return (
                  <article key={event.id} className="office-dock-event">
                    <time dateTime={event.occurred_at}>
                      {new Date(event.occurred_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                    <span className="office-dock-event-role">{role}</span>
                    <span className="office-dock-event-detail">
                      {eventLabel(event)}
                      {eventDetail(event) !== eventLabel(event)
                        ? ` · ${eventDetail(event)}`
                        : ''}
                    </span>
                  </article>
                )
              })
            )}
          </div>
        </section>

        <section className="office-dock-panel" aria-label="Active team">
          <div className="office-dock-panel-heading">
            <span>Team</span>
            <span>{agents.length} AgentRun{agents.length === 1 ? '' : 's'}</span>
          </div>
          <div className="office-dock-scroll">
            {agents.length === 0 ? (
              <div className="office-dock-empty">
                No factual AgentRun is active in this scope.
              </div>
            ) : (
              agents.map((agent) => {
                const state = officeAgentState(agent.status)
                return (
                  <button
                    key={agent.id}
                    type="button"
                    className={`office-dock-agent ${selectedAgentId === agent.id ? 'selected' : ''}`}
                    aria-pressed={selectedAgentId === agent.id}
                    onClick={() => onSelectAgent(agent.id)}
                  >
                    <span
                      className={`office-dock-agent-dot state-${state.key}`}
                      aria-hidden="true"
                    />
                    <span className="office-dock-agent-name">
                      {profileByKey.get(agent.agent_profile_key)?.name ??
                        agent.agent_profile_key}
                    </span>
                    <span className="office-dock-agent-status">
                      {state.label}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </section>
      </div>
    </section>
  )
}
