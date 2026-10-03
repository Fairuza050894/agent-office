import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Project, ResultReview, Run, Task } from '../api'
import { Router } from '../router/Router'
import { DecisionCenterPage } from './DecisionCenterPage'

const PROJECT: Project = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Agent Office',
  repository: { name: 'agent-office' },
  default_branch: 'main',
  preferred_executor_id: null,
  default_workflow_id: null,
  status: 'ACTIVE',
  created_at: '2026-10-03T00:00:00Z',
  updated_at: '2026-10-03T00:00:00Z',
  archived_at: null,
}

const TASK: Task = {
  id: '22222222-2222-4222-8222-222222222222',
  project_id: PROJECT.id,
  title: 'Close delivery loop',
  objective: 'Require human acceptance before delivery.',
  constraints: null,
  requested_workflow_id: null,
  requested_executor_id: null,
  created_at: '2026-10-03T01:00:00Z',
  updated_at: '2026-10-03T01:00:00Z',
}

const RUN: Run = {
  id: '33333333-3333-4333-8333-333333333333',
  project_id: PROJECT.id,
  task_id: TASK.id,
  status: 'COMPLETED',
  requested_executor_id: null,
  resolved_executor_id: null,
  workflow_snapshot_id: null,
  changed_areas: null,
  failure_code: null,
  failure_summary: null,
  started_at: '2026-10-03T02:00:00Z',
  completed_at: '2026-10-03T03:00:00Z',
  cancel_requested_at: null,
  remediation_cycles_used: 0,
  candidate_workspace_id: '44444444-4444-4444-8444-444444444444',
  created_at: '2026-10-03T02:00:00Z',
  updated_at: '2026-10-03T03:00:00Z',
}

const REVIEW: ResultReview = {
  run_id: RUN.id,
  task_id: TASK.id,
  state: 'AWAITING_REVIEW',
  candidate_workspace_id: RUN.candidate_workspace_id,
  feedback: null,
  remediation_run_id: null,
  delivered_branch: null,
  delivered_commit: null,
  can_approve: true,
  can_request_changes: true,
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function installFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url === '/api/projects') return Promise.resolve(response([PROJECT]))
      if (url === `/api/projects/${PROJECT.id}/tasks`) return Promise.resolve(response([TASK]))
      if (url === `/api/tasks/${TASK.id}/runs`) return Promise.resolve(response([RUN]))
      if (url === `/api/runs/${RUN.id}/result-review`) return Promise.resolve(response(REVIEW))
      throw new Error(`Unexpected request: ${url}`)
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('DecisionCenterPage', () => {
  it('puts a technically completed result awaiting acceptance in the human Inbox', async () => {
    installFetch()
    render(
      <Router initialPath="/inbox">
        <DecisionCenterPage mode="inbox" />
      </Router>,
    )

    expect(await screen.findByText('Close delivery loop')).toBeInTheDocument()
    expect(screen.getByText('Review and accept the completed result')).toBeInTheDocument()
    expect(screen.getByText('Needs you')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Task decision' })).toHaveAttribute(
      'href',
      `/tasks/${TASK.id}`,
    )
  })

  it('derives Needs you from canonical state and does not expose drag controls', async () => {
    installFetch()
    render(
      <Router initialPath="/board">
        <DecisionCenterPage mode="board" />
      </Router>,
    )

    const board = await screen.findByLabelText('Canonical Task board')
    const needsYou = within(board)
      .getByRole('heading', { name: 'Needs you' })
      .closest('section')
    expect(needsYou).not.toBeNull()
    expect(within(needsYou as HTMLElement).getByText('Close delivery loop')).toBeInTheDocument()
    expect(screen.queryByText(/drag/i)).toBeInTheDocument()
    expect(board.querySelector('[draggable="true"]')).toBeNull()
  })
})
