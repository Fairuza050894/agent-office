import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  AgentEvent,
  AgentProfile,
  AuditRecord,
  Evidence,
  Executor,
  Project,
  Run,
  Task,
  WorkflowDefinition,
} from '../api'
import { RunChangesTab } from '../components/RunChangesTab'
import { RunTestsTab } from '../components/RunTestsTab'
import { Router } from '../router/Router'
import { ActivityPage } from './ActivityPage'
import { AgentsPage } from './AgentsPage'
import { AuditPage } from './AuditPage'
import { EvidencePage } from './EvidencePage'
import { ExecutorsPage } from './ExecutorsPage'
import { OverviewPage } from './OverviewPage'
import { WorkflowsPage } from './WorkflowsPage'

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
  title: 'Task A',
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
  status: 'BLOCKED',
  requested_executor_id: null,
  resolved_executor_id: '00000000-0000-4000-8000-000000000001',
  workflow_snapshot_id: '44444444-4444-4444-8444-444444444444',
  changed_areas: ['BACKEND'],
  failure_code: 'OPEN_BLOCKER_FINDING',
  failure_summary: 'A blocker requires operator attention.',
  started_at: '2026-09-16T10:00:00Z',
  completed_at: null,
  cancel_requested_at: null,
  remediation_cycles_used: 0,
  candidate_workspace_id: '77777777-7777-4777-8777-777777777777',
  created_at: '2026-09-16T09:59:00Z',
  updated_at: '2026-09-16T10:00:00Z',
}

const PROFILE: AgentProfile = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  key: 'backend-developer',
  name: 'Backend Developer',
  description: 'Implements backend changes.',
  default_access_mode: 'WRITE',
  version: 1,
  status: 'ACTIVE',
}

const EXECUTOR: Executor = {
  id: RUN.resolved_executor_id!,
  kind: 'REFERENCE',
  name: 'Reference Executor',
  status: 'AVAILABLE',
  runtime_version: '1',
  health_summary: 'Deterministic local executor is available.',
  last_check: '2026-09-16T10:00:00Z',
  capabilities: [
    {
      capability: 'START_EXECUTION',
      support: 'SUPPORTED',
      limitations: null,
      source: 'reference-executor',
      checked_at: '2026-09-16T10:00:00Z',
    },
    {
      capability: 'FILE_WRITE',
      support: 'UNSUPPORTED',
      limitations: null,
      source: 'reference-executor',
      checked_at: '2026-09-16T10:00:00Z',
    },
  ],
  security_limitations: ['FILE_WRITE: UNSUPPORTED'],
}

const WORKFLOW: WorkflowDefinition = {
  id: '88888888-8888-4888-8888-888888888888',
  key: 'enterprise-engineering',
  name: 'Enterprise Engineering',
  description: 'Engineering workflow.',
  version: 1,
  status: 'ACTIVE',
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
  verification_checks: [],
  created_at: '2026-09-16T08:00:00Z',
  updated_at: '2026-09-16T08:00:00Z',
}

const EVENT: AgentEvent = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  event_type: 'RUN_BLOCKED',
  project_id: PROJECT.id,
  run_id: RUN.id,
  agent_run_id: null,
  source: 'ORCHESTRATOR',
  occurred_at: '2026-09-16T10:02:00Z',
  recorded_at: '2026-09-16T10:02:01Z',
  payload: { reason_code: RUN.failure_code },
}

const EVIDENCE: Evidence = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  project_id: PROJECT.id,
  task_id: TASK.id,
  run_id: RUN.id,
  agent_run_id: null,
  kind: 'TEST_RESULT',
  status: 'PASSED',
  summary: 'Backend verification passed.',
  metadata: {},
  schema_version: 1,
  created_at: '2026-09-16T10:03:00Z',
}

const AUDIT: AuditRecord = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  project_id: PROJECT.id,
  run_id: RUN.id,
  actor_type: 'USER',
  actor_id: null,
  action: 'RUN_RECONCILIATION_REQUESTED',
  target_type: 'RUN',
  target_id: RUN.id,
  occurred_at: '2026-09-16T10:04:00Z',
  safe_metadata: {},
}

