import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, api } from './client'
import type { Project, Run, Task } from './types'

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
  title: 'Implement task persistence',
  objective: 'Persist task ownership safely.',
  constraints: null,
  requested_workflow_id: null,
  requested_executor_id: null,
  created_at: '2026-09-16T08:00:00Z',
  updated_at: '2026-09-16T08:00:00Z',
}

const RUN: Run = {
  id: '33333333-3333-4333-8333-333333333333',
  project_id: PROJECT.id,
  task_id: TASK.id,
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
  created_at: '2026-09-16T09:00:00Z',
  updated_at: '2026-09-16T09:00:00Z',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Agent Office API client', () => {
  it('uses safe project, task, and run registry endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([PROJECT]))
      .mockResolvedValueOnce(jsonResponse([TASK]))
      .mockResolvedValueOnce(jsonResponse([RUN]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.listProjects()).resolves.toEqual([PROJECT])
    await expect(api.listTasks(PROJECT.id)).resolves.toEqual([TASK])
    await expect(api.listRuns(TASK.id)).resolves.toEqual([RUN])

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/projects',
      `/api/projects/${PROJECT.id}/tasks`,
      `/api/tasks/${TASK.id}/runs`,
    ])
  })

  it('uses canonical Phase 5 Run inspection endpoints', async () => {
    const responses = [
      RUN,
      [],
      { status: 'CREATED', complete: false, failures: [] },
      { id: 'snapshot', run_id: RUN.id, stages: [], agent_assignments: [] },
      [],
      { run_id: RUN.id, findings: [], open_blockers: 0 },
      [],
      { run_id: RUN.id, checked: false, checks: [], evidence_count: 0 },
      { events: [], next_cursor: null },
      [],
      [],
    ]
    const fetchMock = vi.fn()
    responses.forEach((body) => fetchMock.mockResolvedValueOnce(jsonResponse(body)))
    vi.stubGlobal('fetch', fetchMock)

    await api.getRun(RUN.id)
    await api.getRunStages(RUN.id)
    await api.getRunCompletionGate(RUN.id)
    await api.getRunSnapshot(RUN.id)
    await api.getRunAgents(RUN.id)
    await api.getRunFindings(RUN.id)
    await api.getRunEvidence(RUN.id)
    await api.getRunVerification(RUN.id)
    await api.getRunEvents(RUN.id)
    await api.getRunAudit(RUN.id)
    await api.getRunWorkspaces(RUN.id)

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `/api/runs/${RUN.id}`,
      `/api/runs/${RUN.id}/stages`,
      `/api/runs/${RUN.id}/completion-gates`,
      `/api/runs/${RUN.id}/snapshot`,
      `/api/runs/${RUN.id}/agents`,
      `/api/runs/${RUN.id}/findings`,
      `/api/runs/${RUN.id}/evidence`,
      `/api/runs/${RUN.id}/verification`,
      `/api/runs/${RUN.id}/events`,
      `/api/runs/${RUN.id}/audit`,
      `/api/runs/${RUN.id}/workspaces`,
    ])
  })

  it('uses bounded backend control endpoints rather than frontend-owned state', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ...RUN, status: 'RUNNING' }))
      .mockResolvedValueOnce(jsonResponse({ ...RUN, status: 'CANCELLED' }))
      .mockResolvedValueOnce(jsonResponse({ ...RUN, status: 'RUNNING' }))
      .mockResolvedValueOnce(jsonResponse({ ...RUN, status: 'BLOCKED' }))
    vi.stubGlobal('fetch', fetchMock)

    await api.startRun(RUN.id)
    await api.cancelRun(RUN.id)
    await api.resumeRun(RUN.id)
    await api.reconcileRun(RUN.id)

    expect(fetchMock.mock.calls.map(([url, options]) => [url, options?.method])).toEqual([
      [`/api/runs/${RUN.id}/start`, 'POST'],
      [`/api/runs/${RUN.id}/cancel`, 'POST'],
      [`/api/runs/${RUN.id}/resume`, 'POST'],
      [`/api/runs/${RUN.id}/reconcile`, 'POST'],
    ])
  })

  it('connects AgentProfile, Executor, Workflow, and bounded Finding actions', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ id: 'finding-1', status: 'ACCEPTED_RISK' }))
    vi.stubGlobal('fetch', fetchMock)

    await api.listAgentProfiles()
    await api.listExecutors()
    await api.listWorkflows()
    await api.acceptFindingRisk('finding-1', 'Reviewed and accepted.')

    expect(fetchMock.mock.calls[0][0]).toBe('/api/agent-profiles')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/executors')
    expect(fetchMock.mock.calls[2][0]).toBe('/api/workflows')
    expect(fetchMock.mock.calls[3]).toEqual([
      '/api/findings/finding-1/accept-risk',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'Reviewed and accepted.' }),
      }),
    ])
  })

  it('creates durable resources using POST contracts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(PROJECT, 201))
      .mockResolvedValueOnce(jsonResponse(TASK, 201))
      .mockResolvedValueOnce(jsonResponse(RUN, 201))
    vi.stubGlobal('fetch', fetchMock)

    await api.registerProject({ name: PROJECT.name, repository_path: '/tmp/agent-office' })
    await api.createTask(PROJECT.id, {
      title: TASK.title,
      objective: TASK.objective,
    })
    await api.createRun(TASK.id)

    expect(fetchMock.mock.calls.every(([, options]) => options?.method === 'POST')).toBe(true)
  })

  it.each([
    [400, 'Invalid request.'],
    [409, 'Request conflicts with the current resource state.'],
    [422, 'Validation failed for request data.'],
  ])('maps HTTP %i into a controlled ApiError', async (status, expectedMessage) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, status)))

    await expect(api.listProjects()).rejects.toMatchObject({
      status,
      message: expectedMessage,
    })
  })

  it('keeps network failure distinct from HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    try {
      await api.listProjects()
      throw new Error('Expected ApiError')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({ status: 0 })
      expect((error as Error).message).toContain('Unable to reach Agent Office backend')
    }
  })
})
