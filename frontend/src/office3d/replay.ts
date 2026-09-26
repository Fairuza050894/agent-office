import type { AgentEvent, AgentRun } from '../api'

const REPLAY_LEAD_IN_MS = 500
const REPLAY_MIN_MS = 10_000
const REPLAY_MAX_MS = 18_000

export interface OfficeReplayRange {
  factualStart: number
  factualEnd: number
  factualSpan: number
  playbackSpan: number
  leadIn: number
}

export interface OfficeReplayEvent {
  at: number
  factualAt: number
  type: 'start' | 'finish'
  agentId: string
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function officeReplayRange(
  agents: AgentRun[],
  events: AgentEvent[],
): OfficeReplayRange | null {
  const times: number[] = []

  agents.forEach((agent) => {
    const started = parseTime(agent.started_at)
    const completed = parseTime(agent.completed_at)
    if (started !== null) times.push(started)
    if (completed !== null) times.push(completed)
  })

  events.forEach((event) => {
    const occurred = parseTime(event.occurred_at)
    if (occurred !== null) times.push(occurred)
  })

  if (times.length === 0) return null

  const factualStart = Math.min(...times)
  const factualEnd = Math.max(...times)
  const factualSpan = Math.max(1, factualEnd - factualStart)
  const playbackSpan = Math.min(
    REPLAY_MAX_MS,
    Math.max(REPLAY_MIN_MS, factualSpan / 3),
  )

  return {
    factualStart,
    factualEnd,
    factualSpan,
    playbackSpan,
    leadIn: REPLAY_LEAD_IN_MS,
  }
}

export function officeReplayPlan(
  agents: AgentRun[],
  range: OfficeReplayRange | null,
): OfficeReplayEvent[] {
  if (!range) return []

  const scale = range.playbackSpan / range.factualSpan
  const plan: OfficeReplayEvent[] = []

  agents.forEach((agent) => {
    const started = parseTime(agent.started_at)
    const completed = parseTime(agent.completed_at)

    if (started !== null) {
      plan.push({
        at: range.leadIn + (started - range.factualStart) * scale,
        factualAt: started,
        type: 'start',
        agentId: agent.id,
      })
    }

    if (completed !== null) {
      plan.push({
        at: range.leadIn + (completed - range.factualStart) * scale,
        factualAt: completed,
        type: 'finish',
        agentId: agent.id,
      })
    }
  })

  return plan.sort(
    (left, right) =>
      left.at - right.at ||
      left.agentId.localeCompare(right.agentId) ||
      left.type.localeCompare(right.type),
  )
}

export function officeReplayFactualCutoff(
  range: OfficeReplayRange | null,
  elapsed: number | null,
): number | null {
  if (!range || elapsed === null) return null
  if (elapsed < range.leadIn) return range.factualStart - 1

  const progress = Math.min(
    1,
    Math.max(0, (elapsed - range.leadIn) / range.playbackSpan),
  )
  return range.factualStart + range.factualSpan * progress
}

export function officeReplayDuration(range: OfficeReplayRange | null): number {
  if (!range) return 0
  return range.leadIn + range.playbackSpan
}
