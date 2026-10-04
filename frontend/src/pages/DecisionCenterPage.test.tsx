import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  ComposerThread,
  Project,
  RequirementCandidate,
  ResultReview,
  Run,
  Task,
  TeamProposal,
} from '../api'
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
  changes_requested_at: null,
  approved_at: null,
  delivered_at: null,
  can_approve: true,
  can_request_changes: true,
}

const THREAD: ComposerThread = {
  id: '55555555-5555-4555-8555-555555555555',
  project_id: PROJECT.id,
  requested_intent: 'AUTO',
  resolved_intent: 'PLAN',
  status: 'ACTIVE',
  title: 'Plan delivery',
  timezone: 'Asia/Jakarta',
  executor_id: null,
  workflow_id: null,
  created_at: '2026-10-03T04:00:00Z',
  updated_at: '2026-10-03T04:00:00Z',
  completed_at: null,
}

const REQUIREMENT: RequirementCandidate = {
  id: '66666666-6666-4666-8666-666666666666',
  thread_id: THREAD.id,
  project_id: PROJECT.id,
  title: 'Require verification evidence',
  problem: 'Delivery needs evidence.',
  requirement: 'Require recorded verification evidence before acceptance.',
  rationale: 'Keep acceptance factual.',
  acceptance_hint: null,
  source_roles: ['tech-lead'],
  status: 'PROPOSED',
  created_at: '2026-10-03T05:00:00Z',
  updated_at: '2026-10-03T05:00:00Z',
  approved_at: null,
  decided_at: null,
}

const TEAM: TeamProposal = {
  id: '77777777-7777-4777-8777-777777777777',
  thread_id: THREAD.id,
  phase: 'REVIEW',
  status: 'PROPOSED',
  rationale_summary: 'Add a reviewer for the verification gate.',
  created_at: '2026-10-03T05:30:00Z',
  decided_at: null,
  members: [],
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function installFetch({ planning = false }: { planning?: boolean } = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (url === '/api/projects') return Promise.resolve(response([PROJECT]))
      if (url === `/api/projects/${PROJECT.id}/tasks`) return Promise.resolve(response([TASK]))
      if (url === `/api/tasks/${TASK.id}/runs`) return Promise.resolve(response([RUN]))
      if (url === `/api/runs/${RUN.id}/result-review`) return Promise.resolve(response(REVIEW))
      if (url === `/api/runs/${RUN.id}/agents`) return Promise.resolve(response([]))
      if (url === `/api/projects/${PROJECT.id}/composer/threads`) {
        return Promise.resolve(response(planning ? [THREAD] : []))
      }
      if (url === `/api/composer/threads/${THREAD.id}/requirements`) {
        return Promise.resolve(response(planning ? [REQUIREMENT] : []))
      }
      if (url === `/api/composer/threads/${THREAD.id}/team-proposals`) {
        return Promise.resolve(response(planning ? [TEAM] : []))
      }
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
    expect(screen.getByText('0 AgentRuns')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open decision' })).toHaveAttribute(
      'href',
      `/tasks/${TASK.id}`,
    )
  })

  it('projects proposed requirements and teams into Approvals without inventing activity', async () => {
    installFetch({ planning: true })
    render(
      <Router initialPath="/inbox">
        <DecisionCenterPage mode="inbox" />
      </Router>,
    )

    expect(await screen.findByText('Require verification evidence')).toBeInTheDocument()
    expect(screen.getByText('Review team proposal')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Approvals' }))

    expect(screen.queryByText('Close delivery loop')).not.toBeInTheDocument()
    expect(screen.getByText('Require verification evidence')).toBeInTheDocument()
    expect(screen.getByText('Review team proposal')).toBeInTheDocument()
    expect(screen.queryByText(/mark all read/i)).not.toBeInTheDocument()
  })

  it('derives Needs you from canonical state and exposes read-only board filters', async () => {
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
    expect(board.querySelector('[draggable="true"]')).toBeNull()

    fireEvent.change(screen.getByLabelText('Filter board by status'), {
      target: { value: 'Accepted' },
    })
    expect(within(needsYou as HTMLElement).queryByText('Close delivery loop')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Filter board by status'), {
      target: { value: 'all' },
    })
    fireEvent.change(screen.getByPlaceholderText('Task, Run, project...'), {
      target: { value: 'no-match' },
    })
    expect(screen.getByText('0 tasks')).toBeInTheDocument()
  })
})
