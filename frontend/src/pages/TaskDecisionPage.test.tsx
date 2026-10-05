import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  AgentRun,
  Evidence,
  Project,
  ResultReview,
  Run,
  Task,
  VerificationStatus,
  WorkflowSnapshot,
  Workspace,
  WorkspaceStatusResponse,
} from '../api'
import { Router } from '../router/Router'
import { TaskDecisionPage } from './TaskDecisionPage'

const PROJECT: Project = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Agent Office',
  repository: { name: 'agent-office' },
  default_branch: 'main',
  preferred_executor_id: null,
  default_workflow_id: null,
  status: 'ACTIVE',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
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
  created_at: '2026-10-01T01:00:00Z',
  updated_at: '2026-10-01T01:00:00Z',
}

const RUN: Run = {
  id: '33333333-3333-4333-8333-333333333333',
  project_id: PROJECT.id,
  task_id: TASK.id,
  status: 'COMPLETED',
  requested_executor_id: null,
  resolved_executor_id: null,
  workflow_snapshot_id: '88888888-8888-4888-8888-888888888888',
  changed_areas: null,
  failure_code: null,
  failure_summary: null,
  started_at: '2026-10-01T02:00:00Z',
  completed_at: '2026-10-01T03:00:00Z',
  cancel_requested_at: null,
  remediation_cycles_used: 0,
  candidate_workspace_id: '44444444-4444-4444-8444-444444444444',
  created_at: '2026-10-01T02:00:00Z',
  updated_at: '2026-10-01T03:00:00Z',
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

const AGENT: AgentRun = {
  id: '99999999-9999-4999-8999-999999999999',
  run_id: RUN.id,
  project_id: PROJECT.id,
  stage_key: 'IMPLEMENTATION',
  agent_profile_key: 'backend-developer',
  agent_profile_version: 1,
  executor_id: '00000000-0000-4000-8000-000000000001',
  access_mode: 'WRITE',
  status: 'COMPLETED',
  attempt: 1,
  retry_of_agent_run_id: null,
  remediation_cycle: 0,
  review_verdict: null,
  workspace_id: RUN.candidate_workspace_id,
  result_outcome: null,
  result_summary: null,
  reason_code: null,
  reason_summary: null,
  failure_retryable: null,
  started_at: '2026-10-01T02:00:00Z',
  completed_at: '2026-10-01T02:30:00Z',
  created_at: '2026-10-01T02:00:00Z',
  updated_at: '2026-10-01T02:30:00Z',
}

const SNAPSHOT: WorkflowSnapshot = {
  id: RUN.workflow_snapshot_id!,
  run_id: RUN.id,
  project_id: PROJECT.id,
  source_workflow_id: null,
  source_workflow_key: 'enterprise-engineering',
  source_workflow_version: 1,
  schema_version: 1,
  stages: [],
  agent_assignments: [
    {
      stage_key: 'IMPLEMENTATION',
      profile_id: '99999999-9999-4999-8999-999999999999',
      profile_key: 'backend-developer',
      profile_name: 'Backend Developer',
      profile_version: 1,
      access_mode: 'WRITE',
      required: true,
    },
  ],
  created_at: '2026-10-01T02:00:00Z',
}

const WORKSPACE: Workspace = {
  id: RUN.candidate_workspace_id!,
  project_id: PROJECT.id,
  run_id: RUN.id,
  owner_agent_run_id: AGENT.id,
  kind: 'GIT_WORKTREE',
  access_mode: 'WRITE',
  status: 'READY',
  base_revision: 'abc123def456',
  git_branch: 'ao/run-work',
  reason_code: null,
  reason_summary: null,
  writable: true,
  created_at: '2026-10-01T02:00:00Z',
  updated_at: '2026-10-01T02:01:00Z',
  released_at: null,
}

const WORKSPACE_STATUS: WorkspaceStatusResponse = {
  workspace: WORKSPACE,
  change_summary: {
    base_revision: 'abc123def456',
    current_revision: 'def456abc123',
    files_changed: 2,
    insertions: 12,
    deletions: 3,
    added_paths: ['backend/new.py'],
    modified_paths: ['backend/existing.py'],
    deleted_paths: [],
    untracked_paths: [],
  },
}

const EVIDENCE: Evidence = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  project_id: PROJECT.id,
  task_id: TASK.id,
  run_id: RUN.id,
  agent_run_id: AGENT.id,
  kind: 'TEST_RESULT',
  status: 'AVAILABLE',
  summary: 'TEST check backend-tests: the command exited 0.',
  metadata: {
    check_key: 'backend-tests',
    check_type: 'TEST',
    command_status: 'PASSED',
    exit_code: '0',
    duration_ms: '1500',
  },
  schema_version: 1,
  created_at: '2026-10-01T02:45:00Z',
}

