import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url

      const method = init?.method?.toUpperCase() ?? 'GET'

      if (method === 'GET' && url.endsWith('/api/projects')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      }

      throw new Error(`Unexpected fetch call in test: ${method} ${url}`)
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Agent Office Operations Shell (Phase 1G)', () => {

  it('renders application shell landmarks and identity', () => {
    render(<App />)

    // Skip to main content link
    const skipLink = screen.getByRole('link', { name: 'Skip to main content' })
    expect(skipLink).toBeInTheDocument()
    expect(skipLink).toHaveAttribute('href', '#main-content')

    // Semantic landmarks
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary Navigation' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()

    // Brand and Mode
    const sidebar = screen.getByRole('complementary', { name: 'Sidebar Navigation' })
    expect(within(sidebar).getByText('Agent Office')).toBeInTheDocument()
    expect(within(sidebar).getByText('Control Plane')).toBeInTheDocument()
    expect(within(sidebar).getByText('Local-First')).toBeInTheDocument()
    expect(within(sidebar).getByText('1G Shell')).toBeInTheDocument()
  })

  it('renders primary navigation with all four sections and items per IA', () => {
    render(<App />)

    const nav = screen.getByRole('navigation', { name: 'Primary Navigation' })

    // Four core sections
    expect(within(nav).getByText('WORK')).toBeInTheDocument()
    expect(within(nav).getByText('ENGINEERING')).toBeInTheDocument()
    expect(within(nav).getByText('OBSERVABILITY')).toBeInTheDocument()
    expect(within(nav).getByText('CONTROL')).toBeInTheDocument()

    // All navigation links
    const expectedLinks = [
      'Overview',
      'Projects',
      'Runs',
      'Tasks',
      'Agents',
      'Workflows',
      'Executors',
      'Activity',
      'Evidence',
      'Audit',
      'Settings',
    ]

    expectedLinks.forEach((label) => {
      const link = within(nav).getByRole('link', { name: label })
      expect(link).toBeInTheDocument()
    })
  })

  it('indicates the active navigation item with aria-current="page"', () => {
    render(<App initialPath="/overview" />)

    const nav = screen.getByRole('navigation', { name: 'Primary Navigation' })
    const overviewLink = within(nav).getByRole('link', { name: 'Overview' })
    const projectsLink = within(nav).getByRole('link', { name: 'Projects' })

    expect(overviewLink).toHaveAttribute('aria-current', 'page')
    expect(projectsLink).not.toHaveAttribute('aria-current')
  })

  it('navigates to Projects and displays truthful empty state', async () => {
    render(<App initialPath="/overview" />)

    const nav = screen.getByRole('navigation', { name: 'Primary Navigation' })
    const projectsLink = within(nav).getByRole('link', { name: 'Projects' })

    fireEvent.click(projectsLink)

    expect(projectsLink).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument()
    expect(await screen.findByText('No projects registered yet.')).toBeInTheDocument()

    // Table headers per IA
    expect(screen.getByRole('columnheader', { name: 'Project' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Repository' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Default branch' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Preferred executor' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Default workflow' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Active runs' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Action' })).toBeInTheDocument()
  })

  it('navigates to Runs and displays truthful empty state', () => {
    render(<App initialPath="/overview" />)

    const nav = screen.getByRole('navigation', { name: 'Primary Navigation' })
    const runsLink = within(nav).getByRole('link', { name: 'Runs' })

    fireEvent.click(runsLink)

    expect(runsLink).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { level: 1, name: 'Runs' })).toBeInTheDocument()
    expect(screen.getByText('No runs have been created.')).toBeInTheDocument()

    // Table headers per IA
    expect(screen.getByRole('columnheader', { name: 'Run' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Stage' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'State' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Primary executor' })).toBeInTheDocument()
  })

  it('navigates to Executors and displays truthful unintegrated state', () => {
    render(<App initialPath="/overview" />)

    const nav = screen.getByRole('navigation', { name: 'Primary Navigation' })
    const executorsLink = within(nav).getByRole('link', { name: 'Executors' })

    fireEvent.click(executorsLink)

    expect(executorsLink).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { level: 1, name: 'Executors' })).toBeInTheDocument()
    expect(
      screen.getByText('Executor information will be available after backend integration.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Agent Office interfaces with deterministic ReferenceExecutor and external AI coding engines via provider-neutral adapters.',
      ),
    ).toBeInTheDocument()
  })

  it('navigates to Settings and displays safety and architecture defaults', () => {
    render(<App initialPath="/overview" />)

    const nav = screen.getByRole('navigation', { name: 'Primary Navigation' })
    const settingsLink = within(nav).getByRole('link', { name: 'Settings' })

    fireEvent.click(settingsLink)

    expect(settingsLink).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('127.0.0.1')).toBeInTheDocument()
    expect(screen.getByText('SQLite')).toBeInTheDocument()
    expect(screen.getByText('Main Working Tree Protection')).toBeInTheDocument()
  })

  it('displays not found page for non-existent route with recovery link', () => {
    render(<App initialPath="/unknown-route" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Page Not Found' })).toBeInTheDocument()
    expect(screen.getByText('Route does not exist')).toBeInTheDocument()

    const returnLink = screen.getByRole('link', { name: 'Return to Overview' })
    fireEvent.click(returnLink)

    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument()
  })

  it('renders Overview page with truthful attention, active runs, executor status, and activity sections', () => {
    render(<App initialPath="/overview" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByText('No items requiring attention')).toBeInTheDocument()
    expect(screen.getByText('No active runs in progress')).toBeInTheDocument()
    expect(screen.getByText('No recent events recorded')).toBeInTheDocument()
    expect(screen.getByText('Executor information will be available after backend integration')).toBeInTheDocument()
  })

  it('navigates to Tasks, Agents, Workflows, Activity, Evidence, and Audit pages with truthful empty states', () => {
    render(<App initialPath="/overview" />)

    const nav = screen.getByRole('navigation', { name: 'Primary Navigation' })

    // Tasks
    fireEvent.click(within(nav).getByRole('link', { name: 'Tasks' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Tasks' })).toBeInTheDocument()
    expect(screen.getByText('No tasks created yet.')).toBeInTheDocument()

    // Agents
    fireEvent.click(within(nav).getByRole('link', { name: 'Agents' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Agents' })).toBeInTheDocument()
    expect(screen.getByText('No agent profiles loaded.')).toBeInTheDocument()

    // Workflows
    fireEvent.click(within(nav).getByRole('link', { name: 'Workflows' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Workflows' })).toBeInTheDocument()
    expect(screen.getByText('No workflow definitions loaded.')).toBeInTheDocument()

    // Activity
    fireEvent.click(within(nav).getByRole('link', { name: 'Activity' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Activity' })).toBeInTheDocument()
    expect(screen.getByText('No events recorded.')).toBeInTheDocument()

    // Evidence
    fireEvent.click(within(nav).getByRole('link', { name: 'Evidence' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Evidence' })).toBeInTheDocument()
    expect(screen.getByText('No evidence recorded yet.')).toBeInTheDocument()

    // Audit
    fireEvent.click(within(nav).getByRole('link', { name: 'Audit' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Audit' })).toBeInTheDocument()
    expect(screen.getByText('No audit records logged.')).toBeInTheDocument()
  })

  it('supports responsive navigation toggle', () => {
    render(<App />)

    const toggleButton = screen.getByRole('button', { name: 'Toggle navigation menu' })
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(toggleButton)
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(toggleButton)
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false')
  })
})
