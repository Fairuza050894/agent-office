import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  AgentEvent,
  AgentRun,
  Evidence,
  Finding,
  Project,
  Run,
  RunStage,
  Task,
  VerificationStatus,
  WorkflowSnapshot,
  Workspace,
  WorkspaceStatusResponse,
} from '../api'
import { Router } from '../router/Router'
import { RunDetailPage } from './RunDetailPage'

const PROJECT: Project = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Project A',
  repository: { name: 'project-a' },
  default_branch: 'main',
  preferred_executor_id: null,
  default_workflow_id: null,
  status: 'ACTIVE',
  created_at: '2026-09-16T08:00:00Z',
  updated_at: '2026-09-16T08:00:00Z',
  archived_at: null,
}

const TASK: Task = {
  id: '22222222-2222-4222-8222-222222222222',
  project_id: PROJECT.id,
  title: 'Test Task Title',
  objective: 'Objective A',
  constraints: null,
  requested_workflow_id: null,
  requested_executor_id: null,
  created_at: '2026-09-16T09:00:00Z',
  updated_at: '2026-09-16T09:00:00Z',
}

const RUN: Run = {
  id: '33333333-3333-4333-8333-333333333333',
  project_id: PROJECT.id,
  task_id: TASK.id,
  status: 'RUNNING',
  requested_executor_id: null,
  resolved_executor_id: '00000000-0000-4000-8000-000000000001',
  workflow_snapshot_id: '44444444-4444-4444-8444-444444444444',
  changed_areas: ['BACKEND'],
  failure_code: null,
  failure_summary: null,
  started_at: '2026-09-16T10:00:00Z',
  completed_at: null,
  cancel_requested_at: null,
  remediation_cycles_used: 0,
  candidate_workspace_id: '77777777-7777-4777-8777-777777777777',
  created_at: '2026-09-16T09:59:00Z',
  updated_at: '2026-09-16T10:00:00Z',
}

const STAGE: RunStage = {
  stage_key: 'IMPLEMENTATION',
  status: 'RUNNING',
  required: true,
  order_hint: 1,
  execution_mode: 'SEQUENTIAL',
  condition: 'ALWAYS',
  reason_code: null,
  reason_summary: null,
  started_at: RUN.started_at,
  completed_at: null,
}

const AGENT: AgentRun = {
  id: '55555555-5555-4555-8555-555555555555',
  run_id: RUN.id,
  project_id: PROJECT.id,
  stage_key: 'IMPLEMENTATION',
  agent_profile_key: 'backend-developer',
  agent_profile_version: 1,
  executor_id: RUN.resolved_executor_id!,
  access_mode: 'WRITE',
  status: 'RUNNING',
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
  started_at: RUN.started_at,
  completed_at: null,
  created_at: RUN.started_at!,
  updated_at: RUN.started_at!,
}

const SNAPSHOT: WorkflowSnapshot = {
  id: RUN.workflow_snapshot_id!,
  run_id: RUN.id,
  project_id: PROJECT.id,
  source_workflow_id: '88888888-8888-4888-8888-888888888888',
  source_workflow_key: 'enterprise-engineering',
  source_workflow_version: 1,
  schema_version: 1,
  stages: [
    {
      key: 'IMPLEMENTATION',
      name: 'Implementation',
      order_hint: 1,
      execution_mode: 'SEQUENTIAL',
      required: true,
      condition: 'ALWAYS',
      depends_on: [],
      assignments: [
        { profile_key: 'backend-developer', access_mode: 'WRITE', required: true },
      ],
    },
  ],
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
  created_at: '2026-09-16T10:00:00Z',
}

const WORKSPACE: Workspace = {
  id: RUN.candidate_workspace_id!,
  project_id: PROJECT.id,
  run_id: RUN.id,
  owner_agent_run_id: AGENT.id,
  kind: 'GIT_WORKTREE',
  access_mode: 'WRITE',
  status: 'READY',
  base_revision: 'abc123',
  git_branch: 'ao/run-work',
  reason_code: null,
  reason_summary: null,
  writable: true,
  created_at: '2026-09-16T10:00:00Z',
  updated_at: '2026-09-16T10:01:00Z',
  released_at: null,
}

