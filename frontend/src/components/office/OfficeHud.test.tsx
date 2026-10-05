import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { AgentEvent, AgentRun, Executor, ResultReview } from '../../api'
import { Router } from '../../router/Router'
import { OfficeHud } from './OfficeHud'
import { OfficeFocusCard } from './OfficeFocusCard'
import { OFFICE_ZONE_NAVIGATOR } from '../../office3d/officeZones'

function hud(element: React.ReactNode) {
  return render(<Router initialPath="/runs/run-1/office">{element}</Router>)
}

function focusCard(element: React.ReactNode) {
  return render(<Router initialPath="/tasks/task-1">{element}</Router>)
}

function agent(id: string, status: string): AgentRun {
  return {
    id,
    run_id: 'run-1',
    project_id: 'project-1',
    stage_key: 'IMPLEMENTATION',
    agent_profile_key: 'backend-engineer',
    agent_profile_version: 1,
    executor_id: 'reference',
    access_mode: 'WRITE',
    status,
    attempt: 1,
    retry_of_agent_run_id: null,
    remediation_cycle: 0,
    review_verdict: null,
    workspace_id: null,
    result_outcome: null,
    result_summary: null,
    reason_code: null,
    reason_summary: null,
    failure_retryable: null,
    started_at: '2026-10-01T02:00:00Z',
    completed_at: null,
    created_at: '2026-10-01T02:00:00Z',
    updated_at: '2026-10-01T02:00:00Z',
  }
}

function event(id: string, redacted: string[] = []): AgentEvent {
  return {
    id,
    event_type: 'agent.started',
    project_id: 'project-1',
    run_id: 'run-1',
    agent_run_id: 'agent-1',
    source: 'backend-engineer',
    occurred_at: '2026-10-01T02:01:00Z',
    recorded_at: '2026-10-01T02:01:00Z',
    payload: { summary: 'Agent started' },
    redacted_keys: redacted,
  }
}

const EXECUTOR: Executor = {
  id: 'reference',
  kind: 'reference',
  name: 'Reference',
  status: 'AVAILABLE',
  runtime_version: null,
  health_summary: 'Available.',
  last_check: '2026-10-01T02:00:00Z',
  capabilities: [],
  security_limitations: [],
}

const REVIEW: ResultReview = {
  run_id: 'run-1',
  task_id: 'task-1',
  state: 'DELIVERED',
  candidate_workspace_id: null,
  feedback: null,
  remediation_run_id: null,
  delivered_branch: 'agent-office/accepted/task',
  delivered_commit: '0123456789abcdef',
  changes_requested_at: null,
  approved_at: null,
  delivered_at: '2026-10-01T03:00:00Z',
  can_approve: false,
  can_request_changes: false,
}

describe('OfficeHud U7', () => {
  it('exposes eight zone navigator entries without a Design zone', () => {
    expect(OFFICE_ZONE_NAVIGATOR).toHaveLength(8)
    expect(OFFICE_ZONE_NAVIGATOR.map((entry) => entry.label)).not.toContain('Design')
  })

  it('renders honest AgentRun counts and redacted activity without fake idle counts', () => {
    hud(
      <OfficeHud
        agents={[agent('agent-1', 'RUNNING'), agent('agent-2', 'WAITING')]}
        events={[event('event-1', ['secret_token'])]}
        executors={[EXECUTOR]}
        review={REVIEW}
        reviewAvailable
        taskId="task-1"
        runId="run-1"
      />,
    )

    expect(screen.getByText('1 running')).toBeInTheDocument()
    expect(screen.getByText('1 waiting')).toBeInTheDocument()
    expect(screen.queryByText(/idle/i)).not.toBeInTheDocument()
    expect(screen.getByText('1 field redacted')).toBeInTheDocument()
    expect(screen.getByText(/1 of 1 executors available/)).toBeInTheDocument()
    expect(screen.getByText(/Delivered/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Task' })).toHaveAttribute(
      'href',
      '/tasks/task-1',
    )
  })

  it('renders unavailable states honestly instead of fake values', () => {
    hud(
      <OfficeHud
        agents={[]}
        events={[]}
        executors={[]}
        review={null}
        reviewAvailable={false}
        taskId={null}
        runId={null}
      />,
    )

    expect(screen.getByText('No AgentRun in this scope.')).toBeInTheDocument()
    expect(screen.getByText('No canonical Event in this scope.')).toBeInTheDocument()
    expect(screen.getByText('Executor health unavailable.')).toBeInTheDocument()
    expect(screen.getByText('Delivery status unavailable.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open Task' })).not.toBeInTheDocument()
  })
})

describe('OfficeFocusCard U7', () => {
  it('renders N of M stages without percentage', () => {
    focusCard(
      <OfficeFocusCard
        taskId="task-1"
        taskTitle="Close delivery loop"
        run={{ id: 'run-1', status: 'RUNNING' } as never}
        stages={[
          { stage_key: 'a', status: 'COMPLETED' } as never,
          { stage_key: 'b', status: 'RUNNING' } as never,
          { stage_key: 'c', status: 'PENDING' } as never,
        ]}
        agent={agent('agent-1', 'RUNNING')}
        agentProfileName="Backend Engineer"
      />,
    )

    expect(screen.getByText('1 of 3 stages')).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Task' })).toHaveAttribute(
      'href',
      '/tasks/task-1',
    )
  })
})
