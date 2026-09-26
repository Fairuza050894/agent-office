import { useMemo } from 'react'

import type {
  AgentEvent,
  AgentProfile,
  AgentRun,
  Executor,
  RunStage,
  Workspace,
} from '../api'

export interface OfficeSceneProps {
  stages: RunStage[]
  agents: AgentRun[]
  events: AgentEvent[]
  workspaces: Workspace[]
  executors: Executor[]
  profiles: AgentProfile[]
  selectedAgentId: string | null
  onSelectAgent: (agentId: string) => void
  motionPaused: boolean
}

interface OfficeState {
  key: string
  label: string
}

interface StageProjection {
  key: string
  status: string
  orderHint: number
  stateAvailable: boolean
  agents: AgentRun[]
}

const OFFICE_SIGNAL_EVENTS = new Set([
  'agent.started',
  'agent.waiting',
  'agent.completed',
  'agent.failed',
  'review.finding.created',
  'test.started',
  'test.completed',
])

const EVENT_LABELS: Record<string, string> = {
  'agent.started': 'Agent started',
  'agent.waiting': 'Agent waiting',
  'agent.completed': 'Agent completed',
  'agent.failed': 'Agent failed',
  'review.finding.created': 'Review finding',
  'test.started': 'Test started',
  'test.completed': 'Test completed',
}

function officeState(status: string): OfficeState {
  switch (status.toUpperCase()) {
    case 'PENDING':
    case 'CREATED':
      return { key: 'pending', label: 'Waiting to start' }
    case 'STARTING':
      return { key: 'starting', label: 'Starting' }
    case 'RUNNING':
      return { key: 'running', label: 'Running' }
    case 'WAITING':
      return { key: 'waiting', label: 'Waiting' }
    case 'BLOCKED':
      return { key: 'blocked', label: 'Blocked' }
    case 'FAILED':
      return { key: 'failed', label: 'Failed' }
    case 'COMPLETED':
      return { key: 'completed', label: 'Completed' }
    case 'CANCELLED':
      return { key: 'cancelled', label: 'Cancelled' }
    default:
      return { key: 'unknown', label: status || 'Unknown' }
  }
}

function profileName(agent: AgentRun, profiles: Map<string, AgentProfile>): string {
  return profiles.get(agent.agent_profile_key)?.name ?? agent.agent_profile_key
}

function initials(value: string): string {
  const parts = value
    .split(/[-_\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) return 'AO'
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function latestAgentEvent(agentId: string, events: AgentEvent[]): AgentEvent | null {
  return (
    events
      .filter((event) => event.agent_run_id === agentId)
      .slice()
      .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))[0] ?? null
  )
}

function eventClass(event: AgentEvent | null): string {
  if (!event) return 'event-none'
  return `event-${event.event_type.replaceAll('.', '-')}`
}

function signalDetail(event: AgentEvent): string {
  const summary = event.payload.summary
  if (typeof summary === 'string' && summary.trim()) return summary

  if (event.event_type === 'review.finding.created') {
    const title = event.payload.title
    if (typeof title === 'string' && title.trim()) return title
  }

  if (event.event_type === 'test.completed') {
    const passed = event.payload.passed
    const failed = event.payload.failed
    const details: string[] = []
    if (typeof passed === 'number') details.push(`${passed} passed`)
    if (typeof failed === 'number') details.push(`${failed} failed`)
    if (details.length > 0) return details.join(' · ')
  }

  return event.source
}

function stageProjections(stages: RunStage[], agents: AgentRun[]): StageProjection[] {
  const sortedStages = stages
    .slice()
    .sort((left, right) => left.order_hint - right.order_hint)
    .map((stage) => ({
      key: stage.stage_key,
      status: stage.status,
      orderHint: stage.order_hint,
      stateAvailable: true,
      agents: agents.filter((agent) => agent.stage_key === stage.stage_key),
    }))

  const known = new Set(sortedStages.map((stage) => stage.key))
  const fallbackKeys = Array.from(
    new Set(
      agents
        .map((agent) => agent.stage_key)
        .filter((stageKey) => !known.has(stageKey)),
    ),
  )

  fallbackKeys.forEach((key, index) => {
    sortedStages.push({
      key,
      status: 'UNAVAILABLE',
      orderHint: 10_000 + index,
      stateAvailable: false,
      agents: agents.filter((agent) => agent.stage_key === key),
    })
  })

  return sortedStages
}

