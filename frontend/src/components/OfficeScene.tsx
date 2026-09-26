import { useMemo } from 'react'

import type {
  AgentEvent,
  AgentProfile,
  AgentRun,
  Executor,
  RunStage,
  Workspace,
} from '../api'
import { officeAgentState } from '../officeProjection'
import { ThreeOfficeScene } from './ThreeOfficeScene'

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
  mode: 'live' | 'replay'
  replayNonce: number
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

function profileName(agent: AgentRun, profiles: Map<string, AgentProfile>): string {
  return profiles.get(agent.agent_profile_key)?.name ?? agent.agent_profile_key
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

export function OfficeScene({
  stages,
  agents,
  events,
  profiles,
  selectedAgentId,
  onSelectAgent,
  motionPaused,
  mode,
  replayNonce,
}: OfficeSceneProps) {
  const profileByKey = useMemo(
    () => new Map(profiles.map((profile) => [profile.key, profile])),
    [profiles],
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
    <section className="office-renderer" aria-label="Run office 3D projection">
      <div className="office-scene-heading">
        <div>
          <strong>Live office</strong>
          <span>Canonical AgentRun state · fixed isometric view · drag to pan · wheel to zoom</span>
        </div>
        <span className="office-render-mode">
          {mode === 'replay'
            ? 'Historical replay · timing compressed'
            : 'Live state'}
        </span>
      </div>

      <ThreeOfficeScene
        stages={stages}
        agents={agents}
        profiles={profiles}
        selectedAgentId={selectedAgentId}
        onSelectAgent={onSelectAgent}
        motionPaused={motionPaused}
        mode={mode}
        replayNonce={replayNonce}
      />

      <div className="office-agent-roster" aria-label="AgentRun roster">
        {agents.length === 0 ? (
          <span className="office-agent-roster-empty">
            No AgentRuns instantiated for this Run.
          </span>
        ) : (
          agents.map((agent) => {
            const state = officeAgentState(agent.status)
            return (
              <button
                key={agent.id}
                type="button"
                className={`office-agent-button ${selectedAgentId === agent.id ? 'selected' : ''}`}
                aria-label={`${profileName(agent, profileByKey)}, ${state.label}`}
                aria-pressed={selectedAgentId === agent.id}
                onClick={() => onSelectAgent(agent.id)}
              >
                <span
                  className={`office-roster-dot state-${state.key}`}
                  aria-hidden="true"
                />
                <span>{profileName(agent, profileByKey)}</span>
                <small>{state.label}</small>
              </button>
            )
          })
        )}
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
