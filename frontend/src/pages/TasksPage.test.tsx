import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Project, Run, Task } from '../api'
import { Router } from '../router/Router'
import { TasksPage } from './TasksPage'

const PROJECT_A: Project = {
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

const PROJECT_B: Project = {
  ...PROJECT_A,
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Project B',
  repository: { name: 'project-b' },
}

const TASK_A: Task = {
  id: '22222222-2222-4222-8222-222222222222',
  project_id: PROJECT_A.id,
  title: 'Task A',
  objective: 'Objective A',
  constraints: null,
  requested_workflow_id: null,
  requested_executor_id: null,
  created_at: '2026-09-16T09:00:00Z',
  updated_at: '2026-09-16T09:00:00Z',
}

const TASK_B: Task = {
  ...TASK_A,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  project_id: PROJECT_B.id,
  title: 'Task B',
  objective: 'Objective B',
}

const RUN_A: Run = {
  id: '33333333-3333-4333-8333-333333333333',
  project_id: PROJECT_A.id,
  task_id: TASK_A.id,
  status: 'CREATED',
  requested_executor_id: null,
  resolved_executor_id: null,
  workflow_snapshot_id: null,
  changed_areas: null,
  failure_code: null,
  failure_summary: null,
  started_at: null,
  completed_at: null,
  cancel_requested_at: null,
  remediation_cycles_used: 0,
  candidate_workspace_id: null,
  created_at: '2026-09-16T10:00:00Z',
  updated_at: '2026-09-16T10:00:00Z',
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

function renderPage(initialPath = '/tasks') {
  return render(
    <Router initialPath={initialPath}>
      <TasksPage />
    </Router>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('TasksPage operational integration', () => {
  it('loads project-scoped tasks and their factual latest Run state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url === '/api/projects') return jsonResponse([PROJECT_A, PROJECT_B])
        if (url === `/api/projects/${PROJECT_A.id}/tasks`) return jsonResponse([TASK_A])
        if (url === `/api/projects/${PROJECT_B.id}/tasks`) return jsonResponse([TASK_B])
        if (url === `/api/tasks/${TASK_A.id}/runs`) return jsonResponse([RUN_A])
        if (url === `/api/tasks/${TASK_B.id}/runs`) return jsonResponse([])
        throw new Error(`Unexpected request: ${url}`)
      }),
    )

    renderPage()

    expect(await screen.findByText('Task A')).toBeInTheDocument()
    expect(screen.getByText('Task B')).toBeInTheDocument()
    expect(screen.getByText('CREATED')).toBeInTheDocument()
    expect(screen.getByText('2 tasks')).toBeInTheDocument()
  })

  it('honors project context passed from the Projects registry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url === '/api/projects') return jsonResponse([PROJECT_A, PROJECT_B])
        if (url === `/api/projects/${PROJECT_A.id}/tasks`) return jsonResponse([TASK_A])
        if (url === `/api/projects/${PROJECT_B.id}/tasks`) return jsonResponse([TASK_B])
        if (url.endsWith('/runs')) return jsonResponse([])
        throw new Error(`Unexpected request: ${url}`)
      }),
    )

    renderPage(`/tasks?project=${PROJECT_A.id}`)

    expect(await screen.findByText('Task A')).toBeInTheDocument()
    expect(screen.queryByText('Task B')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Project')).toHaveValue(PROJECT_A.id)
  })

  it('creates a Task using the backend contract', async () => {
    const createdTask: Task = { ...TASK_A, title: 'New durable task' }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method?.toUpperCase() ?? 'GET'
      if (method === 'GET' && url === '/api/projects') return jsonResponse([PROJECT_A])
      if (method === 'GET' && url === `/api/projects/${PROJECT_A.id}/tasks`) return jsonResponse([])
      if (method === 'POST' && url === `/api/projects/${PROJECT_A.id}/tasks`) return jsonResponse(createdTask, 201)
      throw new Error(`Unexpected request: ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    await screen.findByText('No tasks created yet.')

    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }))
    const dialog = screen.getByRole('dialog', { name: 'Create Task' })
    fireEvent.change(within(dialog).getByLabelText(/Task Title/), { target: { value: 'New durable task' } })
    fireEvent.change(within(dialog).getByLabelText(/Objective/), { target: { value: 'Ship durable state.' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Task' }))

    expect(await screen.findByText('New durable task')).toBeInTheDocument()

    const postCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')
    expect(postCall?.[0]).toBe(`/api/projects/${PROJECT_A.id}/tasks`)
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
      title: 'New durable task',
      objective: 'Ship durable state.',
    })
  })

  it('creates a durable Run without claiming executor activity', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method?.toUpperCase() ?? 'GET'
      if (method === 'GET' && url === '/api/projects') return jsonResponse([PROJECT_A])
      if (method === 'GET' && url === `/api/projects/${PROJECT_A.id}/tasks`) return jsonResponse([TASK_A])
      if (method === 'GET' && url === `/api/tasks/${TASK_A.id}/runs`) return jsonResponse([])
      if (method === 'POST' && url === `/api/tasks/${TASK_A.id}/runs`) return jsonResponse(RUN_A, 201)
      throw new Error(`Unexpected request: ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    await screen.findByText('Task A')

    fireEvent.click(screen.getByRole('button', { name: 'Create run for Task A' }))
    const dialog = screen.getByRole('dialog', { name: 'Create Run' })
    expect(dialog).toHaveTextContent('Creation alone does not start workflow execution.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Run' }))

    await waitFor(() => expect(screen.getByText('CREATED')).toBeInTheDocument())
    expect(fetchMock.mock.calls.some(([input, options]) => requestUrl(input) === `/api/tasks/${TASK_A.id}/runs` && options?.method === 'POST')).toBe(true)
  })
})
