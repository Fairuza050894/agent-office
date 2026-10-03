import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Project, ResultReview, Run, Task } from '../api'
import { Router } from '../router/Router'
import { ProjectKpiPage } from './ProjectKpiPage'

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
  title: 'Ship KPI report',
  objective: 'Expose factual task KPI.',
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
  workflow_snapshot_id: null,
  changed_areas: null,
  failure_code: null,
  failure_summary: null,
  started_at: '2026-10-01T02:00:00Z',
  completed_at: '2026-10-01T03:30:00Z',
  cancel_requested_at: null,
  remediation_cycles_used: 1,
  candidate_workspace_id: null,
  created_at: '2026-10-01T02:00:00Z',
  updated_at: '2026-10-01T03:30:00Z',
}

const REVIEW: ResultReview & { approved_at: string; delivered_at: string } = {
  run_id: RUN.id,
  task_id: TASK.id,
  state: 'DELIVERED',
  candidate_workspace_id: null,
  feedback: null,
  remediation_run_id: null,
  delivered_branch: 'agent-office/accepted/task',
  delivered_commit: '0123456789abcdef',
  approved_at: '2026-10-01T03:40:00Z',
  delivered_at: '2026-10-01T03:45:00Z',
  can_approve: false,
  can_request_changes: false,
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ProjectKpiPage', () => {
  it('separates technical completion from human accepted delivery', async () => {
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
        if (url === `/api/projects/${PROJECT.id}/tasks`) {
          return Promise.resolve(response([TASK]))
        }
        if (url === `/api/tasks/${TASK.id}/runs`) {
          return Promise.resolve(response([RUN]))
        }
        if (url === `/api/runs/${RUN.id}/result-review`) {
          return Promise.resolve(response(REVIEW))
        }
        throw new Error(`Unexpected request: ${url}`)
      }),
    )

    render(
      <Router initialPath={`/kpi?project=${PROJECT.id}`}>
        <ProjectKpiPage />
      </Router>,
    )

    expect(await screen.findByText('Ship KPI report')).toBeInTheDocument()

    const accepted = screen.getByLabelText('Accepted change North Star')
    expect(within(accepted).getByText('Accepted changes · 7d')).toBeInTheDocument()
    expect(within(accepted).getByText('Accepted changes')).toBeInTheDocument()
    expect(within(accepted).getByText('Acceptance rate')).toBeInTheDocument()
    expect(within(accepted).getByText('15m')).toBeInTheDocument()

    const summary = screen.getByLabelText('Project KPI summary')
    expect(within(summary).getByText('Runs completed')).toBeInTheDocument()
    expect(within(summary).getByText('technical completion, not human delivery')).toBeInTheDocument()
    expect(within(summary).getByText('100.0%')).toBeInTheDocument()
    expect(within(summary).getByText('1h 30m')).toBeInTheDocument()
    expect(within(summary).queryByText('Task delivery')).not.toBeInTheDocument()

    const health = screen.getByLabelText('Project execution health')
    expect(within(health).getByText('Remediation cycles')).toBeInTheDocument()

    expect(
      screen.getByText(/COMPLETED is not DELIVERED/i),
    ).toBeInTheDocument()
  })
})
