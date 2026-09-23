import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Project, Run, Task } from '../api'
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
  status: 'CREATED',
  requested_executor_id: null,
  created_at: '2026-09-16T10:00:00Z',
  updated_at: '2026-09-16T10:00:00Z',
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

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('RunsPage Phase 2 integration', () => {
  it('renders real Run history without fake stage or agent fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url === '/api/projects') return jsonResponse([PROJECT])
        if (url === `/api/projects/${PROJECT.id}/tasks`) return jsonResponse([TASK])
        if (url === `/api/tasks/${TASK.id}/runs`) return jsonResponse([RUN])
        throw new Error(`Unexpected request: ${url}`)
      }),
    )

    render(
      <Router initialPath="/runs">
        <RunsPage />
      </Router>,
    )

    expect(await screen.findByText('CREATED')).toBeInTheDocument()
    expect(screen.getByText('Project A')).toBeInTheDocument()
    expect(screen.getByText('Task A')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Stage' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Active agents' })).not.toBeInTheDocument()
    expect(screen.getByText('1 run')).toBeInTheDocument()
  })

  it('supports Task-scoped Run history through the query-aware router', async () => {
    const otherTask: Task = { ...TASK, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Task B' }
    const otherRun: Run = { ...RUN, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', task_id: otherTask.id }

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url === '/api/projects') return jsonResponse([PROJECT])
        if (url === `/api/projects/${PROJECT.id}/tasks`) return jsonResponse([TASK, otherTask])
        if (url === `/api/tasks/${TASK.id}/runs`) return jsonResponse([RUN])
        if (url === `/api/tasks/${otherTask.id}/runs`) return jsonResponse([otherRun])
        throw new Error(`Unexpected request: ${url}`)
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

  it('Run row links navigate to /runs/{id} detail page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url === '/api/projects') return jsonResponse([PROJECT])
        if (url === `/api/projects/${PROJECT.id}/tasks`) return jsonResponse([TASK])
        if (url === `/api/tasks/${TASK.id}/runs`) return jsonResponse([RUN])
        throw new Error(`Unexpected request: ${url}`)
      }),
    )

    render(
      <Router initialPath="/runs">
        <RunsPage />
      </Router>,
    )

    // Wait for the run row to render
    const link = await screen.findByRole('link', { name: '33333333' })
    expect(link).toHaveAttribute('href', `/runs/${RUN.id}`)
  })
})
