import { describe, expect, it } from 'vitest'

import type { ResultReview, Run } from '../api'
import { acceptedChangeMetrics, type ResultReviewWithDecisionTimes } from './acceptedChangeKpi'

function run(id: string, completedAt: string): Run {
  return {
    id,
    project_id: '11111111-1111-4111-8111-111111111111',
    task_id: `task-${id}`,
    status: 'COMPLETED',
    requested_executor_id: null,
    resolved_executor_id: null,
    workflow_snapshot_id: null,
    changed_areas: null,
    failure_code: null,
    failure_summary: null,
    started_at: '2026-10-01T00:00:00Z',
    completed_at: completedAt,
    cancel_requested_at: null,
    remediation_cycles_used: 0,
    candidate_workspace_id: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: completedAt,
  }
}

function review(
  runId: string,
  state: ResultReview['state'],
  deliveredAt: string | null,
): ResultReviewWithDecisionTimes {
  return {
    run_id: runId,
    task_id: `task-${runId}`,
    state,
    candidate_workspace_id: null,
    feedback: null,
    remediation_run_id: null,
    delivered_branch: state === 'DELIVERED' ? `accepted/${runId}` : null,
    delivered_commit: state === 'DELIVERED' ? `commit-${runId}` : null,
    delivered_at: deliveredAt,
    can_approve: state === 'AWAITING_REVIEW',
    can_request_changes: state === 'AWAITING_REVIEW',
  }
}

describe('acceptedChangeMetrics', () => {
  it('counts human-delivered changes rather than technical completions', () => {
    const runs = [
      run('run-a', '2026-10-02T00:00:00Z'),
      run('run-b', '2026-10-02T01:00:00Z'),
    ]
    const reviews = [
      review('run-a', 'DELIVERED', '2026-10-02T00:30:00Z'),
      review('run-b', 'AWAITING_REVIEW', null),
    ]

    const metrics = acceptedChangeMetrics(runs, reviews, new Date('2026-10-03T00:00:00Z'))

    expect(metrics.acceptedChanges).toBe(1)
    expect(metrics.acceptedChangesLast7Days).toBe(1)
    expect(metrics.acceptanceRate).toBe(50)
    expect(metrics.averageAcceptanceMinutes).toBe(30)
  })

  it('does not invent delivery timing when timestamps are missing', () => {
    const metrics = acceptedChangeMetrics(
      [run('run-a', '2026-10-02T00:00:00Z')],
      [review('run-a', 'DELIVERED', null)],
      new Date('2026-10-03T00:00:00Z'),
    )

    expect(metrics.acceptedChanges).toBe(1)
    expect(metrics.acceptedChangesLast7Days).toBe(0)
    expect(metrics.averageAcceptanceMinutes).toBeNull()
  })
})
