import { useMemo, useState } from 'react'

import type {
  AgentEvent,
  AgentProfile,
  AgentRun,
  Executor,
  RunStage,
  Workspace,
} from '../api'
import { officeAgentState, officeLatestAgentEvent } from '../officeProjection'

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

interface StageProjection {
  key: string
  status: string
  orderHint: number
  stateAvailable: boolean
  agents: AgentRun[]
}

interface StageLayout extends StageProjection {
  x: number
  y: number
  width: number
  height: number
}

interface Point {
  x: number
  y: number
}

const CANVAS_WIDTH = 1080
const STAGE_WIDTH = 272
const STAGE_HEIGHT = 170
const COLUMNS = 3
const COLUMN_GAP = 55
const ROW_GAP = 90
const BASE_X = 58
const BASE_Y = 62

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

function layoutStages(stages: StageProjection[]): StageLayout[] {
  return stages.map((stage, index) => {
    const column = index % COLUMNS
    const row = Math.floor(index / COLUMNS)
    const rowOffset = row % 2 === 0 ? 0 : 42

    return {
      ...stage,
      x: BASE_X + column * (STAGE_WIDTH + COLUMN_GAP) + rowOffset,
      y: BASE_Y + row * (STAGE_HEIGHT + ROW_GAP),
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
    }
  })
}

function floorPoints(stage: StageLayout): string {
  const { x, y, width, height } = stage
  return [
    `${x},${y + 42}`,
    `${x + width - 70},${y}`,
    `${x + width},${y + 62}`,
    `${x + 70},${y + height - 18}`,
  ].join(' ')
}

function floorExtrusionPoints(stage: StageLayout): string {
  const { x, y, width, height } = stage
  return [
    `${x + 70},${y + height - 18}`,
    `${x + width},${y + 62}`,
    `${x + width},${y + 78}`,
    `${x + 70},${y + height - 2}`,
  ].join(' ')
}

function stageCenter(stage: StageLayout): Point {
  return {
    x: stage.x + stage.width / 2,
    y: stage.y + stage.height / 2,
  }
}

function agentPoint(stage: StageLayout, index: number, count: number): Point {
  const slots: Point[] =
    count <= 1
      ? [{ x: 0.52, y: 0.48 }]
      : count === 2
        ? [
            { x: 0.38, y: 0.42 },
            { x: 0.65, y: 0.58 },
          ]
        : [
            { x: 0.31, y: 0.4 },
            { x: 0.58, y: 0.34 },
            { x: 0.68, y: 0.63 },
            { x: 0.42, y: 0.67 },
          ]

  const slot = slots[index % slots.length]
  return {
    x: stage.x + stage.width * slot.x,
    y: stage.y + stage.height * slot.y,
  }
}

