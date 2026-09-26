import { describe, expect, it } from 'vitest'

import type { AgentEvent, AgentRun } from '../api'
import {
  officeReplayFactualCutoff,
  officeReplayPlan,
  officeReplayRange,
} from './replay'

const AGENT = {
  id: 'agent-1',
  started_at: '2026-09-26T03:00:00Z',
  completed_at: '2026-09-26T03:00:30Z',
} as AgentRun

const EVENT = {
  id: 'event-1',
  occurred_at: '2026-09-26T03:00:15Z',
} as AgentEvent

describe('office replay timing', () => {
  it('uses one factual clock for character transitions and canonical events', () => {
    const range = officeReplayRange([AGENT], [EVENT])
    const plan = officeReplayPlan([AGENT], range)

    expect(range).not.toBeNull()
    expect(plan).toHaveLength(2)
    expect(plan[0].type).toBe('start')
    expect(plan[1].type).toBe('finish')

    const halfwayElapsed = range!.leadIn + range!.playbackSpan / 2
    const cutoff = officeReplayFactualCutoff(range, halfwayElapsed)

    expect(cutoff).toBe(Date.parse(EVENT.occurred_at))
  })

  it('shows no replay signal before the factual timeline starts', () => {
    const range = officeReplayRange([AGENT], [EVENT])
    const cutoff = officeReplayFactualCutoff(range, 0)

    expect(cutoff).toBeLessThan(Date.parse(AGENT.started_at!))
  })
})