const WORKSPACE_STATUS: WorkspaceStatusResponse = {
  workspace: WORKSPACE,
  change_summary: {
    base_revision: 'abc123',
    current_revision: 'abc123',
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
  status: 'PASSED',
  summary: 'Tests passed.',
  metadata: {},
  schema_version: 1,
  created_at: '2026-09-16T10:05:00Z',
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
      command_status: 'SUCCEEDED',
      evidence_id: EVIDENCE.id,
      satisfied: true,
    },
  ],
}

const FINDING: Finding = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  project_id: PROJECT.id,
  run_id: RUN.id,
  reviewer_agent_run_id: AGENT.id,
  category: 'SECURITY',
  severity: 'BLOCKER',
  title: 'Blocking observation',
  description: 'Original reviewer text remains visible.',
  status: 'OPEN',
  location: null,
  remediation_owner_agent_run_id: AGENT.id,
  resolution_type: null,
  resolver_agent_run_id: null,
  resolution_summary: null,
  blocks_completion: true,
  created_at: '2026-09-16T10:04:00Z',
  updated_at: '2026-09-16T10:04:00Z',
  resolved_at: null,
}

const EVENT: AgentEvent = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  event_type: 'AGENT_RUN_STARTED',
  project_id: PROJECT.id,
  run_id: RUN.id,
  agent_run_id: AGENT.id,
  source: 'ORCHESTRATOR',
  occurred_at: '2026-09-16T10:02:00Z',
  recorded_at: '2026-09-16T10:02:01Z',
  payload: { stage_key: 'IMPLEMENTATION' },
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function makeFetch(run: Run = RUN) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input)
    const method = init?.method?.toUpperCase() ?? 'GET'

    if (method === 'GET' && url === `/api/runs/${run.id}`) return jsonResponse(run)
    if (method === 'GET' && url === `/api/projects/${PROJECT.id}`) return jsonResponse(PROJECT)
    if (method === 'GET' && url === `/api/tasks/${TASK.id}`) return jsonResponse(TASK)
    if (method === 'GET' && url === `/api/runs/${run.id}/stages`) return jsonResponse([STAGE])
    if (method === 'GET' && url === `/api/runs/${run.id}/completion-gates`) {
      return jsonResponse({
        status: run.status,
        complete: run.status === 'COMPLETED',
        failures: run.status === 'BLOCKED' ? [run.failure_code ?? 'BLOCKED'] : [],
      })
    }
    if (method === 'GET' && url === `/api/runs/${run.id}/agents`) return jsonResponse([AGENT])
    if (method === 'GET' && url === `/api/runs/${run.id}/snapshot`) return jsonResponse(SNAPSHOT)
    if (method === 'GET' && url === `/api/runs/${run.id}/workspaces`) return jsonResponse([WORKSPACE])
    if (method === 'GET' && url === `/api/workspaces/${WORKSPACE.id}/status`) return jsonResponse(WORKSPACE_STATUS)
    if (method === 'GET' && url === `/api/runs/${run.id}/evidence`) return jsonResponse([EVIDENCE])
    if (method === 'GET' && url === `/api/runs/${run.id}/verification`) return jsonResponse(VERIFICATION)
    if (method === 'GET' && url === `/api/runs/${run.id}/findings`) {
      return jsonResponse({ run_id: run.id, findings: [FINDING], open_blockers: 1 })
    }
    if (method === 'GET' && url === `/api/runs/${run.id}/events`) {
      return jsonResponse({ events: [EVENT], next_cursor: null })
    }
    if (method === 'POST' && url === `/api/runs/${run.id}/cancel`) {
      return jsonResponse({ ...run, status: 'CANCELLED', completed_at: '2026-09-16T10:10:00Z' })
    }
    if (method === 'POST' && url === `/api/runs/${run.id}/reconcile`) {
      return jsonResponse({ ...run, status: 'BLOCKED' })
    }
    if (method === 'POST' && url === `/api/runs/${run.id}/resume`) {
      return jsonResponse({ ...run, status: 'RUNNING', failure_code: null, failure_summary: null })
    }
    if (method === 'POST' && url === `/api/findings/${FINDING.id}/accept-risk`) {
      return jsonResponse({
        ...FINDING,
        status: 'ACCEPTED_RISK',
        blocks_completion: false,
        resolution_summary: 'Accepted for test.',
      })
    }

    throw new Error(`Unexpected request: ${method} ${url}`)
  })
}

