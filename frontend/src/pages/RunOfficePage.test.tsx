import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import type {
  AgentEvent,
  AgentProfile,
  AgentRun,
  Executor,
  Project,
  Run,
  RunStage,
  Task,
  Workspace,
} from '../api'
import { OfficeRendererBoundary } from '../components/OfficeRendererBoundary'
import { officeAgentState } from '../officeProjection'

const PROJECT: Project = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Project A',
  repository: { name: 'project-a' },
  default_branch: 'main',
  preferred_executor_id: null,
  default_workflow_id: null,
  status: 'ACTIVE',
  created_at: '2026-09-26T03:00:00Z',
  updated_at: '2026-09-26T03:00:00Z',
  archived_at: null,
}

const TASK: Task = {
  id: '22222222-2222-4222-8222-222222222222',
  project_id: PROJECT.id,
  title: 'Implement truthful Office View',
  objective: 'Project canonical AgentRun state into Office View.',
  constraints: null,
  requested_workflow_id: null,
  requested_executor_id: null,
  created_at: '2026-09-26T03:01:00Z',
  updated_at: '2026-09-26T03:01:00Z',
}

const EXECUTOR: Executor = {
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'REFERENCE',
  name: 'Reference Executor',
  status: 'AVAILABLE',
  runtime_version: '1',
  health_summary: 'Available.',
  last_check: '2026-09-26T03:04:00Z',
  capabilities: [],
  security_limitations: [],
}

const PROFILE: AgentProfile = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  key: 'backend-developer',
  name: 'Backend Developer',
  description: 'Implements backend work.',
  default_access_mode: 'WRITE',
  version: 1,
  status: 'ACTIVE',
}

const RUN: Run = {
  id: '33333333-3333-4333-8333-333333333333',
  project_id: PROJECT.id,
  task_id: TASK.id,
  status: 'RUNNING',
  requested_executor_id: EXECUTOR.id,
  resolved_executor_id: EXECUTOR.id,
  workflow_snapshot_id: '44444444-4444-4444-8444-444444444444',
  changed_areas: ['FRONTEND'],
  failure_code: null,
  failure_summary: null,
  started_at: '2026-09-26T03:02:00Z',
  completed_at: null,
  cancel_requested_at: null,
  remediation_cycles_used: 0,
  candidate_workspace_id: '77777777-7777-4777-8777-777777777777',
  created_at: '2026-09-26T03:01:30Z',
  updated_at: '2026-09-26T03:04:00Z',
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
  stage_key: STAGE.stage_key,
  agent_profile_key: PROFILE.key,
  agent_profile_version: 1,
  executor_id: EXECUTOR.id,
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
  updated_at: '2026-09-26T03:04:00Z',
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
  git_branch: 'ao/office',
  reason_code: null,
  reason_summary: null,
  writable: true,
  created_at: '2026-09-26T03:02:00Z',
  updated_at: '2026-09-26T03:04:00Z',
  released_at: null,
}

const AGENT_EVENT: AgentEvent = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  event_type: 'agent.started',
  project_id: PROJECT.id,
  run_id: RUN.id,
  agent_run_id: AGENT.id,
  source: 'EXECUTOR',
  occurred_at: '2026-09-26T03:02:10Z',
  recorded_at: '2026-09-26T03:02:11Z',
  payload: {},
}

