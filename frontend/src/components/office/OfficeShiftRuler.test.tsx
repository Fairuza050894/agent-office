import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Run, Task } from '../../api'
import type { OfficeWorkAssignment } from '../../office3d/livingOffice'
import { OfficeShiftRuler } from './OfficeShiftRuler'

const tasks: Task[] = [
  {
    id: 'task-1',
    project_id: 'project-1',
    title: 'Room combination',
    objective: 'Combine room booking.',
    constraints: null,
    requested_workflow_id: null,
    requested_executor_id: null,
    created_at: '2026-10-01T09:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
  },
  {
    id: 'task-2',
    project_id: 'project-1',
    title: 'Landing templates',
    objective: 'Create templates.',
    constraints: null,
    requested_workflow_id: null,
    requested_executor_id: null,
    created_at: '2026-10-01T08:00:00Z',
    updated_at: '2026-10-01T08:00:00Z',
  },
]

const runs: Run[] = [
  {
    id: 'run-12345678',
    project_id: 'project-1',
    task_id: 'task-1',
    status: 'PLANNING',
    requested_executor_id: null,
    resolved_executor_id: null,
    workflow_snapshot_id: 'snapshot-1',
    changed_areas: [],
    failure_code: null,
    failure_summary: null,
    started_at: '2026-10-01T09:30:00Z',
    completed_at: null,
    cancel_requested_at: null,
    remediation_cycles_used: 0,
    candidate_workspace_id: null,
    created_at: '2026-10-01T09:25:00Z',
    updated_at: '2026-10-01T10:20:00Z',
  },
]

const assignments: OfficeWorkAssignment[] = [
  {
    taskId: 'task-1',
    taskTitle: 'Room combination',
    runId: 'run-12345678',
    runStatus: 'PLANNING',
    agentRunId: 'agent-1',
    agentRunStatus: 'WAITING',
    agentProfileKey: 'explorer',
    stageKey: 'DISCOVERY',
    startedAt: '2026-10-01T09:31:00Z',
    updatedAt: '2026-10-01T10:20:00Z',
  },
]

describe('OfficeShiftRuler', () => {
  it('renders canonical run windows and current assignment state without inventing stage history', () => {
    render(
      <OfficeShiftRuler
        tasks={tasks}
        runs={runs}
        assignments={assignments}
        timeZone="UTC"
        now={new Date('2026-10-01T10:30:00Z')}
      />,
    )

    expect(
      screen.getByRole('region', { name: 'Office shift ruler' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Room combination')).toHaveLength(2)
    expect(screen.getAllByText('Landing templates')).toHaveLength(2)
    expect(screen.getByText(/Run run-1234 · DISCOVERY/)).toBeInTheDocument()
    expect(screen.getAllByText('Waiting').length).toBeGreaterThan(0)
    expect(screen.getByText('No Run yet')).toBeInTheDocument()
    expect(screen.getByText(/1 active Run$/)).toBeInTheDocument()
  })
})