function renderPage(run: Run = RUN) {
  return render(
    <Router initialPath={`/runs/${run.id}`}>
      <RunDetailPage runId={run.id} />
    </Router>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('RunDetailPage Phase 5 operational behavior', () => {
  it('renders every required Run Detail tab', async () => {
    vi.stubGlobal('fetch', makeFetch())
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Run #33333333' })).toBeInTheDocument()
    for (const tab of ['Overview', 'Workflow', 'Agents', 'Activity', 'Changes', 'Tests', 'Findings', 'Evidence']) {
      expect(screen.getByRole('tab', { name: tab })).toBeInTheDocument()
    }
  })

  it('answers the operational Run overview from backend truth', async () => {
    vi.stubGlobal('fetch', makeFetch())
    renderPage()

    expect(await screen.findByText('What is running?')).toBeInTheDocument()
    expect(screen.getByText('Who is active?')).toBeInTheDocument()
    expect(screen.getByText('Which executor?')).toBeInTheDocument()
    expect(screen.getByText('What changed?')).toBeInTheDocument()
    expect(screen.getByText('What evidence exists?')).toBeInTheDocument()
    expect(screen.getByText('Is it merged?')).toBeInTheDocument()
    expect(screen.getByText(/2 file\(s\) changed/)).toBeInTheDocument()
    expect(screen.getByText(/does not automatically merge/)).toBeInTheDocument()
  })

  it('renders WorkflowSnapshot, AgentProfile assignments, Changes, and Tests without invented values', async () => {
    vi.stubGlobal('fetch', makeFetch())
    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Workflow' }))
    expect(await screen.findByText('enterprise-engineering')).toBeInTheDocument()
    expect(screen.getByText('Backend Developer')).not.toBeInTheDocument()
    expect(screen.getByText('backend-developer')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Agents' }))
    expect(await screen.findByText('Agent Profiles')).toBeInTheDocument()
    expect(screen.getByText('Backend Developer')).toBeInTheDocument()
    expect(screen.getByText('Agent Runs')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Changes' }))
    expect(await screen.findByText('12')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('+backend/new.py')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Tests' }))
    expect(await screen.findByText('backend-tests')).toBeInTheDocument()
    expect(screen.getByText('SUCCEEDED')).toBeInTheDocument()
  })

  it('shows normalized Activity with explicit REST fallback state', async () => {
    vi.stubGlobal('fetch', makeFetch())
    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }))
    expect(await screen.findByText('Live updates disconnected. REST reconciliation remains available.')).toBeInTheDocument()
    expect(screen.getByText('AGENT_RUN_STARTED')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })

  it('uses canonical backend controls instead of frontend-owned state', async () => {
    const fetchMock = makeFetch()
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    const cancel = await screen.findByRole('button', { name: 'Cancel Run' })
    fireEvent.click(cancel)

    await waitFor(() => expect(screen.getByText('CANCELLED')).toBeInTheDocument())
    expect(
      fetchMock.mock.calls.some(
        ([input, options]) =>
          requestUrl(input) === `/api/runs/${RUN.id}/cancel` &&
          options?.method === 'POST',
      ),
    ).toBe(true)
  })

  it('shows blocked and unknown-execution recovery UX truthfully', async () => {
    const blocked: Run = {
      ...RUN,
      status: 'BLOCKED',
      failure_code: 'UNKNOWN_EXECUTION_STATE',
      failure_summary: 'Executor status could not be proven.',
    }
    vi.stubGlobal('fetch', makeFetch(blocked))
    renderPage(blocked)

    expect(
      await screen.findByText('Execution status unknown / Workspace retained for safety.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reconcile' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument()
  })

  it('keeps original blocker text visible and requires a reason for risk acceptance', async () => {
    const fetchMock = makeFetch()
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Findings' }))
    expect(await screen.findByText('Original reviewer text remains visible.')).toBeInTheDocument()

    const button = screen.getByRole('button', { name: 'Accept risk' })
    fireEvent.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('Accepting risk requires a recorded reason.')

    fireEvent.change(screen.getByLabelText('Accept risk reason'), {
      target: { value: 'Accepted for test.' },
    })
    fireEvent.click(button)

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, options]) =>
            requestUrl(input) === `/api/findings/${FINDING.id}/accept-risk` &&
            options?.method === 'POST',
        ),
      ).toBe(true)
    })
  })
})
