import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import type { Project } from '../api'
import { Router } from '../router/Router'
import { ProjectsPage } from './ProjectsPage'

const ACTIVE_PROJECT: Project = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Agent Office',
  repository: {
    name: 'agent-office',
  },
  default_branch: 'main',
  preferred_executor_id: null,
  default_workflow_id: null,
  status: 'ACTIVE',
  created_at: '2026-09-15T08:00:00Z',
  updated_at: '2026-09-15T08:00:00Z',
  archived_at: null,
}

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function requestUrl(
  input: RequestInfo | URL,
): string {
  if (typeof input === 'string') {
    return input
  }

  if (input instanceof URL) {
    return input.toString()
  }

  return input.url
}


function renderProjectsPage() {
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

describe('ProjectsPage backend integration', () => {
  it('shows a truthful loading state', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>(() => {
            // Deliberately unresolved.
          }),
      ),
    )

    renderProjectsPage()

    expect(
      screen.getByText('Loading project registry...'),
    ).toBeInTheDocument()
  })

  it('shows the empty state after a successful empty response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse([])),
    )

    renderProjectsPage()

    expect(
      await screen.findByText(
        'No projects registered yet.',
      ),
    ).toBeInTheDocument()
  })

  it('renders projects returned by the backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse([ACTIVE_PROJECT]),
        ),
    )

    renderProjectsPage()

    expect(
      await screen.findByText('Agent Office'),
    ).toBeInTheDocument()

    expect(
      screen.getByText('agent-office'),
    ).toBeInTheDocument()

    expect(
      screen.getByText('Active'),
    ).toBeInTheDocument()
  })

  it('shows an API error and can retry safely', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse([]))

    vi.stubGlobal('fetch', fetchMock)

    renderProjectsPage()

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent(
      'Internal server error occurred on the backend.',
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Retry',
      }),
    )

    expect(
      await screen.findByText(
        'No projects registered yet.',
      ),
    ).toBeInTheDocument()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('registers a project using the real API contract', async () => {
    const fetchMock = vi.fn(
      async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        const url = requestUrl(input)
        const method =
          init?.method?.toUpperCase() ?? 'GET'

        if (
          method === 'GET' &&
          url.endsWith('/api/projects')
        ) {
          return jsonResponse([])
        }

        if (
          method === 'POST' &&
          url.endsWith('/api/projects')
        ) {
          return jsonResponse(
            ACTIVE_PROJECT,
            201,
          )
        }

        throw new Error(
          `Unexpected request: ${method} ${url}`,
        )
      },
    )

    vi.stubGlobal('fetch', fetchMock)

    renderProjectsPage()

    await screen.findByText(
      'No projects registered yet.',
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Register Project',
      }),
    )

    const dialog = screen.getByRole('dialog', {
      name: 'Register Project',
    })

    fireEvent.change(
      within(dialog).getByLabelText(
        /Project Name/,
      ),
      {
        target: {
          value: 'Agent Office',
        },
      },
    )

    fireEvent.change(
      within(dialog).getByLabelText(
        /Local Repository Path/,
      ),
      {
        target: {
          value: '/tmp/agent-office',
        },
      },
    )

    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Register Project',
      }),
    )

    expect(
      await screen.findByText('Agent Office'),
    ).toBeInTheDocument()

    const postCall =
      fetchMock.mock.calls.find(
        ([, options]) =>
          options?.method === 'POST',
      )

    expect(postCall).toBeDefined()
    expect(postCall?.[0]).toBe('/api/projects')

    expect(
      JSON.parse(String(postCall?.[1]?.body)),
    ).toEqual({
      name: 'Agent Office',
      repository_path: '/tmp/agent-office',
    })
  })

  it.each([
    [
      400,
      'Repository is not a valid Git repository.',
      'Repository is not a valid Git repository.',
    ],
    [
      409,
      'Already registered.',
      'This repository is already registered as a project.',
    ],
    [
      422,
      'Project validation failed.',
      'Project validation failed.',
    ],
  ])(
    'shows a safe registration error for HTTP %i',
    async (
      status,
      detail,
      expectedMessage,
    ) => {
      const fetchMock = vi.fn(
        async (
          input: RequestInfo | URL,
          init?: RequestInit,
        ) => {
          const url = requestUrl(input)
          const method =
            init?.method?.toUpperCase() ?? 'GET'

          if (
            method === 'GET' &&
            url.endsWith('/api/projects')
          ) {
            return jsonResponse([])
          }

          if (
            method === 'POST' &&
            url.endsWith('/api/projects')
          ) {
            return jsonResponse(
              { detail },
              status,
            )
          }

          throw new Error(
            `Unexpected request: ${method} ${url}`,
          )
        },
      )

      vi.stubGlobal('fetch', fetchMock)

      renderProjectsPage()

      await screen.findByText(
        'No projects registered yet.',
      )

      fireEvent.click(
        screen.getByRole('button', {
          name: 'Register Project',
        }),
      )

      const dialog = screen.getByRole(
        'dialog',
        {
          name: 'Register Project',
        },
      )

      fireEvent.change(
        within(dialog).getByLabelText(
          /Project Name/,
        ),
        {
          target: {
            value: 'Project',
          },
        },
      )

      fireEvent.change(
        within(dialog).getByLabelText(
          /Local Repository Path/,
        ),
        {
          target: {
            value: '/tmp/project',
          },
        },
      )

      fireEvent.click(
        within(dialog).getByRole('button', {
          name: 'Register Project',
        }),
      )

      expect(
        await within(dialog).findByRole(
          'alert',
        ),
      ).toHaveTextContent(expectedMessage)
    },
  )

  it('navigates from a project to its scoped Task registry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse([ACTIVE_PROJECT])),
    )

    renderProjectsPage()
    await screen.findByText('Agent Office')

    fireEvent.click(
      screen.getByRole('button', {
        name: 'View tasks for Agent Office',
      }),
    )

    expect(window.location.pathname).toBe('/tasks')
    expect(window.location.search).toBe(`?project=${ACTIVE_PROJECT.id}`)
  })

  it('archives a project without deleting its history row', async () => {
    const archivedProject: Project = {
      ...ACTIVE_PROJECT,
      status: 'ARCHIVED',
      updated_at: '2026-09-15T09:00:00Z',
      archived_at: '2026-09-15T09:00:00Z',
    }

    const fetchMock = vi.fn(
      async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        const url = requestUrl(input)
        const method =
          init?.method?.toUpperCase() ?? 'GET'

        if (
          method === 'GET' &&
          url.endsWith('/api/projects')
        ) {
          return jsonResponse([
            ACTIVE_PROJECT,
          ])
        }

        if (
          method === 'POST' &&
          url.endsWith(
            `/api/projects/${ACTIVE_PROJECT.id}/archive`,
          )
        ) {
          return jsonResponse(
            archivedProject,
          )
        }

        throw new Error(
          `Unexpected request: ${method} ${url}`,
        )
      },
    )

    vi.stubGlobal('fetch', fetchMock)

    renderProjectsPage()

    await screen.findByText('Agent Office')

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Archive project Agent Office',
      }),
    )

    const dialog = screen.getByRole('dialog', {
      name: 'Archive Project',
    })

    expect(dialog).toHaveTextContent(
      'Archiving is not deletion.',
    )

    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Archive Project',
      }),
    )

    await waitFor(() => {
      expect(
        screen.getByTestId(
          `project-row-${ACTIVE_PROJECT.id}`,
        ),
      ).toBeInTheDocument()

      expect(
        screen.getByText('Archived'),
      ).toBeInTheDocument()
    })

    expect(
      screen.queryByRole('button', {
        name: 'Archive project Agent Office',
      }),
    ).not.toBeInTheDocument()

    expect(
      fetchMock.mock.calls.some(
        ([, options]) =>
          options?.method === 'DELETE',
      ),
    ).toBe(false)
  })
})
