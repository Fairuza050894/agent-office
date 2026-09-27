import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url

      if (url === '/api/projects') return jsonResponse([])
      if (url === '/api/executors') return jsonResponse([])
      if (url === '/api/agent-profiles') return jsonResponse([])
      if (url === '/api/workflows') return jsonResponse([])

      throw new Error(`Unexpected fetch call in test: GET ${url}`)
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Agent Office operational shell', () => {
  it('renders semantic shell landmarks and local-first product identity', () => {
    render(<App initialPath="/settings" />)

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main-content')
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary Navigation' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()

    const sidebar = screen.getByRole('complementary', { name: 'Sidebar Navigation' })
    expect(within(sidebar).getByText('Agent Office')).toBeInTheDocument()
    expect(within(sidebar).getByText('Engineering control plane')).toBeInTheDocument()
    expect(within(sidebar).getByText('Local-first')).toBeInTheDocument()
    expect(within(sidebar).getByText('Isolated workspaces')).toBeInTheDocument()
    expect(within(sidebar).queryByText('Phase 5')).not.toBeInTheDocument()
  })

  it('renders required global navigation plus Tasks utility registry', () => {
    render(<App initialPath="/settings" />)

    const nav = screen.getByRole('navigation', { name: 'Primary Navigation' })
    for (const label of [
      'Office',
      'Overview',
      'Projects',
      'Runs',
      'Agents',
      'Workflows',
      'Executors',
      'Activity',
      'Evidence',
      'Audit',
      'Settings',
      'Tasks',
    ]) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('marks the current navigation item with aria-current', () => {
    render(<App initialPath="/overview" />)
    const nav = screen.getByRole('navigation', { name: 'Primary Navigation' })
    expect(within(nav).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Projects' })).not.toHaveAttribute('aria-current')
  })

  it('renders the Phase 9A Office-first workspace shell', async () => {
    render(<App initialPath="/office" />)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Office' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Office workspace 3D environment' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Universal Composer' })).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Bottom Operations Dock' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Start Run' })).toBeDisabled()
  })

  it('renders backend-derived Overview empty states without fake KPIs', async () => {
    render(<App initialPath="/overview" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument()
    expect(await screen.findByText('No items requiring attention')).toBeInTheDocument()
    expect(screen.getByText('No active runs in progress')).toBeInTheDocument()
    expect(screen.getByText('No recent events recorded')).toBeInTheDocument()
    expect(screen.getByText('No executors registered')).toBeInTheDocument()
    expect(screen.queryByText(/AI score/i)).not.toBeInTheDocument()
  })

  it('loads engineering registries from backend-backed pages', async () => {
    render(<App initialPath="/agents" />)
    expect(await screen.findByText('No agent profiles loaded.')).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: 'Primary Navigation' })
    fireEvent.click(within(nav).getByRole('link', { name: 'Workflows' }))
    expect(await screen.findByText('No workflow definitions loaded.')).toBeInTheDocument()

    fireEvent.click(within(nav).getByRole('link', { name: 'Executors' }))
    expect(await screen.findByText('No executors registered.')).toBeInTheDocument()
  })

  it('loads observability registries from durable backend sources', async () => {
    render(<App initialPath="/activity" />)
    expect(await screen.findByText('No events recorded.')).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: 'Primary Navigation' })
    fireEvent.click(within(nav).getByRole('link', { name: 'Evidence' }))
    expect(await screen.findByText('No evidence recorded yet.')).toBeInTheDocument()

    fireEvent.click(within(nav).getByRole('link', { name: 'Audit' }))
    expect(await screen.findByText('No audit records logged.')).toBeInTheDocument()
  })

  it('shows truthful empty project, task, and run registries', async () => {
    render(<App initialPath="/projects" />)
    expect(await screen.findByText('No projects registered yet.')).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: 'Primary Navigation' })
    fireEvent.click(within(nav).getByRole('link', { name: 'Tasks' }))
    expect(await screen.findByText('No tasks created yet.')).toBeInTheDocument()

    fireEvent.click(within(nav).getByRole('link', { name: 'Runs' }))
    expect(await screen.findByText('No runs have been created.')).toBeInTheDocument()
  })

  it('displays not found page with a recovery link', () => {
    render(<App initialPath="/unknown-route" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Page Not Found' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Return to Overview' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument()
  })

  it('supports responsive navigation toggle', () => {
    render(<App initialPath="/settings" />)
    const toggle = screen.getByRole('button', { name: 'Toggle navigation menu' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})
