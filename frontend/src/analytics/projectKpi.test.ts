import { describe, expect, it } from 'vitest'

import type { Run, Task } from '../api'
import { projectKpiSnapshot } from './projectKpi'

const TASKS: Task[] = [
  {
    id: 'task-1',
    project_id: 'project-1',
    title: 'Delivered feature',
    objective: 'Ship feature',
    constraints: null,
    requested_workflow_id: null,
    requested_executor_id: null,
    created_at: '2026-10-01T08:00:00Z',
    updated_at: '2026-10-01T08:00:00Z',
  },
  {
    id: 'task-2',
    project_id: 'project-1',
    title: 'Retrying feature',
    objective: 'Fix issue',
    constraints: null,
    requested_workflow_id: null,
    requested_executor_id: null,
    created_at: '2026-10-01T09:00:00Z',
    updated_at: '2026-10-01T09:00:00Z',
  },
  {
    id: 'task-3',
    project_id: 'project-1',
    title: 'Queued work',
    objective: 'Wait for execution',
    constraints: null,
    requested_workflow_id: null,
    requested_executor_id: null,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
  },
]

function run(overrides: Partial<Run>): Run {
  return {
    id: 'run-default',
    project_id: 'project-1',
    task_id: 'task-1',
    status: 'CREATED',
    requested_executor_id: null,
    resolved_executor_id: null,
    workflow_snapshot_id: null,
    changed_areas: null,
    failure_code: null,
    failure_summary: null,
    started_at: null,
    completed_at: null,
    cancel_requested_at: null,
    remediation_cycles_used: 0,
    candidate_workspace_id: null,
    created_at: '2026-10-01T08:00:00Z',
    updated_at: '2026-10-01T08:00:00Z',
    ...overrides,
  }
}

describe('projectKpiSnapshot', () => {
  it('derives delivery, success, cycle time, retries, and remediation from canonical Task/Run facts', () => {
    const snapshot = projectKpiSnapshot(TASKS, [
      run({
        id: 'run-1',
        task_id: 'task-1',
        status: 'COMPLETED',
        started_at: '2026-10-01T08:00:00Z',
        completed_at: '2026-10-01T09:00:00Z',
        updated_at: '2026-10-01T09:00:00Z',
      }),
      run({
        id: 'run-2a',
        task_id: 'task-2',
        status: 'FAILED',
        started_at: '2026-10-01T09:00:00Z',
        completed_at: '2026-10-01T09:30:00Z',
        remediation_cycles_used: 1,
        updated_at: '2026-10-01T09:30:00Z',
      }),
      run({
        id: 'run-2b',
        task_id: 'task-2',
        status: 'RUNNING',
        started_at: '2026-10-01T10:00:00Z',
        remediation_cycles_used: 2,
        updated_at: '2026-10-01T10:30:00Z',
      }),
    ])

    expect(snapshot.totalTasks).toBe(3)
    expect(snapshot.tasksWithRuns).toBe(2)
    expect(snapshot.unstartedTasks).toBe(1)
    expect(snapshot.deliveredTasks).toBe(1)
    expect(snapshot.activeRuns).toBe(1)
    expect(snapshot.completedRuns).toBe(1)
    expect(snapshot.failedRuns).toBe(1)
    expect(snapshot.runSuccessRate).toBe(50)
    expect(snapshot.taskDeliveryRate).toBeCloseTo(100 / 3)
    expect(snapshot.averageCompletedCycleMinutes).toBe(60)
    expect(snapshot.totalRemediationCycles).toBe(3)
    expect(snapshot.tasksWithRetries).toBe(1)
    expect(snapshot.latestActivityAt).toBe('2026-10-01T10:30:00Z')
    expect(
      snapshot.taskRows.find((row) => row.taskId === 'task-2'),
    ).toEqual(
      expect.objectContaining({
        attempts: 2,
        latestRunId: 'run-2b',
        latestStatus: 'RUNNING',
      }),
    )
  })

  it('returns null percentages and durations instead of inventing metrics when no execution exists', () => {
    const snapshot = projectKpiSnapshot([], [])

    expect(snapshot.runSuccessRate).toBeNull()
    expect(snapshot.taskDeliveryRate).toBeNull()
    expect(snapshot.averageCompletedCycleMinutes).toBeNull()
    expect(snapshot.latestActivityAt).toBeNull()
  })
})
