import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { Router } from '../router/Router'
import { Header } from './Header'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface ShellFixture {
  projects?: unknown[]
  tasksByProject?: Record<string, unknown[]>
  runsByTask?: Record<string, unknown[]>
  profiles?: unknown[]
  createdTask?: unknown
}

const ACTIVE_PROJECT = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'ReserveHub',
  status: 'ACTIVE',
}

const CASHBACK_TASK = {
  id: '22222222-2222-4222-8222-222222222222',
  project_id: ACTIVE_PROJECT.id,
  title: 'Add per-order cashback campaign',
  objective: 'Earn cashback from a store campaign.',
}

const CASHBACK_RUN = {
  id: '33333333-3333-4333-8333-333333333333',
  task_id: CASHBACK_TASK.id,
  status: 'RUNNING',
}

const BACKEND_PROFILE = {
  id: '44444444-4444-4444-8444-444444444444',
  key: 'backend-engineer',
  name: 'Backend Engineer',
  description: 'Implementation work.',
}

function stubShellApi(fixture: ShellFixture = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    const method = (init?.method ?? 'GET').toUpperCase()

    if (url === '/health' || url.endsWith('/health')) {
      return jsonResponse({ status: 'ok' })
    }
    if (url === '/api/projects') return jsonResponse(fixture.projects ?? [])
    if (url === '/api/agent-profiles') return jsonResponse(fixture.profiles ?? [])

    const taskList = url.match(/^\/api\/projects\/([^/]+)\/tasks$/)
    if (taskList) {
      if (method === 'POST') {
        if (!fixture.createdTask) throw new Error('no created task in fixture')
        return jsonResponse(fixture.createdTask)
      }
      return jsonResponse(fixture.tasksByProject?.[taskList[1]] ?? [])
    }

    const runList = url.match(/^\/api\/tasks\/([^/]+)\/runs$/)
    if (runList) {
      return jsonResponse(fixture.runsByTask?.[runList[1]] ?? [])
    }

    throw new Error(`Unexpected fetch call in shell test: ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function primaryLinkLabels(): string[] {
  const nav = screen.getByRole('navigation', { name: 'Primary Navigation' })
  return Array.from(
    nav.querySelectorAll('.target-primary-link'),
  ).map((link) => link.textContent ?? '')
}

beforeEach(() => {
  window.history.pushState({}, '', '/')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('target shell landmarks and top nav', () => {
  it('renders banner, primary nav, search, New Task, and generic Local owner', () => {
    stubShellApi()

    render(
      <Router initialPath="/projects">
        <Header isNavOpen={false} onToggleNav={() => undefined} />
      </Router>,
    )

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: 'Primary Navigation' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('searchbox', { name: 'Search tasks, runs, and agents' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ New Task' })).toBeInTheDocument()

    const owner = screen.getByLabelText('Local owner')
    expect(owner).toHaveTextContent('LO')
    expect(owner.textContent).not.toContain('@')
  })

  it('orders primary routes Office, Board, Inbox, KPI, Projects', () => {
    stubShellApi()

    render(
      <Router initialPath="/projects">
        <Header isNavOpen={false} onToggleNav={() => undefined} />
      </Router>,
    )

    expect(primaryLinkLabels()).toEqual([
      'Office',
      'Board',
      'Inbox',
      'KPI',
      'Projects',
    ])
  })

  it('exposes low-frequency routes through More and marks the active route', () => {
    stubShellApi()

    render(
      <Router initialPath="/board">
        <Header isNavOpen={false} onToggleNav={() => undefined} />
      </Router>,
    )

    const nav = screen.getByRole('navigation', { name: 'Primary Navigation' })
    expect(
      within(nav).getByRole('link', { name: 'Board' }),
    ).toHaveAttribute('aria-current', 'page')
    expect(
      within(nav).getByRole('link', { name: 'Office' }),
    ).not.toHaveAttribute('aria-current')

    for (const label of [
      'Overview',
      'Runs',
      'Tasks',
      'Agents',
      'Workflows',
      'Executors',
      'Activity',
      'Evidence',
      'Audit',
      'Settings',
    ]) {
      expect(
        within(nav).getByRole('link', { name: label }),
      ).toBeInTheDocument()
    }
  })

  it('keeps canonical Office, Inbox, Board, and KPI destinations reachable', () => {
    stubShellApi()

    render(
      <Router initialPath="/projects">
        <Header isNavOpen={false} onToggleNav={() => undefined} />
      </Router>,
    )

    const nav = screen.getByRole('navigation', { name: 'Primary Navigation' })
    expect(within(nav).getByRole('link', { name: 'Office' })).toHaveAttribute(
      'href',
      '/office',
    )
    expect(within(nav).getByRole('link', { name: 'Board' })).toHaveAttribute(
      'href',
      '/board',
    )
    expect(within(nav).getByRole('link', { name: 'Inbox' })).toHaveAttribute(
      'href',
      '/inbox',
    )
    expect(within(nav).getByRole('link', { name: 'KPI' })).toHaveAttribute(
      'href',
      '/kpi',
    )
  })
})

describe('global New Task', () => {
  it('opens the existing modal and routes to the canonical task after success', async () => {
    const createdTask = {
      id: '55555555-5555-4555-8555-555555555555',
      project_id: ACTIVE_PROJECT.id,
      title: 'Refactor auth middleware',
      objective: 'Centralize token checks.',
    }
    stubShellApi({ projects: [ACTIVE_PROJECT], createdTask })

    render(
      <Router initialPath="/office">
        <Header isNavOpen={false} onToggleNav={() => undefined} />
      </Router>,
    )

    fireEvent.click(screen.getByRole('button', { name: '+ New Task' }))
    const dialog = await screen.findByRole('dialog', { name: 'Create Task' })

    const projectSelect = await within(dialog).findByLabelText(/Project/)
    await within(dialog).findByRole('option', { name: 'ReserveHub' })
    fireEvent.change(projectSelect, { target: { value: ACTIVE_PROJECT.id } })
    fireEvent.change(within(dialog).getByLabelText(/Task Title/), {
      target: { value: createdTask.title },
    })
    fireEvent.change(within(dialog).getByLabelText(/Objective/), {
      target: { value: createdTask.objective },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Create Task' }),
    )

    await waitFor(() => {
      expect(window.location.pathname).toBe(`/tasks/${createdTask.id}`)
    })
    expect(screen.queryByRole('dialog', { name: 'Create Task' })).not.toBeInTheDocument()
  })
})

describe('client-only global search', () => {
  const searchFixture: ShellFixture = {
    projects: [ACTIVE_PROJECT],
    tasksByProject: { [ACTIVE_PROJECT.id]: [CASHBACK_TASK] },
    runsByTask: { [CASHBACK_TASK.id]: [CASHBACK_RUN] },
    profiles: [BACKEND_PROFILE],
  }

  it('matches canonical tasks, runs, and profiles without inventing entries', async () => {
    stubShellApi(searchFixture)

    render(
      <Router initialPath="/projects">
        <Header isNavOpen={false} onToggleNav={() => undefined} />
      </Router>,
    )

    const search = screen.getByRole('searchbox', {
      name: 'Search tasks, runs, and agents',
    })

    fireEvent.change(search, { target: { value: 'cashback' } })
    const cashbackResults = await screen.findAllByRole('option', {
      name: /Add per-order cashback campaign/,
    })
    expect(cashbackResults.length).toBeGreaterThan(0)
    expect(cashbackResults.length).toBeLessThanOrEqual(8)
    for (const result of cashbackResults) {
      expect(result.textContent).toMatch(/Add per-order cashback campaign/)
    }

    fireEvent.change(search, { target: { value: 'backend' } })
    expect(
      await screen.findByRole('option', { name: /Backend Engineer/ }),
    ).toBeInTheDocument()
  })

  it('navigates to the canonical record and clears the query on selection', async () => {
    stubShellApi(searchFixture)

    render(
      <Router initialPath="/projects">
        <Header isNavOpen={false} onToggleNav={() => undefined} />
      </Router>,
    )

    const search = screen.getByRole('searchbox', {
      name: 'Search tasks, runs, and agents',
    })
    fireEvent.change(search, { target: { value: 'cashback' } })

    const results = await screen.findAllByRole('option', {
      name: /Add per-order cashback campaign/,
    })
    const taskResult = results.find((result) =>
      result.textContent?.includes(CASHBACK_TASK.title),
    )
    expect(taskResult).toBeDefined()
    fireEvent.click(taskResult!)

    expect(window.location.pathname).toBe(`/tasks/${CASHBACK_TASK.id}`)
    expect(
      screen.getByRole('searchbox', { name: 'Search tasks, runs, and agents' }),
    ).toHaveValue('')
  })

  it('moves through results with ArrowDown/ArrowUp and activates with Enter', async () => {
    stubShellApi(searchFixture)

    render(
      <Router initialPath="/projects">
        <Header isNavOpen={false} onToggleNav={() => undefined} />
      </Router>,
    )

    const search = screen.getByRole('searchbox', {
      name: 'Search tasks, runs, and agents',
    })
    fireEvent.change(search, { target: { value: 'cashback' } })

    const options = await screen.findAllByRole('option', {
      name: /Add per-order cashback campaign|Run 33333333/,
    })
    expect(options.length).toBeGreaterThan(0)

    fireEvent.keyDown(search, { key: 'ArrowDown' })
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(search, { key: 'ArrowUp' })
    expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(window.location.pathname).toBe(`/tasks/${CASHBACK_TASK.id}`)
  })

  it('degrades empty registries to no results and closes on Escape', async () => {
    stubShellApi()

    render(
      <Router initialPath="/projects">
        <Header isNavOpen={false} onToggleNav={() => undefined} />
      </Router>,
    )

    const search = screen.getByRole('searchbox', {
      name: 'Search tasks, runs, and agents',
    })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'a' } })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'cashback' } })
    expect(await screen.findByText('No matching records')).toBeInTheDocument()

    fireEvent.keyDown(search, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(search).toHaveValue('')
  })
})
