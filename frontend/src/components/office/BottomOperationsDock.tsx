import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import type {
  AgentEvent,
  AgentProfile,
  AgentRun,
  ComposerThread,
  PlanningArtifact,
  PlanningEvent,
  RequirementCandidate,
  Task,
  TeamProposal,
} from '../../api'
import { officeAgentState } from '../../officeProjection'

export type DockState = 'collapsed' | 'normal' | 'expanded'
type DockTab =
  | 'tasks'
  | 'activity'
  | 'notes'
  | 'requirements'
  | 'questions'
  | 'risks'
  | 'deferred'

export interface BottomOperationsDockProps {
  events: AgentEvent[]
  agents: AgentRun[]
  profiles: AgentProfile[]
  selectedAgentId: string | null
  onSelectAgent: (agentId: string) => void
  modeLabel: string
  tasks?: Task[]
  defaultState?: DockState
  forceCollapsed?: boolean
  planningThread?: ComposerThread | null
  planningTeam?: TeamProposal | null
  planningArtifacts?: PlanningArtifact[]
  planningRequirements?: RequirementCandidate[]
  planningEvents?: PlanningEvent[]
  onAcceptPlanningTeam?: () => Promise<void> | void
  onRejectPlanningTeam?: () => Promise<void> | void
  onResolvePlanningQuestion?: (
    artifactId: string,
    selectedOption: string,
  ) => Promise<void> | void
  onApproveRequirement?: (requirementId: string) => Promise<void> | void
  onRejectRequirement?: (requirementId: string) => Promise<void> | void
  onDeferRequirement?: (requirementId: string) => Promise<void> | void
  planningDecisionBusy?: boolean
  planningActionBusy?: boolean
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

const TAB_LABELS: Record<DockTab, string> = {
  tasks: 'Tasks',
  activity: 'Activity',
  notes: 'Notes',
  requirements: 'Requirements',
  questions: 'Questions',
  risks: 'Risks',
  deferred: 'Deferred',
}

const DOCK_HEIGHT_STORAGE_KEY = 'agent-office.office-dock-height'
const DOCK_NORMAL_HEIGHT = 210
const DOCK_MIN_HEIGHT = 180
const DOCK_KEYBOARD_STEP = 40

const PLANNING_VALUE_LABELS: Record<string, string> = {
  NOT_INSPECTED_IN_PHASE_9C: 'Not inspected yet · Phase 9D read-only context',
  NO_PRIOR_PLANNING_THREAD: 'No prior planning thread',
  NONE_IDENTIFIED: 'None identified yet',
  NONE_IDENTIFIED_BY_DETERMINISTIC_PHASE_9C: 'None identified by Phase 9C planning',
  NONE_PROPOSED_UNTIL_READ_ONLY_PROJECT_CONTEXT_IS_AVAILABLE:
    'None proposed until read-only project context is available',
  NOT_PROPOSED_UNTIL_REQUIREMENTS_ARE_GROUNDED_AND_APPROVED:
    'Not proposed until requirements are grounded and approved',
  TO_BE_ASSESSED_AFTER_READ_ONLY_PROJECT_CONTEXT:
    'To be assessed after read-only project context',
  NOT_STARTED: 'Not started',
}

function boundedDockHeight(height: number): number {
  const viewportLimit =
    typeof window === 'undefined'
      ? 640
      : Math.min(500, Math.round(window.innerHeight * 0.48))
  return Math.min(
    Math.max(Math.round(height), DOCK_MIN_HEIGHT),
    Math.max(DOCK_MIN_HEIGHT, viewportLimit),
  )
}

function readStoredDockHeight(): number | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(DOCK_HEIGHT_STORAGE_KEY)
    if (raw === null) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? boundedDockHeight(parsed) : null
  } catch {
    return null
  }
}

function storeDockHeight(height: number): void {
  try {
    window.localStorage.setItem(DOCK_HEIGHT_STORAGE_KEY, String(height))
  } catch {
    // Resizing remains available even when storage is blocked.
  }
}

