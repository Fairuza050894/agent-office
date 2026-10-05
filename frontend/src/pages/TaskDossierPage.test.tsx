import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Project, ResultReview, Run, Task } from '../api'
import { Router } from '../router/Router'
import { TaskDossierPage } from './TaskDossierPage'

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
  workflow_snapshot_id: null,
  changed_areas: null,
  failure_code: null,
  failure_summary: null,
  started_at: '2026-10-01T02:00:00Z',
  completed_at: '2026-10-01T03:00:00Z',
  cancel_requested_at: null,
  remediation_cycles_used: 0,
  candidate_workspace_id: null,
  created_at: '2026-10-01T02:00:00Z',
  updated_at: '2026-10-01T03:00:00Z',
}

const REVIEW: ResultReview = {
  run_id: RUN.id,
  task_id: TASK.id,
  state: 'DELIVERED',
  candidate_workspace_id: null,
  feedback: null,
  remediation_run_id: null,
  delivered_branch: 'agent-office/accepted/task',
  delivered_commit: '0123456789abcdef',
  changes_requested_at: null,
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

function installFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (url === `/api/tasks/${TASK.id}`) return Promise.resolve(response(TASK))
      if (url === `/api/projects/${PROJECT.id}`) return Promise.resolve(response(PROJECT))
      if (url === `/api/tasks/${TASK.id}/runs`) return Promise.resolve(response([RUN]))
      if (url === `/api/runs/${RUN.id}/result-review`) return Promise.resolve(response(REVIEW))
      if (url === `/api/runs/${RUN.id}/evidence`) return Promise.resolve(response([]))
      if (url === `/api/runs/${RUN.id}/findings`) {
        return Promise.resolve(response({ run_id: RUN.id, findings: [], open_blockers: 0 }))
      }
      if (url === `/api/runs/${RUN.id}/audit`) return Promise.resolve(response([]))
      if (url === `/api/runs/${RUN.id}/verification`) {
        return Promise.resolve(response({ run_id: RUN.id, checked: false, checks: [], evidence_count: 0 }))
      }
      if (url === `/api/runs/${RUN.id}/workspaces`) return Promise.resolve(response([]))
      if (url === `/api/runs/${RUN.id}/events`) {
        return Promise.resolve(response({ events: [], next_cursor: null }))
      }
      throw new Error(`Unexpected request: ${url}`)
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('TaskDossierPage U6', () => {
  it('renders all viewer sections from the same projection as export', async () => {
    installFetch()
    render(
      <Router initialPath={`/tasks/${TASK.id}/dossier`}>
        <TaskDossierPage taskId={TASK.id} />
      </Router>,
    )

    for (const section of [
      'Overview',
      'Changes',
      'Verification',
      'Evidence',
      'Human decisions',
      'Security facts',
      'Timeline',
    ]) {
      expect(await screen.findByRole('heading', { name: section })).toBeInTheDocument()
    }
    expect(screen.getByText('agent-office/accepted/task')).toBeInTheDocument()
    expect(screen.getByText('Delivered to managed branch')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Download Markdown' }),
    ).toBeInTheDocument()
  })

  it('refuses download language before delivery facts exist', async () => {
    installFetch()
    render(
      <Router initialPath={`/tasks/${TASK.id}/dossier`}>
        <TaskDossierPage taskId={TASK.id} />
      </Router>,
    )

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.queryByText(/merged to main/i)).not.toBeInTheDocument()
    expect(
      screen.getByText(/Absence of records is not a claim of zero issues/),
    ).toBeInTheDocument()
  })
})
