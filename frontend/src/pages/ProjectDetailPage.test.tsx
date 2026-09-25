import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Project, Run, Task } from '../api'
import { Router } from '../router/Router'
import { ProjectDetailPage } from './ProjectDetailPage'

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
  objective: 'Objective',
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
  workflow_snapshot_id: null,
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

describe('ProjectDetailPage Phase 5', () => {
  it('provides all required Project Detail tabs and backend-derived content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
        if (url === `/api/projects/${PROJECT.id}`) return response(PROJECT)
        if (url === `/api/projects/${PROJECT.id}/tasks`) return response([TASK])
        if (url === `/api/tasks/${TASK.id}/runs`) return response([RUN])
        throw new Error(`Unexpected request: ${url}`)
      }),
    )

    render(
      <Router initialPath={`/projects/${PROJECT.id}`}>
        <ProjectDetailPage projectId={PROJECT.id} />
      </Router>,
    )

    expect(await screen.findByRole('heading', { level: 1, name: 'Project A' })).toBeInTheDocument()
    for (const tab of ['Overview', 'Tasks', 'Runs', 'Repository', 'Settings']) {
      expect(screen.getByRole('tab', { name: tab })).toBeInTheDocument()
    }
    const activeRunsHeading = screen.getByText('Active runs')
    expect(activeRunsHeading).toBeInTheDocument()
    const activeRunsSection = activeRunsHeading.closest('section')
    expect(activeRunsSection).not.toBeNull()
    expect(within(activeRunsSection as HTMLElement).getByText('1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Repository' }))
    expect(screen.getByText('project-a')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Runs' }))
    expect(await screen.findByRole('link', { name: '33333333' }))
      .toHaveAttribute('href', `/runs/${RUN.id}`)
  })
})