export function OfficeScene({
  stages,
  agents,
  events,
  workspaces,
  executors,
  profiles,
  selectedAgentId,
  onSelectAgent,
  motionPaused,
}: OfficeSceneProps) {
  const profileByKey = useMemo(
    () => new Map(profiles.map((profile) => [profile.key, profile])),
    [profiles],
  )
  const executorById = useMemo(
    () => new Map(executors.map((executor) => [executor.id, executor])),
    [executors],
  )
  const workspaceById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
    [workspaces],
  )

  const projectedStages = useMemo(
    () => stageProjections(stages, agents),
    [stages, agents],
  )

  const signals = useMemo(
    () =>
      events
        .filter((event) => OFFICE_SIGNAL_EVENTS.has(event.event_type))
        .slice()
        .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
        .slice(0, 6),
    [events],
  )

  return (
    <section
      className={`office-renderer ${motionPaused ? 'motion-paused' : ''}`}
      aria-label="Run office 3D projection"
    >
      <div className="office-projection">
        <div className="office-floor-plane" aria-hidden="true" />

        <div className="office-stage-track">
          {projectedStages.length === 0 ? (
            <div className="office-no-stages">
              <strong>No stage state is currently persisted.</strong>
              <span>
                Office View will not invent rooms or workers without RunStage and
                AgentRun truth.
              </span>
            </div>
          ) : (
            projectedStages.map((stage) => (
              <section
                key={stage.key}
                className="office-stage-zone"
                aria-labelledby={`office-stage-${stage.key}`}
              >
                <header className="office-stage-header">
                  <div>
                    <span className="office-stage-order">
                      {stage.orderHint < 10_000 ? `Stage ${stage.orderHint}` : 'Agent stage'}
                    </span>
                    <h2 id={`office-stage-${stage.key}`}>{stage.key}</h2>
                  </div>
                  <span
                    className={`office-stage-status stage-${stage.status.toLowerCase()}`}
                  >
                    {stage.stateAvailable ? stage.status : 'STATE UNAVAILABLE'}
                  </span>
                </header>

                <div className="office-stage-floor">
                  {stage.agents.length === 0 ? (
                    <div className="office-stage-empty">
                      No AgentRuns instantiated in this stage.
                    </div>
                  ) : (
                    <div className="office-workstation-grid">
                      {stage.agents.map((agent) => {
                        const state = officeState(agent.status)
                        const name = profileName(agent, profileByKey)
                        const latestEvent = latestAgentEvent(agent.id, events)
                        const executor = executorById.get(agent.executor_id)
                        const workspace = agent.workspace_id
                          ? workspaceById.get(agent.workspace_id)
                          : undefined

                        return (
                          <button
                            key={agent.id}
                            type="button"
                            className={[
                              'office-agent-button',
                              `state-${state.key}`,
                              eventClass(latestEvent),
                              selectedAgentId === agent.id ? 'selected' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            aria-label={`${name}, ${state.label}`}
                            aria-pressed={selectedAgentId === agent.id}
                            onClick={() => onSelectAgent(agent.id)}
                          >
                            <span className="office-workstation-visual" aria-hidden="true">
                              <span className="office-desk-surface">
                                <span className="office-monitor">
                                  <span className="office-monitor-screen" />
                                </span>
                              </span>
                              <span className="office-character">
                                <span className="office-character-shadow" />
                                <span className="office-character-head" />
                                <span className="office-character-body">
                                  {initials(name)}
                                </span>
                                <span className="office-state-light" />
                              </span>
                            </span>

                            <span className="office-agent-caption">
                              <strong>{name}</strong>
                              <span>{state.label}</span>
                              <small>
                                {executor?.name ?? agent.executor_id.slice(0, 8)}
                                {workspace ? ` · ${workspace.kind}` : ''}
                              </small>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      <div className="office-signal-strip" aria-label="Recent factual office signals">
        <div className="office-signal-heading">
          <strong>Recent signals</strong>
          <span>Canonical Events only</span>
        </div>
        {signals.length === 0 ? (
          <div className="office-signal-empty">
            No Office-reactive event has been recorded for this Run.
          </div>
        ) : (
          <div className="office-signal-list">
            {signals.map((event) => (
              <article key={event.id} className="office-signal">
                <span className="office-signal-type">
                  {EVENT_LABELS[event.event_type] ?? event.event_type}
                </span>
                <span className="office-signal-detail">{signalDetail(event)}</span>
                <time dateTime={event.occurred_at}>
                  {new Date(event.occurred_at).toLocaleTimeString()}
                </time>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export function officeAgentState(status: string): OfficeState {
  return officeState(status)
}

export function officeLatestAgentEvent(
  agentId: string,
  events: AgentEvent[],
): AgentEvent | null {
  return latestAgentEvent(agentId, events)
}
