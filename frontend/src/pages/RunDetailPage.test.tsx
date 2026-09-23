import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Project, Run, Task, RunStage, CompletionGateResponse, Finding, Evidence, AgentEvent } from '../api'
import { Router } from '../router/Router'
import { RunDetailPage } from './RunDetailPage'

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
  title: 'Test Task Title',
  objective: 'Objective A',
  constraints: null,
  requested_workflow_id: 'default_workflow',
  requested_executor_id: null,
  created_at: '2026-09-16T09:00:00Z',
  updated_at: '2026-09-16T09:00:00Z',
}

const RUN: Run = {
  id: '33333333-3333-4333-8333-333333333333',
  project_id: PROJECT.id,
  task_id: TASK.id,
  status: 'BLOCKED',
  requested_executor_id: 'TestExecutor',
  created_at: '2026-09-16T10:00:00Z',
  updated_at: '2026-09-16T10:00:00Z',
}

const RUN_STAGES: RunStage[] = [
  {
    stage_key: 'planning',
    status: 'COMPLETED',
    required: true,
    order_hint: 1,
    execution_mode: 'AUTO',
    condition: '',
    reason_code: null,
    reason_summary: null,
    started_at: '2026-09-16T10:00:00Z',
    completed_at: '2026-09-16T10:05:00Z',
  },
  {
    stage_key: 'execution',
    status: 'RUNNING',
    required: true,
    order_hint: 2,
    execution_mode: 'AUTO',
    condition: '',
    reason_code: null,
    reason_summary: null,
    started_at: '2026-09-16T10:05:00Z',
    completed_at: null,
  }
]

const COMPLETION_GATE: CompletionGateResponse = {
  status: 'PENDING',
  complete: false,
  failures: ['Missing required evidence for execution']
}

const FINDING: Finding = {
  id: '44444444-4444-4444-8444-444444444444',
  project_id: PROJECT.id,
  run_id: RUN.id,
  reviewer_agent_run_id: 'review-agent',
  category: 'Security',
  severity: 'HIGH',
  title: 'Exposed secret',
  description: 'A secret is exposed in the code.',
  status: 'OPEN',
  blocks_completion: true,
  created_at: '2026-09-16T10:06:00Z',
}

const EVIDENCE: Evidence = {
  id: '55555555-5555-4555-8555-555555555555',
  project_id: PROJECT.id,
  task_id: TASK.id,
  run_id: RUN.id,
  kind: 'TEST_RESULT',
  status: 'FAILED',
  summary: '1 tests failed.',
  created_at: '2026-09-16T10:07:00Z',
}

