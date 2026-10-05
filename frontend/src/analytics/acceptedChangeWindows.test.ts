import { describe, expect, it } from 'vitest'

import type { ResultReview, Run, Task } from '../api'
import { windowedAcceptedMetrics } from './acceptedChangeWindows'

function task(id: string): Task {
  return {
    id,
    project_id: '11111111-1111-4111-8111-111111111111',
    title: `task ${id}`,
    objective: 'objective',
    constraints: null,
    requested_workflow_id: null,
    requested_executor_id: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  }
}

function run(id: string, taskId: string, completedAt: string, remediation = 0): Run {
  return {
    id,
    project_id: '11111111-1111-4111-8111-111111111111',
    task_id: taskId,
    status: 'COMPLETED',
    requested_executor_id: null,
    resolved_executor_id: null,
    workflow_snapshot_id: null,
    changed_areas: null,
    failure_code: null,
    failure_summary: null,
    started_at: '2026-09-20T00:00:00Z',
    completed_at: completedAt,
    cancel_requested_at: null,
    remediation_cycles_used: remediation,
    candidate_workspace_id: null,
    created_at: completedAt,
    updated_at: completedAt,
  }
}

function review(runId: string, deliveredAt: string | null, state: ResultReview['state'] = 'DELIVERED'): ResultReview {
  return {
    run_id: runId,
    task_id: `task-${runId}`,
    state,
    candidate_workspace_id: null,
    feedback: null,
    remediation_run_id: null,
    delivered_branch: `accepted/${runId}`,
    delivered_commit: `commit-${runId}`,
    changes_requested_at: null,
    approved_at: deliveredAt,
    delivered_at: deliveredAt,
    can_approve: false,
    can_request_changes: false,
  }
}

describe('windowedAcceptedMetrics', () => {
  it('buckets daily accepted counts and computes the prior-window delta', () => {
    const runs = [
      run('run-a', 'task-a', '2026-10-02T10:00:00Z', 1),
      run('run-b', 'task-b', '2026-08-20T10:00:00Z', 3),
    ]
    const reviews = [
      review('run-a', '2026-10-02T11:00:00Z'),
      review('run-b', '2026-08-20T12:00:00Z'),
    ]
    const tasks = [task('task-a'), task('task-b'), task('task-c')]

    const metrics = windowedAcceptedMetrics(
      runs,
      reviews,
      tasks,
      30,
      new Date('2026-10-03T12:00:00Z'),
    )

    expect(metrics.acceptedInWindow).toBe(1)
    expect(metrics.acceptedPrior).toBe(1)
    expect(metrics.delta).toBe(0)
    expect(metrics.series).toHaveLength(30)
    expect(metrics.series.reduce((sum, point) => sum + point.accepted, 0)).toBe(1)
    expect(metrics.acceptanceRate).toBe(100)
    expect(metrics.averageCompletionToDeliveryMinutes).toBe(60)
    expect(metrics.averageTimeToDecisionMinutes).toBe(60)
    expect(metrics.averageRemediationCycles).toBe(1)
    expect(metrics.boardPipeline.accepted).toBe(2)
    expect(metrics.boardPipeline.planning).toBe(1)
  })

  it('shares the board column projection for non-delivered states', () => {
    const runs = [run('run-a', 'task-a', '2026-10-02T10:00:00Z')]
    const reviews = [review('run-a', null, 'AWAITING_REVIEW')]

    const metrics = windowedAcceptedMetrics(runs, reviews, [task('task-a')], 7, new Date('2026-10-03T12:00:00Z'))

    expect(metrics.boardPipeline.needsYou).toBe(1)
    expect(metrics.boardPipeline.accepted).toBe(0)
    expect(metrics.acceptedInWindow).toBe(0)
  })

  it('renders null averages and a zero series when nothing is delivered', () => {
    const metrics = windowedAcceptedMetrics([], [], [task('task-a')], 7, new Date('2026-10-03T12:00:00Z'))

    expect(metrics.acceptedInWindow).toBe(0)
    expect(metrics.acceptedPrior).toBe(0)
    expect(metrics.delta).toBe(0)
    expect(metrics.series).toHaveLength(7)
    expect(metrics.acceptanceRate).toBeNull()
    expect(metrics.averageCompletionToDeliveryMinutes).toBeNull()
    expect(metrics.averageTimeToDecisionMinutes).toBeNull()
    expect(metrics.averageRemediationCycles).toBeNull()
  })

  it('ignores delivered reviews that precede technical completion', () => {
    const runs = [run('run-a', 'task-a', '2026-10-02T10:00:00Z')]
    const reviews = [review('run-a', '2026-10-02T09:00:00Z')]

    const metrics = windowedAcceptedMetrics(runs, reviews, [task('task-a')], 7, new Date('2026-10-03T12:00:00Z'))

    expect(metrics.acceptedInWindow).toBe(0)
    expect(metrics.averageTimeToDecisionMinutes).toBeNull()
  })

  it('keeps window boundaries stable at a day edge', () => {
    const runs = [run('run-a', 'task-a', '2026-10-02T23:30:00Z')]
    const reviews = [review('run-a', '2026-10-02T23:45:00Z')]

    const before = windowedAcceptedMetrics(runs, reviews, [], 7, new Date('2026-10-02T23:50:00Z'))
    const after = windowedAcceptedMetrics(runs, reviews, [], 7, new Date('2026-10-03T00:10:00Z'))

    expect(before.series.reduce((sum, point) => sum + point.accepted, 0)).toBe(1)
    expect(after.series.reduce((sum, point) => sum + point.accepted, 0)).toBe(1)
    expect(after.acceptedInWindow).toBe(1)
  })
})
