import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Project, Run, Task } from '../api'
import { Router } from '../router/Router'
import { ProjectsPage } from './ProjectsPage'

const PROJECT: Project = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Agent Office',
  repository: { name: 'agent-office' },
  default_branch: 'main',
  preferred_executor_id: null,
  default_workflow_id: null,
  status: 'ACTIVE',
  created_at: '2026-09-15T08:00:00Z',
  updated_at: '2026-09-15T08:00:00Z',
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
  created_at: '2026-09-15T09:00:00Z',
  updated_at: '2026-09-15T09:00:00Z',
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
  started_at: '2026-09-15T10:00:00Z',
  completed_at: null,
  cancel_requested_at: null,
  remediation_cycles_used: 0,
  candidate_workspace_id: null,
  created_at: '2026-09-15T10:00:00Z',
  updated_at: '2026-09-15T10:00:00Z',
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

function renderPage() {
  return render(
    <Router initialPath="/projects">
      <ProjectsPage />
    </Router>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ProjectsPage Phase 5 registry', () => {
  it('shows a truthful loading state', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)))
    renderPage()
    expect(screen.getByText('Loading project registry...')).toBeInTheDocument()
  })

  it('shows the empty state after a successful empty response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))
    renderPage()
    expect(await screen.findByText('No projects registered yet.')).toBeInTheDocument()
  })

  it('renders required registry fields including factual active Run count', async () => {
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

    renderPage()

    expect(await screen.findByText('Agent Office')).toBeInTheDocument()
    expect(screen.getByText('agent-office')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Active runs' })).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('Built-in default')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('navigates to required Project Detail from the registry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url === '/api/projects') return jsonResponse([PROJECT])
        if (url === `/api/projects/${PROJECT.id}/tasks`) return jsonResponse([])
        throw new Error(`Unexpected request: ${url}`)
      }),
    )

    renderPage()
    await screen.findByText('Agent Office')
    fireEvent.click(screen.getByRole('button', { name: 'Open project Agent Office' }))
    expect(window.location.pathname).toBe(`/projects/${PROJECT.id}`)
  })

  it('registers a project through the backend contract', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method?.toUpperCase() ?? 'GET'
      if (method === 'GET' && url === '/api/projects') return jsonResponse([])
      if (method === 'POST' && url === '/api/projects') return jsonResponse(PROJECT, 201)
      throw new Error(`Unexpected request: ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    await screen.findByText('No projects registered yet.')
    fireEvent.click(screen.getByRole('button', { name: 'Register Project' }))

    const dialog = screen.getByRole('dialog', { name: 'Register Project' })
    fireEvent.change(within(dialog).getByLabelText(/Project Name/), {
      target: { value: 'Agent Office' },
    })
    fireEvent.change(within(dialog).getByLabelText(/Local Repository Path/), {
      target: { value: '/tmp/agent-office' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Register Project' }))

    expect(await screen.findByText('Agent Office')).toBeInTheDocument()
    const postCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')
    expect(postCall?.[0]).toBe('/api/projects')
  })

  it('archives without deleting project history', async () => {
    const archived: Project = {
      ...PROJECT,
      status: 'ARCHIVED',
      archived_at: '2026-09-15T11:00:00Z',
      updated_at: '2026-09-15T11:00:00Z',
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method?.toUpperCase() ?? 'GET'
      if (method === 'GET' && url === '/api/projects') return jsonResponse([PROJECT])
      if (method === 'GET' && url === `/api/projects/${PROJECT.id}/tasks`) return jsonResponse([])
      if (method === 'POST' && url === `/api/projects/${PROJECT.id}/archive`) return jsonResponse(archived)
      throw new Error(`Unexpected request: ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    await screen.findByText('Agent Office')
    fireEvent.click(screen.getByRole('button', { name: 'Archive project Agent Office' }))

    const dialog = screen.getByRole('dialog', { name: 'Archive Project' })
    expect(dialog).toHaveTextContent('Archiving is not deletion.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive Project' }))

    await waitFor(() => expect(screen.getByText('Archived')).toBeInTheDocument())
    expect(screen.getByTestId(`project-row-${PROJECT.id}`)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false)
  })
})