const TEST_EVENT: AgentEvent = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  event_type: 'test.completed',
  project_id: PROJECT.id,
  run_id: RUN.id,
  agent_run_id: null,
  source: 'TEST',
  occurred_at: '2026-09-26T03:03:00Z',
  recorded_at: '2026-09-26T03:03:01Z',
  payload: { passed: 142, failed: 2 },
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function officeFetch(agentRuns: AgentRun[] = [AGENT]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = urlOf(input)

    if (url === '/health') return jsonResponse({ status: 'ok' })
    if (url === `/api/runs/${RUN.id}`) return jsonResponse(RUN)
    if (url === `/api/projects/${PROJECT.id}`) return jsonResponse(PROJECT)
    if (url === `/api/tasks/${TASK.id}`) return jsonResponse(TASK)
    if (url === `/api/runs/${RUN.id}/stages`) return jsonResponse([STAGE])
    if (url === `/api/runs/${RUN.id}/agents`) return jsonResponse(agentRuns)
    if (url === `/api/runs/${RUN.id}/workspaces`) return jsonResponse([WORKSPACE])
    if (url === `/api/runs/${RUN.id}/events`) {
      return jsonResponse({ events: [AGENT_EVENT, TEST_EVENT], next_cursor: null })
    }
    if (url === '/api/executors') return jsonResponse([EXECUTOR])
    if (url === '/api/agent-profiles') return jsonResponse([PROFILE])

    throw new Error(`Unexpected request: GET ${url}`)
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Phase 9A Office Workspace', () => {
  it('maps every required AgentRun state explicitly', () => {
    expect(officeAgentState('PENDING')).toEqual({ key: 'pending', label: 'Waiting to start' })
    expect(officeAgentState('STARTING')).toEqual({ key: 'starting', label: 'Starting' })
    expect(officeAgentState('RUNNING')).toEqual({ key: 'running', label: 'Running' })
    expect(officeAgentState('WAITING')).toEqual({ key: 'waiting', label: 'Waiting' })
    expect(officeAgentState('BLOCKED')).toEqual({ key: 'blocked', label: 'Blocked' })
    expect(officeAgentState('FAILED')).toEqual({ key: 'failed', label: 'Failed' })
    expect(officeAgentState('COMPLETED')).toEqual({ key: 'completed', label: 'Completed' })
  })

  it('renders a full-width office with bottom operations dock and on-demand inspector', async () => {
    vi.stubGlobal('fetch', officeFetch())
    render(<App initialPath={`/runs/${RUN.id}/office`} />)

    const dock = await screen.findByRole('region', {
      name: 'Bottom Operations Dock',
    })
    expect(
      screen.getByRole('heading', { level: 1, name: 'Agent Office' }),
    ).toBeInTheDocument()

    const projection = screen.getByRole('region', {
      name: 'Agent Office operational 3D projection',
    })
    expect(projection.querySelectorAll('.office-agent-button')).toHaveLength(0)
    expect(
      screen.queryByRole('complementary', { name: 'Live office sidebar' }),
    ).not.toBeInTheDocument()

    const team = within(dock).getByRole('region', { name: 'Active team' })
    const agentButton = within(team).getByRole('button', {
      name: /Backend Developer.*Running/i,
    })

    expect(
      screen.queryByRole('region', { name: 'Universal Composer' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Workspace' }),
    ).toHaveAttribute(
      'href',
      `/office?project=${PROJECT.id}&floor=build`,
    )
    expect(
      screen.getByRole('button', { name: 'Live' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('button', { name: /L2.*Build/i }),
    ).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(agentButton)

    const detail = screen.getByRole('complementary', {
      name: 'Selected AgentRun details',
    })
    expect(within(detail).getAllByText('Backend Developer').length).toBeGreaterThan(0)
    expect(within(detail).getByText('RUNNING · attempt 1')).toBeInTheDocument()
    expect(within(detail).getByText('Reference Executor · 1')).toBeInTheDocument()
    expect(within(detail).getByText('IMPLEMENTATION · RUNNING')).toBeInTheDocument()
    expect(within(detail).getByText('GIT_WORKTREE · ao/office')).toBeInTheDocument()
    expect(within(detail).getByText(/Agent started/)).toBeInTheDocument()

    fireEvent.click(within(detail).getByRole('button', { name: 'Close AgentRun inspector' }))
    expect(
      screen.queryByRole('complementary', { name: 'Selected AgentRun details' }),
    ).not.toBeInTheDocument()
  })

  it('preserves floor continuity when opening Historical Replay', async () => {
    vi.stubGlobal('fetch', officeFetch())
    render(
      <App
        initialPath={`/runs/${RUN.id}/office?floor=strategy&mode=replay`}
      />,
    )

    await screen.findByRole('region', {
      name: 'Bottom Operations Dock',
    })

    expect(
      screen.getByRole('button', { name: /L3.*Strategy/i }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('button', { name: 'Replay' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('link', { name: 'Workspace' }),
    ).toHaveAttribute(
      'href',
      `/office?project=${PROJECT.id}&floor=strategy`,
    )
  })

  it('renders only factual dock activity and creates no worker when AgentRuns are absent', async () => {
    vi.stubGlobal('fetch', officeFetch([]))
    render(<App initialPath={`/runs/${RUN.id}/office`} />)

    const projection = await screen.findByRole('region', {
      name: 'Agent Office operational 3D projection',
    })
    expect(projection.querySelectorAll('.office-agent-button')).toHaveLength(0)

    const dock = screen.getByRole('region', { name: 'Bottom Operations Dock' })
    expect(within(dock).getByText('No factual AgentRun is active in this scope.')).toBeInTheDocument()
    expect(within(dock).getByText(/Verification completed/)).toBeInTheDocument()
    expect(within(dock).getByText(/142 passed · 2 failed/)).toBeInTheDocument()
  })

  it('supports maximize without changing canonical Run state', async () => {
    vi.stubGlobal('fetch', officeFetch())
    render(<App initialPath={`/runs/${RUN.id}/office`} />)

    const maximize = await screen.findByRole('button', { name: 'Maximize' })
    fireEvent.click(maximize)
    expect(screen.getByRole('button', { name: 'Exit maximize' })).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Bottom Operations Dock' }),
    ).toHaveClass('dock-collapsed')
  })

  it('keeps operational navigation available when the local renderer fails', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    function BrokenRenderer(): ReactElement {
      throw new Error('renderer failure')
    }

    render(
      <OfficeRendererBoundary operationalHref={`/runs/${RUN.id}`}>
        <BrokenRenderer />
      </OfficeRendererBoundary>,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Office renderer unavailable')
    expect(alert).toHaveTextContent('workflow execution remain independent')
    expect(screen.getByRole('link', { name: 'Open operational Run' })).toHaveAttribute(
      'href',
      `/runs/${RUN.id}`,
    )

    errorSpy.mockRestore()
  })
})
