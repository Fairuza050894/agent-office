import type {
  AgentEvent,
  AgentProfile,
  AgentRun,
  Executor,
  RunStage,
  Workspace,
} from '../../api'
import { officeCharacterAppearance } from '../../office3d/character'
import { officeAgentState } from '../../officeProjection'

export interface AgentInspectorProps {
  agent: AgentRun
  profile?: AgentProfile
  executor?: Executor
  workspace?: Workspace
  stage?: RunStage
  latestEvent?: AgentEvent | null
  onClose: () => void
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

function humanizeEventType(eventType: string): string {
  return (
    EVENT_LABELS[eventType] ??
    eventType
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  )
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value
}

export function AgentInspector({
  agent,
  profile,
  executor,
  workspace,
  stage,
  latestEvent,
  onClose,
}: AgentInspectorProps) {
  const state = officeAgentState(agent.status)
  const roleName = profile?.name ?? agent.agent_profile_key

  return (
    <aside className="office-agent-inspector" aria-label="Selected AgentRun details">
      <div className="office-inspector-header">
        <div>
          <span className="office-inspector-kicker">Selected AgentRun</span>
          <strong>{roleName}</strong>
        </div>
        <button
          type="button"
          className="office-inspector-close"
          onClick={onClose}
          aria-label="Close AgentRun inspector"
        >
          ×
        </button>
      </div>

      <div className="office-agent-identity">
        <span
          className="office-agent-avatar"
          style={{
            backgroundColor: `#${officeCharacterAppearance(
              agent.agent_profile_key,
            ).accent
              .toString(16)
              .padStart(6, '0')}`,
          }}
          aria-hidden="true"
        >
          {roleName
            .split(/\s+/)
            .map((part) => part[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()}
        </span>
        <div>
          <strong>{roleName}</strong>
          <span>
            {agent.status} · attempt {agent.attempt}
          </span>
        </div>
        <span className={`office-state-pill state-${state.key}`}>
          {state.label}
        </span>
      </div>

      <dl className="office-detail-facts">
        <div>
          <dt>Stage</dt>
          <dd>
            {agent.stage_key}
            {stage ? ` · ${stage.status}` : ''}
          </dd>
        </div>
        <div>
          <dt>Executor</dt>
          <dd>
            {executor?.name ?? agent.executor_id}
            {executor?.runtime_version ? ` · ${executor.runtime_version}` : ''}
          </dd>
        </div>
        <div>
          <dt>Workspace</dt>
          <dd>
            {workspace
              ? `${workspace.kind}${
                  workspace.git_branch ? ` · ${workspace.git_branch}` : ''
                }`
              : 'Unavailable'}
          </dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{formatTimestamp(agent.started_at)}</dd>
        </div>
        <div className="office-detail-fact-wide">
          <dt>Last factual activity</dt>
          <dd>
            {latestEvent
              ? `${humanizeEventType(latestEvent.event_type)} · ${formatTimestamp(
                  latestEvent.occurred_at,
                )}`
              : `No agent-scoped Event · updated ${formatTimestamp(
                  agent.updated_at,
                )}`}
          </dd>
        </div>
      </dl>

      {agent.reason_summary && (
        <div className="office-detail-note">
          <strong>{agent.reason_code ?? 'AgentRun note'}</strong>
          <span>{agent.reason_summary}</span>
        </div>
      )}

      <div className="office-technical-refs">
        <span>
          AgentRun <code>{agent.id}</code>
        </span>
        <span>
          Profile <code>{agent.agent_profile_key}</code>
        </span>
        <span>
          Executor <code>{shortId(agent.executor_id)}</code>
        </span>
        {agent.workspace_id && (
          <span>
            Workspace <code>{shortId(agent.workspace_id)}</code>
          </span>
        )}
      </div>
    </aside>
  )
}
