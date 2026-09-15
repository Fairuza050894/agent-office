import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, api } from './client'
import type { Project } from './types'

const PROJECT: Project = {
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

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Agent Office API client', () => {
  it('loads projects from the safe project endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse([PROJECT]))

    vi.stubGlobal('fetch', fetchMock)

    await expect(api.listProjects()).resolves.toEqual([PROJECT])

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
        }),
      }),
    )
  })

  it('registers a project with only name and repository path', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(PROJECT, 201))

    vi.stubGlobal('fetch', fetchMock)

    const request = {
      name: 'Agent Office',
      repository_path: '/tmp/agent-office',
    }

    await expect(
      api.registerProject(request),
    ).resolves.toEqual(PROJECT)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(request),
      }),
    )
  })

  it('archives through POST rather than DELETE', async () => {
    const archived: Project = {
      ...PROJECT,
      status: 'ARCHIVED',
      archived_at: '2026-09-15T09:00:00Z',
    }

    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(archived))

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      api.archiveProject(PROJECT.id),
    ).resolves.toEqual(archived)

    const [, options] = fetchMock.mock.calls[0]

    expect(options?.method).toBe('POST')
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/projects/${PROJECT.id}/archive`,
    )
  })

  it.each([
    [
      400,
      'Invalid request or invalid Git repository.',
    ],
    [
      409,
      'A project is already registered for this repository.',
    ],
    [
      422,
      'Validation failed for request data.',
    ],
  ])(
    'maps HTTP %i into a controlled ApiError',
    async (status, expectedMessage) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse({}, status)),
      )

      try {
        await api.registerProject({
          name: 'Agent Office',
          repository_path: '/tmp/repository',
        })

        throw new Error('Expected ApiError')
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError)
        expect(error).toMatchObject({
          status,
          message: expectedMessage,
        })
      }
    },
  )

  it('keeps network failure distinct from HTTP failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(
        new TypeError('Failed to fetch'),
      ),
    )

    try {
      await api.listProjects()
      throw new Error('Expected ApiError')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({
        status: 0,
      })
      expect((error as Error).message).toContain(
        'Unable to reach Agent Office backend',
      )
    }
  })
})