const VERIFICATION: VerificationStatus = {
  run_id: RUN.id,
  checked: true,
  evidence_count: 1,
  checks: [
    {
      check_key: 'backend-tests',
      check_type: 'TEST',
      required: true,
      command_status: 'PASSED',
      evidence_id: EVIDENCE.id,
      satisfied: true,
    },
  ],
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function installFetch(review: ResultReview = REVIEW): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      const method = init?.method?.toUpperCase() ?? 'GET'
      if (method === 'GET' && url === `/api/tasks/${TASK.id}`) return Promise.resolve(response(TASK))
      if (method === 'GET' && url === `/api/projects/${PROJECT.id}`) {
        return Promise.resolve(response(PROJECT))
      }
      if (method === 'GET' && url === `/api/tasks/${TASK.id}/runs`) {
        return Promise.resolve(response([RUN]))
      }
      if (method === 'GET' && url === `/api/runs/${RUN.id}/result-review`) {
        return Promise.resolve(response(review))
      }
      if (method === 'GET' && url === `/api/runs/${RUN.id}/verification`) {
        return Promise.resolve(response(VERIFICATION))
      }
      if (method === 'GET' && url === `/api/runs/${RUN.id}/evidence`) {
        return Promise.resolve(response([EVIDENCE]))
      }
      if (method === 'GET' && url === `/api/runs/${RUN.id}/findings`) {
        return Promise.resolve(response({ run_id: RUN.id, findings: [], open_blockers: 0 }))
      }
      if (method === 'GET' && url === `/api/runs/${RUN.id}/events`) {
        return Promise.resolve(response({ events: [], next_cursor: null }))
      }
      if (method === 'GET' && url === `/api/runs/${RUN.id}/agents`) {
        return Promise.resolve(response([AGENT]))
      }
      if (method === 'GET' && url === `/api/runs/${RUN.id}/workspaces`) {
        return Promise.resolve(response([WORKSPACE]))
      }
      if (method === 'GET' && url === `/api/workspaces/${WORKSPACE.id}/status`) {
        return Promise.resolve(response(WORKSPACE_STATUS))
      }
      if (method === 'GET' && url === `/api/runs/${RUN.id}/snapshot`) {
        return Promise.resolve(response(SNAPSHOT))
      }
      if (
        method === 'POST' &&
        url === `/api/runs/${RUN.id}/result-review/approve-and-deliver`
      ) {
        return Promise.resolve(response({ ...review, state: 'DELIVERED' }))
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('TaskDecisionPage U2', () => {
  it('moves Request changes / Approve result to the header gated by can_* flags', async () => {
    installFetch()
    render(
      <Router initialPath={`/tasks/${TASK.id}`}>
        <TaskDecisionPage taskId={TASK.id} />
      </Router>,
    )

    const header = await screen.findByRole('group', { name: 'Result decision' })
    expect(within(header).getByRole('button', { name: 'Approve result' })).toBeInTheDocument()
    expect(within(header).getByRole('button', { name: 'Request changes' })).toBeInTheDocument()
  })

  it('shows a disabled reason when approval is unavailable', async () => {
    installFetch({ ...REVIEW, state: 'DELIVERED', can_approve: false, can_request_changes: false })
    render(
      <Router initialPath={`/tasks/${TASK.id}`}>
        <TaskDecisionPage taskId={TASK.id} />
      </Router>,
    )

    expect(await screen.findByText('Already accepted and delivered. No further approval.')).toBeInTheDocument()
  })

  it('renders the Task summary card from canonical facts', async () => {
    installFetch()
    render(
      <Router initialPath={`/tasks/${TASK.id}`}>
        <TaskDecisionPage taskId={TASK.id} />
      </Router>,
    )

    expect(await screen.findByRole('heading', { name: 'Task summary' })).toBeInTheDocument()
    const summary = screen.getByRole('heading', { name: 'Task summary' }).closest('section')
    expect(summary).not.toBeNull()
    expect(within(summary as HTMLElement).getByText('Close delivery loop')).toBeInTheDocument()
    expect(screen.getByText('Require human acceptance before delivery.')).toBeInTheDocument()
    expect(await screen.findByText(/backend-developer/)).toBeInTheDocument()
    expect(await screen.findByText('AWAITING_REVIEW')).toBeInTheDocument()
  })

  it('renders the five-step path Plan Work Verify Review Deliver', async () => {
    installFetch()
    render(
      <Router initialPath={`/tasks/${TASK.id}`}>
        <TaskDecisionPage taskId={TASK.id} />
      </Router>,
    )

    const path = await screen.findByRole('list', { name: 'Canonical five-step path' })
    for (const step of ['Plan', 'Work', 'Verify', 'Review', 'Deliver']) {
      expect(within(path).getByText(step)).toBeInTheDocument()
    }
    expect(await within(path).findByText('Awaiting human review')).toBeInTheDocument()
  })

  it('renders tab counts and keyboard-navigates tabs', async () => {
    installFetch()
    render(
      <Router initialPath={`/tasks/${TASK.id}`}>
        <TaskDecisionPage taskId={TASK.id} />
      </Router>,
    )

    const tablist = await screen.findByRole('tablist', { name: 'Task detail tabs' })
    expect(await within(tablist).findByRole('tab', { name: /Changes · 2/ })).toBeInTheDocument()
    expect(await within(tablist).findByRole('tab', { name: /Evidence · 1/ })).toBeInTheDocument()
    expect(await within(tablist).findByRole('tab', { name: /Checks · 1/ })).toBeInTheDocument()

    const findingsTab = within(tablist).getByRole('tab', { name: /Findings/ })
    fireEvent.click(findingsTab)
    findingsTab.focus()
    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    expect(within(tablist).getByRole('tab', { name: /Evidence/ })).toHaveFocus()
    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    expect(within(tablist).getByRole('tab', { name: /Checks/ })).toHaveFocus()
  })

  it('joins the checks table to recorded command, exit code, duration', async () => {
    installFetch()
    render(
      <Router initialPath={`/tasks/${TASK.id}`}>
        <TaskDecisionPage taskId={TASK.id} />
      </Router>,
    )

    fireEvent.click(await screen.findByRole('tab', { name: /Checks/ }))
    expect(await screen.findByText('backend-tests')).toBeInTheDocument()
    expect(await screen.findByText('PASSED')).toBeInTheDocument()
    expect(await screen.findByText('1.5 s')).toBeInTheDocument()
  })

  it('stacks without horizontal overflow at 390px', { timeout: 10000 }, async () => {
    installFetch()
    render(
      <Router initialPath={`/tasks/${TASK.id}`}>
        <TaskDecisionPage taskId={TASK.id} />
      </Router>,
    )
    await screen.findByRole('heading', { name: 'Task summary' })
    expect(document.body.scrollWidth).toBeLessThanOrEqual(390 + 32)
  })
})