function canvasHeight(stageCount: number): number {
  const rows = Math.max(1, Math.ceil(stageCount / COLUMNS))
  return BASE_Y + rows * STAGE_HEIGHT + Math.max(0, rows - 1) * ROW_GAP + 70
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
  const [zoom, setZoom] = useState(1)

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
  const stageLayouts = useMemo(
    () => layoutStages(projectedStages),
    [projectedStages],
  )
  const mapHeight = canvasHeight(stageLayouts.length)

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
      <div className="office-map-heading">
        <div>
          <strong>Execution floor</strong>
          <span>RunStage → room · AgentRun → workstation</span>
        </div>
        <div className="office-map-controls" aria-label="Office map zoom">
          <button
            type="button"
            className="office-map-control"
            aria-label="Zoom out"
            disabled={zoom <= 0.75}
            onClick={() => setZoom((current) => Math.max(0.75, current - 0.125))}
          >
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="office-map-control"
            aria-label="Zoom in"
            disabled={zoom >= 1.25}
            onClick={() => setZoom((current) => Math.min(1.25, current + 0.125))}
          >
            +
          </button>
          <button
            type="button"
            className="office-map-control office-map-fit"
            onClick={() => setZoom(1)}
          >
            Fit
          </button>
        </div>
      </div>

      <div className="office-map-viewport">
        {stageLayouts.length === 0 ? (
          <div className="office-no-stages">
            <strong>No stage state is currently persisted.</strong>
            <span>
              Office View will not invent rooms or workers without RunStage and
              AgentRun truth.
            </span>
          </div>
        ) : (
          <div
            className="office-map-scale"
            style={{
              width: CANVAS_WIDTH * zoom,
              height: mapHeight * zoom,
            }}
          >
            <div
              className="office-map-canvas"
              style={{
                width: CANVAS_WIDTH,
                height: mapHeight,
                transform: `scale(${zoom})`,
              }}
            >
              <svg
                className="office-floor-svg"
                viewBox={`0 0 ${CANVAS_WIDTH} ${mapHeight}`}
                role="presentation"
                aria-hidden="true"
              >
                <defs>
                  <pattern
                    id="office-grid"
                    width="22"
                    height="22"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 22 0 L 0 0 0 22"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="0.6"
                    />
                  </pattern>
                  <marker
                    id="office-flow-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M0,0 L8,4 L0,8 Z" className="office-flow-arrow" />
                  </marker>
                </defs>

                <rect
                  x="0"
                  y="0"
                  width={CANVAS_WIDTH}
                  height={mapHeight}
                  className="office-map-grid"
                />

                {stageLayouts.slice(0, -1).map((stage, index) => {
                  const from = stageCenter(stage)
                  const to = stageCenter(stageLayouts[index + 1])
                  return (
                    <path
                      key={`flow-${stage.key}`}
                      d={`M ${from.x + 54} ${from.y + 26} C ${from.x + 95} ${from.y + 26}, ${to.x - 95} ${to.y - 24}, ${to.x - 54} ${to.y - 24}`}
                      className="office-stage-flow"
                      markerEnd="url(#office-flow-arrow)"
                    />
                  )
                })}

                {stageLayouts.map((stage) => (
                  <g key={stage.key} className={`office-room room-${stage.status.toLowerCase()}`}>
                    <polygon
                      points={floorExtrusionPoints(stage)}
                      className="office-room-extrusion"
                    />
                    <polygon points={floorPoints(stage)} className="office-room-floor" />
                    <polyline
                      points={`${stage.x},${stage.y + 42} ${stage.x + stage.width - 70},${stage.y} ${stage.x + stage.width},${stage.y + 62}`}
                      className="office-room-backline"
                    />
                    <line
                      x1={stage.x + 20}
                      y1={stage.y + 46}
                      x2={stage.x + 20}
                      y2={stage.y + 91}
                      className="office-room-post"
                    />
                    <line
                      x1={stage.x + stage.width - 17}
                      y1={stage.y + 57}
                      x2={stage.x + stage.width - 17}
                      y2={stage.y + 102}
                      className="office-room-post"
                    />
                  </g>
                ))}
              </svg>

              {stageLayouts.map((stage, stageIndex) => (
                <div key={stage.key}>
                  <div
                    className="office-stage-label"
                    style={{
                      left: stage.x + 12,
                      top: stage.y + stage.height - 4,
                    }}
                  >
                    <span>
                      {stage.orderHint < 10_000
                        ? `0${stageIndex + 1}`.slice(-2)
                        : '—'}
                    </span>
                    <div>
                      <strong>{stage.key}</strong>
                      <small
                        className={`stage-status-text stage-${stage.status.toLowerCase()}`}
                      >
                        {stage.stateAvailable ? stage.status : 'STATE UNAVAILABLE'}
                      </small>
                    </div>
                  </div>

                  {stage.agents.length === 0 ? (
                    <div
                      className="office-stage-empty"
                      style={{
                        left: stage.x + 82,
                        top: stage.y + 67,
                      }}
                    >
                      No AgentRuns instantiated in this stage.
                    </div>
                  ) : (
                    stage.agents.map((agent, agentIndex) => {
                      const state = officeAgentState(agent.status)
                      const name = profileName(agent, profileByKey)
                      const latestEvent = officeLatestAgentEvent(agent.id, events)
                      const executor = executorById.get(agent.executor_id)
                      const workspace = agent.workspace_id
                        ? workspaceById.get(agent.workspace_id)
                        : undefined
                      const point = agentPoint(
                        stage,
                        agentIndex,
                        stage.agents.length,
                      )

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
                          style={{
                            left: point.x,
                            top: point.y,
                          }}
                          aria-label={`${name}, ${state.label}`}
                          aria-pressed={selectedAgentId === agent.id}
                          onClick={() => onSelectAgent(agent.id)}
                        >
                          <span className="office-agent-node" aria-hidden="true">
                            <span className="office-agent-desk">
                              <span className="office-agent-monitor">
                                <span className="office-agent-screen" />
                              </span>
                            </span>
                            <span className="office-agent-avatar">
                              {initials(name)}
                            </span>
                            <span className="office-agent-status-dot" />
                          </span>
                          <span className="office-agent-name">{name}</span>
                          <span className="office-agent-state">{state.label}</span>
                          <span className="office-agent-runtime">
                            {executor?.name ?? agent.executor_id.slice(0, 8)}
                            {workspace ? ` · ${workspace.kind}` : ''}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
              ))}
            </div>
          </div>
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
