import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    ).toHaveClass('dock-collapsed')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Start Run' })).toBeDisabled()
  })

  it('makes Universal Composer create durable planning UI without starting a Run', async () => {
    const project = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'TDP',
      repository: { name: 'technical-documentation-platform' },
      default_branch: 'main',
      preferred_executor_id: null,
      default_workflow_id: null,
      status: 'ACTIVE',
      created_at: '2026-09-27T08:00:00Z',
      updated_at: '2026-09-27T08:00:00Z',
      archived_at: null,
    }
    const executor = {
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'REFERENCE',
      name: 'Reference Executor',
      status: 'AVAILABLE',
      runtime_version: '1',
      health_summary: 'Available.',
      last_check: '2026-09-27T08:00:00Z',
      capabilities: [],
      security_limitations: [],
    }
    const profiles = [
      {
        id: '33333333-3333-4333-8333-333333333331',
        key: 'product-manager',
        name: 'Product Manager',
        description: 'Product planning.',
        default_access_mode: 'READ_ONLY',
        version: 1,
        status: 'ACTIVE',
      },
      {
        id: '33333333-3333-4333-8333-333333333332',
        key: 'system-analyst',
        name: 'System Analyst',
        description: 'System analysis.',
        default_access_mode: 'READ_ONLY',
        version: 1,
        status: 'ACTIVE',
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        key: 'principal-engineer',
        name: 'Principal Engineer',
        description: 'Architecture.',
        default_access_mode: 'READ_ONLY',
        version: 1,
        status: 'ACTIVE',
      },
      {
        id: '33333333-3333-4333-8333-333333333334',
        key: 'backend-engineer',
        name: 'Backend Engineer',
        description: 'Implementation.',
        default_access_mode: 'WRITE',
        version: 1,
        status: 'ACTIVE',
      },
    ]
    const thread = {
      id: '44444444-4444-4444-8444-444444444444',
      project_id: project.id,
      requested_intent: 'AUTO',
      resolved_intent: null,
      status: 'OPEN',
      title: 'Continue TDP',
      timezone: 'Asia/Jakarta',
      executor_id: executor.id,
      workflow_id: null,
      created_at: '2026-09-27T08:01:00Z',
      updated_at: '2026-09-27T08:01:00Z',
      completed_at: null,
    }
    const message = {
      id: '55555555-5555-4555-8555-555555555555',
      thread_id: thread.id,
      actor_type: 'USER',
      role_key: null,
      message_kind: 'USER_PROMPT',
      content: 'Lanjutkan project TDP yang sudah lama tidak kita handle.',
      created_at: '2026-09-27T08:01:01Z',
    }
    const proposedTeam = {
      id: '66666666-6666-4666-8666-666666666666',
      thread_id: thread.id,
      phase: 'PLANNING',
      status: 'PROPOSED',
      rationale_summary: 'Start with a small planning cell.',
      created_at: '2026-09-27T08:01:02Z',
      decided_at: null,
      members: [
        {
          role_key: 'product-manager',
          disposition: 'INCLUDED',
          reason: 'Own scope and user decisions.',
          order_hint: 0,
        },
        {
          role_key: 'system-analyst',
          disposition: 'INCLUDED',
          reason: 'Separate facts from assumptions.',
          order_hint: 1,
        },
        {
          role_key: 'principal-engineer',
          disposition: 'INCLUDED',
          reason: 'Set technical boundaries.',
          order_hint: 2,
        },
        {
          role_key: 'backend-engineer',
          disposition: 'DEFERRED',
          reason: 'Implementation waits for approved scope.',
          order_hint: 3,
        },
      ],
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url

        if (url === '/api/projects') return jsonResponse([project])
        if (url === '/api/executors') return jsonResponse([executor])
        if (url === '/api/agent-profiles') return jsonResponse(profiles)
        if (url === '/api/composer/threads') return jsonResponse(thread)
        if (url === `/api/composer/threads/${thread.id}/messages`) {
          return jsonResponse(message)
        }
        if (url === `/api/composer/threads/${thread.id}/prepare`) {
          return jsonResponse({
            thread: {
              ...thread,
              resolved_intent: 'PLAN',
              status: 'ACTIVE',
            },
            resolution: {
              resolved_intent: 'PLAN',
              reason_summary: 'AUTO conservatively selected PLAN.',
              requires_user_action: false,
            },
            team_proposal: proposedTeam,
            artifacts: [
              {
                id: '77777777-7777-4777-8777-777777777771',
                thread_id: thread.id,
                artifact_type: 'BRIEF',
                title: 'Project re-entry brief',
                content: {
                  project: 'TDP',
                  repository_state: 'NOT_INSPECTED_IN_PHASE_9C',
                },
                author_role_key: 'system-analyst',
                status: 'OPEN',
                created_at: '2026-09-27T08:01:02Z',
                updated_at: '2026-09-27T08:01:02Z',
              },
              {
                id: '77777777-7777-4777-8777-777777777772',
                thread_id: thread.id,
                artifact_type: 'ACTION',
                title: 'Deferred implementation',
                content: {
                  state: 'DEFERRED',
                  roles: 'backend-engineer',
                },
                author_role_key: 'product-manager',
                status: 'OPEN',
                created_at: '2026-09-27T08:01:02Z',
                updated_at: '2026-09-27T08:01:02Z',
              },
            ],
            requirements: [],
          })
        }
        if (url === `/api/team-proposals/${proposedTeam.id}/accept`) {
          return jsonResponse({
            ...proposedTeam,
            status: 'ACCEPTED',
            decided_at: '2026-09-27T08:02:00Z',
          })
        }

        throw new Error(`Unexpected fetch call in test: ${url}`)
      }),
    )

    render(<App initialPath="/office" />)

    await screen.findByRole('region', { name: 'Universal Composer' })
    await waitFor(() => {
      expect(screen.getByLabelText('Composer project')).toHaveValue(project.id)
    })

    const composer = screen.getByRole('region', { name: 'Universal Composer' })
    const input = within(composer).getByLabelText('Ask Agent Office')
    fireEvent.change(input, {
      target: { value: 'Lanjutkan project TDP yang sudah lama tidak kita handle.' },
    })

    const send = within(composer).getByRole('button', { name: 'Send' })
    expect(send).toBeEnabled()
    fireEvent.click(send)

    const planningTeam = await screen.findByRole('region', {
      name: 'Planning team proposal',
    })
    expect(within(planningTeam).getByText('Product Manager')).toBeInTheDocument()
    expect(within(planningTeam).getByText('Backend Engineer')).toBeInTheDocument()
    expect(within(planningTeam).getByText('DEFERRED')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Deferred' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start Run' })).toBeDisabled()

    fireEvent.click(within(planningTeam).getByRole('button', { name: 'Accept team' }))
    expect(await within(planningTeam).findByText('ACCEPTED')).toBeInTheDocument()
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
