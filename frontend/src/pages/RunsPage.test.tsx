import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AgentRun, Project, Run, RunStage, Task } from '../api'
import { Router } from '../router/Router'
import { RunsPage } from './RunsPage'

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
  status: 'RUNNING',
  requested_executor_id: null,
  resolved_executor_id: '00000000-0000-4000-8000-000000000001',
  workflow_snapshot_id: '44444444-4444-4444-8444-444444444444',
  changed_areas: null,
  failure_code: null,
  failure_summary: null,
  started_at: '2026-09-16T10:00:00Z',
  completed_at: null,
  cancel_requested_at: null,
  remediation_cycles_used: 0,
  candidate_workspace_id: null,
  created_at: '2026-09-16T10:00:00Z',
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
  workspace_id: null,
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function fetchFor(tasks: Task[], runsByTask: Record<string, Run[]>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = requestUrl(input)
    if (url === '/api/projects') return jsonResponse([PROJECT])
    if (url === `/api/projects/${PROJECT.id}/tasks`) return jsonResponse(tasks)
    for (const task of tasks) {
      if (url === `/api/tasks/${task.id}/runs`) return jsonResponse(runsByTask[task.id] ?? [])
    }
    if (url.endsWith('/stages')) return jsonResponse([STAGE])
    if (url.endsWith('/agents')) return jsonResponse([AGENT])
    throw new Error(`Unexpected request: ${url}`)
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('RunsPage Phase 5 operational registry', () => {
  it('renders required factual operational columns', async () => {
    vi.stubGlobal('fetch', fetchFor([TASK], { [TASK.id]: [RUN] }))

    render(
      <Router initialPath="/runs">
        <RunsPage />
      </Router>,
    )

    expect(await screen.findByText('RUNNING')).toBeInTheDocument()
    expect(screen.getByText('Project A')).toBeInTheDocument()
    expect(screen.getByText('Task A')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Stage' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Active agents' })).toBeInTheDocument()
    expect(screen.getByText('IMPLEMENTATION')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText(RUN.resolved_executor_id!)).toBeInTheDocument()
    expect(screen.getByText(/2026-09-16/)).toBeInTheDocument()
  })

  it('supports Task-scoped Run history', async () => {
    const otherTask: Task = {
      ...TASK,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Task B',
    }
    const otherRun: Run = {
      ...RUN,
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      task_id: otherTask.id,
    }

    vi.stubGlobal(
      'fetch',
      fetchFor([TASK, otherTask], {
        [TASK.id]: [RUN],
        [otherTask.id]: [otherRun],
      }),
    )

    render(
      <Router initialPath={`/runs?task=${TASK.id}`}>
        <RunsPage />
      </Router>,
    )

    expect(await screen.findByText('33333333')).toBeInTheDocument()
    expect(screen.queryByText('bbbbbbbb')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Task')).toHaveValue(TASK.id)
  })

  it('links each Run to its operational detail', async () => {
    vi.stubGlobal('fetch', fetchFor([TASK], { [TASK.id]: [RUN] }))

    render(
      <Router initialPath="/runs">
        <RunsPage />
      </Router>,
    )

    expect(await screen.findByRole('link', { name: '33333333' }))
      .toHaveAttribute('href', `/runs/${RUN.id}`)
  })
})