function response(body: unknown): Response {
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

function registryFetch(input: RequestInfo | URL): Promise<Response> {
  const url = urlOf(input)
  if (url === '/api/projects') return Promise.resolve(response([PROJECT]))
  if (url === `/api/projects/${PROJECT.id}/tasks`) return Promise.resolve(response([TASK]))
  if (url === `/api/tasks/${TASK.id}/runs`) return Promise.resolve(response([RUN]))
  if (url === `/api/runs/${RUN.id}/stages`) return Promise.resolve(response([]))
  if (url === `/api/runs/${RUN.id}/agents`) return Promise.resolve(response([]))
  if (url === `/api/runs/${RUN.id}/events`) return Promise.resolve(response({ events: [EVENT], next_cursor: null }))
  if (url === `/api/runs/${RUN.id}/evidence`) return Promise.resolve(response([EVIDENCE]))
  if (url === `/api/runs/${RUN.id}/audit`) return Promise.resolve(response([AUDIT]))
  if (url === '/api/executors') return Promise.resolve(response([EXECUTOR]))
  if (url === '/api/agent-profiles') return Promise.resolve(response([PROFILE]))
  if (url === '/api/workflows') return Promise.resolve(response([WORKFLOW]))
  throw new Error(`Unexpected request: ${url}`)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Phase 5 operational registries', () => {
  it('renders reusable Agent Profiles independently of AgentRun state', async () => {
    vi.stubGlobal('fetch', vi.fn(registryFetch))
    render(<AgentsPage />)
    expect(await screen.findByText('Backend Developer')).toBeInTheDocument()
    expect(screen.getByText('WRITE')).toBeInTheDocument()
  })

  it('renders workflow definitions and required roles', async () => {
    vi.stubGlobal('fetch', vi.fn(registryFetch))
    render(<WorkflowsPage />)
    expect(await screen.findByText('Enterprise Engineering')).toBeInTheDocument()
    expect(screen.getByText('backend-developer')).toBeInTheDocument()
  })

  it('renders factual executor runtime, capabilities, and security limitations', async () => {
    vi.stubGlobal('fetch', vi.fn(registryFetch))
    render(<ExecutorsPage />)
    expect(await screen.findByText('Reference Executor')).toBeInTheDocument()
    expect(screen.getByText(/START_EXECUTION: SUPPORTED/)).toBeInTheDocument()
    expect(screen.getByText('FILE_WRITE: UNSUPPORTED')).toBeInTheDocument()
  })

  it('renders normalized global Activity from persisted Run events', async () => {
    vi.stubGlobal('fetch', vi.fn(registryFetch))
    render(<Router initialPath="/activity"><ActivityPage /></Router>)
    expect(await screen.findByText('RUN_BLOCKED')).toBeInTheDocument()
    expect(screen.getByText(/reason_code=OPEN_BLOCKER_FINDING/)).toBeInTheDocument()
  })

  it('renders persisted Evidence with source and status', async () => {
    vi.stubGlobal('fetch', vi.fn(registryFetch))
    render(<Router initialPath="/evidence"><EvidencePage /></Router>)
    expect(await screen.findByText('Backend verification passed.')).toBeInTheDocument()
    expect(screen.getByText('PASSED')).toBeInTheDocument()
    expect(screen.getByText('Control plane')).toBeInTheDocument()
  })

  it('renders append-only Audit history', async () => {
    vi.stubGlobal('fetch', vi.fn(registryFetch))
    render(<Router initialPath="/audit"><AuditPage /></Router>)
    expect(await screen.findByText('RUN_RECONCILIATION_REQUESTED')).toBeInTheDocument()
    expect(screen.getByText('USER')).toBeInTheDocument()
  })

  it('derives Needs Attention from blocked backend Run state', async () => {
    vi.stubGlobal('fetch', vi.fn(registryFetch))
    render(<Router initialPath="/overview"><OverviewPage /></Router>)
    expect(await screen.findByText('1 actionable')).toBeInTheDocument()
    expect(screen.getByText('A blocker requires operator attention.')).toBeInTheDocument()
  })

  it('shows backend executor status on Global Overview without a score', async () => {
    vi.stubGlobal('fetch', vi.fn(registryFetch))
    render(<Router initialPath="/overview"><OverviewPage /></Router>)
    expect(await screen.findByText('Reference Executor')).toBeInTheDocument()
    expect(screen.getByText('AVAILABLE')).toBeInTheDocument()
    expect(screen.queryByText(/score/i)).not.toBeInTheDocument()
  })

  it('shows unavailable change counts when Git does not know them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = urlOf(input)
        if (url === `/api/runs/${RUN.id}/workspaces`) {
          return response([
            {
              id: RUN.candidate_workspace_id,
              project_id: PROJECT.id,
              run_id: RUN.id,
              owner_agent_run_id: null,
              kind: 'GIT_WORKTREE',
              access_mode: 'WRITE',
              status: 'READY',
              base_revision: 'abc',
              git_branch: 'ao/test',
              reason_code: null,
              reason_summary: null,
              writable: true,
              created_at: RUN.created_at,
              updated_at: RUN.updated_at,
              released_at: null,
            },
          ])
        }
        if (url === `/api/workspaces/${RUN.candidate_workspace_id}/status`) {
          return response({
            workspace: {
              id: RUN.candidate_workspace_id,
              project_id: PROJECT.id,
              run_id: RUN.id,
              owner_agent_run_id: null,
              kind: 'GIT_WORKTREE',
              access_mode: 'WRITE',
              status: 'READY',
              base_revision: 'abc',
              git_branch: 'ao/test',
              reason_code: null,
              reason_summary: null,
              writable: true,
              created_at: RUN.created_at,
              updated_at: RUN.updated_at,
              released_at: null,
            },
            change_summary: {
              base_revision: 'abc',
              current_revision: null,
              files_changed: 1,
              insertions: null,
              deletions: null,
              added_paths: [],
              modified_paths: ['backend/x.py'],
              deleted_paths: [],
              untracked_paths: [],
            },
          })
        }
        throw new Error(`Unexpected request: ${url}`)
      }),
    )
    render(<RunChangesTab run={RUN} />)
    expect(await screen.findAllByText('Unavailable')).toHaveLength(2)
  })

  it('shows Test status as unavailable when a Run declares no checks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({ run_id: RUN.id, checked: false, checks: [], evidence_count: 0 }),
      ),
    )
    render(<RunTestsTab runId={RUN.id} />)
    expect(await screen.findByText('Test status unavailable.')).toBeInTheDocument()
    expect(screen.getByText(/rather than zero or passed/)).toBeInTheDocument()
  })
})