const EVENT: AgentEvent = {
  id: '66666666-6666-4666-8666-666666666666',
  event_type: 'agent_started',
  project_id: PROJECT.id,
  run_id: RUN.id,
  agent_run_id: 'agent-1',
  source: 'SYSTEM',
  occurred_at: '2026-09-16T10:08:00Z',
  recorded_at: '2026-09-16T10:08:01Z',
  payload: { detail: 'Agent started successfully' }
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

describe('RunDetailPage Phase 5A behavior', () => {
  it('loads run details and renders explicit unavailable semantics', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url === `/api/runs/${RUN.id}`) return jsonResponse(RUN)
        if (url === `/api/projects/${PROJECT.id}`) return jsonResponse(PROJECT)
        if (url === `/api/tasks/${TASK.id}`) return jsonResponse(TASK)
        if (url === `/api/runs/${RUN.id}/stages`) return jsonResponse([])
        if (url === `/api/runs/${RUN.id}/gate`) return jsonResponse({ status: 'PENDING', complete: false, failures: [] })
        if (url === `/api/runs/${RUN.id}/findings`) return jsonResponse({ run_id: RUN.id, findings: [], open_blockers: 0 })
        if (url === `/api/runs/${RUN.id}/evidence`) return jsonResponse([])
        if (url === `/api/runs/${RUN.id}/events`) return jsonResponse({ events: [], next_cursor: null })
        throw new Error(`Unexpected request: ${url}`)
      }),
    )

    render(
      <Router initialPath={`/runs/${RUN.id}`}>
        <RunDetailPage runId={RUN.id} />
      </Router>
    )

    expect(await screen.findByText('Run #33333333')).toBeInTheDocument()
    expect(screen.getByText('Test Task Title')).toBeInTheDocument()
    expect(screen.getByText('Project A')).toBeInTheDocument()
    expect(screen.getByText('BLOCKED')).toBeInTheDocument()

    // Explicit unavailable semantics
    expect(await screen.findByText('No active blockers.')).toBeInTheDocument()
    expect(screen.getByText('No workflow stages recorded.')).toBeInTheDocument()

    // Check navigation tab clicks to findings
    fireEvent.click(screen.getByRole('button', { name: /findings/i }))
    expect(await screen.findByText('No findings recorded for this run.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /evidence/i }))
    expect(await screen.findByText('No evidence recorded for this run.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /activity/i }))
    expect(await screen.findByText('No activity recorded for this run.')).toBeInTheDocument()
  })

  it('renders overview data including completion gates and stages correctly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url === `/api/runs/${RUN.id}`) return jsonResponse(RUN)
        if (url === `/api/projects/${PROJECT.id}`) return jsonResponse(PROJECT)
        if (url === `/api/tasks/${TASK.id}`) return jsonResponse(TASK)
        if (url === `/api/runs/${RUN.id}/stages`) return jsonResponse(RUN_STAGES)
        if (url === `/api/runs/${RUN.id}/gate`) return jsonResponse(COMPLETION_GATE)
        throw new Error(`Unexpected request: ${url}`)
      }),
    )

    render(
      <Router initialPath={`/runs/${RUN.id}`}>
        <RunDetailPage runId={RUN.id} />
      </Router>
    )

    // Wait for gates and stages
    expect(await screen.findByText('Missing required evidence for execution')).toBeInTheDocument()
    expect(screen.getByText('planning')).toBeInTheDocument()
    expect(screen.getByText('execution')).toBeInTheDocument()

    // Ensure actual failure reasons are displayed
    expect(screen.queryByText('false')).not.toBeInTheDocument() // Not merely pass/fail coloring
  })

  it('renders findings and visibly distinguishes blockers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url === `/api/runs/${RUN.id}`) return jsonResponse(RUN)
        if (url === `/api/projects/${PROJECT.id}`) return jsonResponse(PROJECT)
        if (url === `/api/tasks/${TASK.id}`) return jsonResponse(TASK)
        if (url === `/api/runs/${RUN.id}/findings`) return jsonResponse({ run_id: RUN.id, findings: [FINDING], open_blockers: 1 })
        throw new Error(`Unexpected request: ${url}`)
      }),
    )

    render(
      <Router initialPath={`/runs/${RUN.id}`}>
        <RunDetailPage runId={RUN.id} />
      </Router>
    )

    fireEvent.click(await screen.findByRole('button', { name: /findings/i }))

    expect(await screen.findByText('Exposed secret')).toBeInTheDocument()
    expect(screen.getByText('Open blockers: 1')).toBeInTheDocument()

    // Checking styling for blocker distinguishing
    const findingContainer = screen.getByText('Exposed secret').closest('.panel') as HTMLElement | null
    expect(findingContainer?.style.borderLeft).toContain('var(--danger-color)')
  })

  it('renders evidence and preserves failure status from the backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url === `/api/runs/${RUN.id}`) return jsonResponse(RUN)
        if (url === `/api/projects/${PROJECT.id}`) return jsonResponse(PROJECT)
        if (url === `/api/tasks/${TASK.id}`) return jsonResponse(TASK)
        if (url === `/api/runs/${RUN.id}/evidence`) return jsonResponse([EVIDENCE])
        throw new Error(`Unexpected request: ${url}`)
      }),
    )

    render(
      <Router initialPath={`/runs/${RUN.id}`}>
        <RunDetailPage runId={RUN.id} />
      </Router>
    )

    fireEvent.click(await screen.findByRole('button', { name: /evidence/i }))

    expect(await screen.findByText('TEST_RESULT')).toBeInTheDocument()
    expect(screen.getByText('FAILED')).toBeInTheDocument() // Non-success evidence is not successful
    expect(screen.getByText('1 tests failed.')).toBeInTheDocument()
  })

  it('renders activity timeline with event ordering', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url === `/api/runs/${RUN.id}`) return jsonResponse(RUN)
        if (url === `/api/projects/${PROJECT.id}`) return jsonResponse(PROJECT)
        if (url === `/api/tasks/${TASK.id}`) return jsonResponse(TASK)
        if (url === `/api/runs/${RUN.id}/events`) return jsonResponse({ events: [EVENT], next_cursor: null })
        throw new Error(`Unexpected request: ${url}`)
      }),
    )

    render(
      <Router initialPath={`/runs/${RUN.id}`}>
        <RunDetailPage runId={RUN.id} />
      </Router>
    )

    fireEvent.click(await screen.findByRole('button', { name: /activity/i }))

    expect(await screen.findByText('agent_started')).toBeInTheDocument()
    expect(screen.getByText(/Agent started successfully/i)).toBeInTheDocument()
  })

  it('RunHeader renders status and metadata but no mutation controls (Phase 5A is read-only)', async () => {
    // Verify across a representative set of statuses that no operation buttons appear.
    // Mutation controls (Cancel, Resume, Retry) are out of scope for Phase 5A Operational Visibility.
    const statuses: Run['status'][] = ['BLOCKED', 'RUNNING', 'FAILED', 'COMPLETED', 'CANCELLED']

    for (const status of statuses) {
      vi.unstubAllGlobals()
      const runWithStatus: Run = { ...RUN, status }
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = requestUrl(input)
          if (url === `/api/runs/${runWithStatus.id}`) return jsonResponse(runWithStatus)
          if (url === `/api/projects/${PROJECT.id}`) return jsonResponse(PROJECT)
          if (url === `/api/tasks/${TASK.id}`) return jsonResponse(TASK)
          throw new Error(`Unexpected request: ${url}`)
        }),
      )

      const { unmount } = render(
        <Router initialPath={`/runs/${runWithStatus.id}`}>
          <RunDetailPage runId={runWithStatus.id} />
        </Router>
      )

      expect(await screen.findByText('Run #33333333')).toBeInTheDocument()
      expect(screen.getByText(status)).toBeInTheDocument()

      // No mutation controls must appear for any lifecycle state in Phase 5A
      expect(screen.queryByRole('button', { name: /Cancel/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Resume/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Retry/i })).not.toBeInTheDocument()

      unmount()
    }
  })

  it('RunFindingsTab renders non-blocker finding with border-color (not danger-color)', async () => {
    const nonBlockerFinding: Finding = {
      ...FINDING,
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      title: 'Style warning',
      blocks_completion: false,
      severity: 'LOW',
      status: 'OPEN',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url === `/api/runs/${RUN.id}`) return jsonResponse(RUN)
        if (url === `/api/projects/${PROJECT.id}`) return jsonResponse(PROJECT)
        if (url === `/api/tasks/${TASK.id}`) return jsonResponse(TASK)
        if (url === `/api/runs/${RUN.id}/findings`)
          return jsonResponse({ run_id: RUN.id, findings: [nonBlockerFinding], open_blockers: 0 })
        throw new Error(`Unexpected request: ${url}`)
      }),
    )

    render(
      <Router initialPath={`/runs/${RUN.id}`}>
        <RunDetailPage runId={RUN.id} />
      </Router>
    )

    fireEvent.click(await screen.findByRole('button', { name: /findings/i }))

    const title = await screen.findByText('Style warning')
    expect(title).toBeInTheDocument()
    // Non-blocker must not use the danger border
    const panel = title.closest('.panel') as HTMLElement | null
    expect(panel?.style.borderLeft).not.toContain('var(--danger-color)')
    expect(panel?.style.borderLeft).toContain('var(--border-color)')
    // open_blockers 0 is truthful
    expect(screen.getByText('Open blockers: 0')).toBeInTheDocument()
  })

  it('RunFindingsTab shows RESOLVED badge with success styling', async () => {
    const resolvedFinding: Finding = {
      ...FINDING,
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      title: 'Fixed issue',
      blocks_completion: false,
      status: 'RESOLVED',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url === `/api/runs/${RUN.id}`) return jsonResponse(RUN)
        if (url === `/api/projects/${PROJECT.id}`) return jsonResponse(PROJECT)
        if (url === `/api/tasks/${TASK.id}`) return jsonResponse(TASK)
        if (url === `/api/runs/${RUN.id}/findings`)
          return jsonResponse({ run_id: RUN.id, findings: [resolvedFinding], open_blockers: 0 })
        throw new Error(`Unexpected request: ${url}`)
      }),
    )

    render(
      <Router initialPath={`/runs/${RUN.id}`}>
        <RunDetailPage runId={RUN.id} />
      </Router>
    )

    fireEvent.click(await screen.findByRole('button', { name: /findings/i }))

    expect(await screen.findByText('Fixed issue')).toBeInTheDocument()
    // RESOLVED status badge must use success styling, not neutral
    const badge = screen.getByText('RESOLVED')
    expect(badge).toHaveClass('badge-success')
    expect(badge).not.toHaveClass('badge-neutral')
  })

  it('RunEvidenceTab shows PASSED evidence without conflating it with test failure', async () => {
    const passedEvidence: Evidence = {
      ...EVIDENCE,
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      kind: 'TEST_RESULT',
      status: 'PASSED',
      summary: 'All 42 tests passed.',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url === `/api/runs/${RUN.id}`) return jsonResponse(RUN)
        if (url === `/api/projects/${PROJECT.id}`) return jsonResponse(PROJECT)
        if (url === `/api/tasks/${TASK.id}`) return jsonResponse(TASK)
        if (url === `/api/runs/${RUN.id}/evidence`) return jsonResponse([passedEvidence])
        throw new Error(`Unexpected request: ${url}`)
      }),
    )

    render(
      <Router initialPath={`/runs/${RUN.id}`}>
        <RunDetailPage runId={RUN.id} />
      </Router>
    )

    fireEvent.click(await screen.findByRole('button', { name: /evidence/i }))

    expect(await screen.findByText('All 42 tests passed.')).toBeInTheDocument()
    // Status is PASSED — must render as-is, not transformed
    expect(screen.getByText('PASSED')).toBeInTheDocument()
    // Must not silently drop the status or show FAILED
    expect(screen.queryByText('FAILED')).not.toBeInTheDocument()
  })

  it('RunOverviewTab with complete gate shows no failure reasons (truthful empty state)', async () => {
    const completeGate: CompletionGateResponse = {
      status: 'SATISFIED',
      complete: true,
      failures: [],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url === `/api/runs/${RUN.id}`) return jsonResponse(RUN)
        if (url === `/api/projects/${PROJECT.id}`) return jsonResponse(PROJECT)
        if (url === `/api/tasks/${TASK.id}`) return jsonResponse(TASK)
        if (url === `/api/runs/${RUN.id}/stages`) return jsonResponse([])
        if (url === `/api/runs/${RUN.id}/gate`) return jsonResponse(completeGate)
        throw new Error(`Unexpected request: ${url}`)
      }),
    )

    render(
      <Router initialPath={`/runs/${RUN.id}`}>
        <RunDetailPage runId={RUN.id} />
      </Router>
    )

    // When gate is satisfied with no failures, the section must say so explicitly
    expect(await screen.findByText('No active blockers.')).toBeInTheDocument()
    // Must not fabricate failure text when there are none
    expect(screen.queryByText('Missing required evidence for execution')).not.toBeInTheDocument()
    // Must not render the boolean value literally
    expect(screen.queryByText('true')).not.toBeInTheDocument()
    expect(screen.queryByText('false')).not.toBeInTheDocument()
  })
})