function planningValueLabel(value: unknown): string {
  if (value === null) return '—'
  if (typeof value !== 'string') return String(value)
  return PLANNING_VALUE_LABELS[value] ?? value
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

function planningEventLabel(event: PlanningEvent): string {
  return event.event_type.replace(/[._-]+/g, ' ')
}

function planningEventDetail(event: PlanningEvent): string {
  const summary = event.payload.reason_summary ?? event.payload.title
  if (typeof summary === 'string' && summary.trim()) return summary.trim()

  const selectedOption = event.payload.selected_option
  if (typeof selectedOption === 'string' && selectedOption.trim()) {
    return selectedOption.replaceAll('_', ' ')
  }

  return planningEventLabel(event)
}

function planningArtifactsForTab(
  tab: DockTab,
  artifacts: PlanningArtifact[],
): PlanningArtifact[] {
  switch (tab) {
    case 'notes':
      return artifacts.filter((artifact) =>
        ['BRIEF', 'NOTE', 'DECISION'].includes(artifact.artifact_type),
      )
    case 'questions':
      return artifacts.filter((artifact) => artifact.artifact_type === 'QUESTION')
    case 'risks':
      return artifacts.filter((artifact) => artifact.artifact_type === 'RISK')
    case 'deferred':
      return artifacts.filter(
        (artifact) =>
          artifact.artifact_type === 'ACTION' &&
          String(artifact.content.state ?? '').toUpperCase() === 'DEFERRED',
      )
    default:
      return []
  }
}

function PlanningArtifactList({ artifacts }: { artifacts: PlanningArtifact[] }) {
  if (artifacts.length === 0) {
    return (
      <div className="office-dock-empty">
        No planning artifact in this category.
      </div>
    )
  }

  return (
    <>
      {artifacts.map((artifact) => (
        <article key={artifact.id} className="office-planning-artifact">
          <div className="office-planning-artifact-head">
            <strong>{artifact.title}</strong>
            <span>{artifact.status}</span>
          </div>
          <dl>
            {Object.entries(artifact.content).map(([key, value]) => (
              <div key={key}>
                <dt>{key.replaceAll('_', ' ')}</dt>
                <dd title={typeof value === 'string' ? value : undefined}>
                  {planningValueLabel(value)}
                </dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </>
  )
}

function QuestionList({
  questions,
  onResolve,
  busy,
}: {
  questions: PlanningArtifact[]
  onResolve?: (artifactId: string, selectedOption: string) => Promise<void> | void
  busy: boolean
}) {
  if (questions.length === 0) {
    return (
      <div className="office-dock-empty">
        No open decision or planning question in this thread.
      </div>
    )
  }

  return (
    <>
      {questions.map((question) => {
        const options = Object.entries(question.content)
          .filter(
            ([key, value]) =>
              key.startsWith('option_') &&
              typeof value === 'string' &&
              value.trim().length > 0,
          )
          .sort(([left], [right]) => left.localeCompare(right))

        return (
          <article key={question.id} className="office-planning-question">
            <div className="office-planning-artifact-head">
              <strong>{question.title}</strong>
              <span>{question.status}</span>
            </div>
            <p>{String(question.content.question ?? 'Decision required')}</p>
            {question.content.recommendation && (
              <div className="office-planning-recommendation">
                <span>Recommendation</span>
                <strong>{String(question.content.recommendation)}</strong>
              </div>
            )}
            <div className="office-planning-options">
              {options.map(([key, value], index) => (
                <button
                  key={key}
                  type="button"
                  className="office-planning-option"
                  disabled={
                    busy ||
                    question.status !== 'OPEN' ||
                    onResolve === undefined
                  }
                  onClick={() => void onResolve?.(question.id, key)}
                >
                  <span>{String.fromCharCode(65 + index)}</span>
                  <strong>{String(value)}</strong>
                </button>
              ))}
            </div>
          </article>
        )
      })}
    </>
  )
}

function RequirementList({
  requirements,
  onApprove,
  onReject,
  onDefer,
  busy,
}: {
  requirements: RequirementCandidate[]
  onApprove?: (requirementId: string) => Promise<void> | void
  onReject?: (requirementId: string) => Promise<void> | void
  onDefer?: (requirementId: string) => Promise<void> | void
  busy: boolean
}) {
  if (requirements.length === 0) {
    return (
      <div className="office-dock-empty">
        No RequirementCandidate has been proposed in this planning thread.
      </div>
    )
  }

  return (
    <>
      {requirements.map((requirement) => (
        <article key={requirement.id} className="office-planning-requirement">
          <div>
            <strong>{requirement.title}</strong>
            <span>{requirement.status}</span>
          </div>
          <p>{requirement.requirement}</p>
          {requirement.acceptance_hint && (
            <small>Acceptance · {requirement.acceptance_hint}</small>
          )}
          {requirement.status === 'PROPOSED' && (
            <div className="office-requirement-actions">
              <button
                type="button"
                className="office-team-decision accept"
                disabled={busy || onApprove === undefined}
                onClick={() => void onApprove?.(requirement.id)}
              >
                Approve
              </button>
              <button
                type="button"
                className="office-team-decision"
                disabled={busy || onDefer === undefined}
                onClick={() => void onDefer?.(requirement.id)}
              >
                Defer
              </button>
              <button
                type="button"
                className="office-team-decision danger"
                disabled={busy || onReject === undefined}
                onClick={() => void onReject?.(requirement.id)}
              >
                Reject
              </button>
            </div>
          )}
        </article>
      ))}
    </>
  )
}

function TaskList({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return (
      <div className="office-dock-empty">
        No canonical Task exists in this Project yet.
      </div>
    )
  }

  return (
    <>
      {tasks.map((task) => (
        <article key={task.id} className="office-dock-task">
          <div>
            <strong>{task.title}</strong>
            <span>{task.id.slice(0, 8)}</span>
          </div>
          <p>{task.objective}</p>
          {task.constraints && <small>{task.constraints}</small>}
        </article>
      ))}
    </>
  )
}

function PlanningActivity({ events }: { events: PlanningEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="office-dock-empty">
        No durable PlanningEvent is available in this thread.
      </div>
    )
  }

  return (
    <>
      {events
        .slice()
        .sort((left, right) => right.sequence - left.sequence)
        .map((event) => (
          <article key={event.id} className="office-dock-event">
            <time dateTime={event.occurred_at}>
              {new Date(event.occurred_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
            <span className="office-dock-event-role">
              {event.role_key ?? 'planning'}
            </span>
            <span className="office-dock-event-detail">
              {planningEventLabel(event)}
              {planningEventDetail(event) !== planningEventLabel(event)
                ? ` · ${planningEventDetail(event)}`
                : ''}
            </span>
          </article>
        ))}
    </>
  )
}

export function BottomOperationsDock({
  events,
  agents,
  profiles,
  selectedAgentId,
  onSelectAgent,
  modeLabel,
  tasks = [],
  defaultState = 'normal',
  forceCollapsed = false,
  planningThread = null,
  planningTeam = null,
  planningArtifacts: artifactList = [],
  planningRequirements = [],
  planningEvents = [],
  onAcceptPlanningTeam,
  onRejectPlanningTeam,
  onResolvePlanningQuestion,
  onApproveRequirement,
  onRejectRequirement,
  onDeferRequirement,
  planningDecisionBusy = false,
  planningActionBusy = false,
}: BottomOperationsDockProps) {
  const [dockState, setDockState] = useState<DockState>(defaultState)
  const [activeTab, setActiveTab] = useState<DockTab>(
    planningThread ? 'notes' : 'activity',
  )
  const [manualHeight, setManualHeight] = useState<number | null>(readStoredDockHeight)
  const dockRef = useRef<HTMLElement | null>(null)
  const resizeRef = useRef<{
    pointerId: number
    startY: number
    startHeight: number
  } | null>(null)
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

  const tabs: DockTab[] = planningThread
    ? ['tasks', 'notes', 'requirements', 'questions', 'risks', 'deferred', 'activity']
    : ['tasks', 'activity']

  const visiblePlanningArtifacts = planningArtifactsForTab(activeTab, artifactList)

  const currentDockHeight = () => {
    const measured = dockRef.current?.getBoundingClientRect().height ?? 0
    if (measured > 0) return measured
    return manualHeight ?? DOCK_NORMAL_HEIGHT
  }

  const applyManualHeight = (height: number) => {
    const next = boundedDockHeight(height)
    setManualHeight(next)
    setDockState('normal')
    return next
  }

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (forceCollapsed) return
    resizeRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: currentDockHeight(),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    applyManualHeight(drag.startHeight + (drag.startY - event.clientY))
  }

  const finishResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    resizeRef.current = null
    const height = boundedDockHeight(currentDockHeight())
    setManualHeight(height)
    storeDockHeight(height)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const delta = event.key === 'ArrowUp' ? DOCK_KEYBOARD_STEP : -DOCK_KEYBOARD_STEP
    const height = applyManualHeight(currentDockHeight() + delta)
    storeDockHeight(height)
  }

  const manualStyle =
    !forceCollapsed && renderedState === 'normal' && manualHeight !== null
      ? { height: `${boundedDockHeight(manualHeight)}px` }
      : undefined

  return (
    <section
      ref={dockRef}
      className={`office-operations-dock dock-${renderedState}`}
      aria-label="Bottom Operations Dock"
      style={manualStyle}
    >
      <div className="office-dock-header">
        <div className="office-dock-title">
          <strong>Operations Dock</strong>
          <span>{modeLabel}</span>
          {planningThread && (
            <span className="office-dock-thread">
              thread {planningThread.id.slice(0, 8)}
            </span>
          )}
        </div>
        {!forceCollapsed && (
          <div className="office-dock-actions">
            {renderedState !== 'collapsed' && (
              <div
                className="office-dock-resize-handle"
                role="separator"
                aria-label="Resize Operations Dock"
                aria-orientation="horizontal"
                tabIndex={0}
                title="Drag up or down to resize the Operations Dock"
                onPointerDown={handleResizePointerDown}
                onPointerMove={handleResizePointerMove}
                onPointerUp={finishResize}
                onPointerCancel={finishResize}
                onKeyDown={handleResizeKeyDown}
              >
                <span aria-hidden="true">↕</span>
              </div>
            )}
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
        <section className="office-dock-panel" aria-label="Planning and activity">
          <div className="office-dock-panel-heading office-dock-tab-heading">
            <div className="office-dock-tabs" role="tablist" aria-label="Dock views">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  className={`office-dock-tab ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {TAB_LABELS[tab]}
                </button>
              ))}
            </div>
            {activeTab === 'activity' && (
              <span>
                {planningThread
                  ? `${planningEvents.length} planning events`
                  : `${events.length} canonical events`}
              </span>
            )}
          </div>
          <div className="office-dock-scroll" key={activeTab}>
            {activeTab === 'tasks' ? (
              <TaskList tasks={tasks} />
            ) : activeTab === 'activity' ? (
              planningThread ? (
                <PlanningActivity events={planningEvents} />
              ) : recent.length === 0 ? (
                <div className="office-dock-empty">
                  No canonical operational Event is available in this scope.
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
              )
            ) : activeTab === 'requirements' ? (
              <RequirementList
                requirements={planningRequirements}
                onApprove={onApproveRequirement}
                onReject={onRejectRequirement}
                onDefer={onDeferRequirement}
                busy={planningActionBusy}
              />
            ) : activeTab === 'questions' ? (
              <QuestionList
                questions={visiblePlanningArtifacts}
                onResolve={onResolvePlanningQuestion}
                busy={planningActionBusy}
              />
            ) : (
              <PlanningArtifactList artifacts={visiblePlanningArtifacts} />
            )}
          </div>
        </section>

        <section
          className="office-dock-panel"
          aria-label={planningTeam ? 'Planning team proposal' : 'Active team'}
        >
          <div className="office-dock-panel-heading">
            <span>{planningTeam ? 'Planning team' : 'Team'}</span>
            <span>
              {planningTeam
                ? `${planningTeam.members.filter((member) => member.disposition === 'INCLUDED').length} included`
                : `${agents.length} AgentRun${agents.length === 1 ? '' : 's'}`}
            </span>
          </div>
          <div className="office-dock-scroll">
            {planningTeam ? (
              <>
                <div className="office-planning-team-summary">
                  <p>{planningTeam.rationale_summary}</p>
                  <span>{planningTeam.status}</span>
                  {planningTeam.status === 'PROPOSED' && (
                    <div>
                      <button
                        type="button"
                        className="office-team-decision accept"
                        disabled={planningDecisionBusy}
                        onClick={() => void onAcceptPlanningTeam?.()}
                      >
                        Accept team
                      </button>
                      <button
                        type="button"
                        className="office-team-decision"
                        disabled={planningDecisionBusy}
                        onClick={() => void onRejectPlanningTeam?.()}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
                {planningTeam.members.map((member) => (
                  <article key={member.role_key} className="office-planning-member">
                    <span
                      className={`office-planning-member-dot disposition-${member.disposition.toLowerCase()}`}
                      aria-hidden="true"
                    />
                    <div>
                      <strong>
                        {profileByKey.get(member.role_key)?.name ?? member.role_key}
                      </strong>
                      <p>{member.reason}</p>
                    </div>
                    <span>{member.disposition}</span>
                  </article>
                ))}
              </>
            ) : agents.length === 0 ? (
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
