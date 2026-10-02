import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const baseUrl = 'http://127.0.0.1:5176'

const ids = {
  project: '11111111-1111-4111-8111-111111111111',
  task: '22222222-2222-4222-8222-222222222222',
  run: '33333333-3333-4333-8333-333333333333',
  workflow: '44444444-4444-4444-8444-444444444444',
  agent: '55555555-5555-4555-8555-555555555555',
  workspace: '77777777-7777-4777-8777-777777777777',
  executor: '00000000-0000-4000-8000-000000000001',
  profile: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
}

const project = {
  id: ids.project,
  name: 'Renderer Smoke Project',
  repository: { name: 'renderer-smoke-project' },
  default_branch: 'main',
  preferred_executor_id: null,
  default_workflow_id: null,
  status: 'ACTIVE',
  created_at: '2026-10-02T01:00:00Z',
  updated_at: '2026-10-02T01:00:00Z',
  archived_at: null,
}

const task = {
  id: ids.task,
  project_id: ids.project,
  title: 'Verify R3F production renderer',
  objective: 'Exercise the normal Agent Office production routes.',
  constraints: null,
  requested_workflow_id: null,
  requested_executor_id: null,
  created_at: '2026-10-02T01:00:00Z',
  updated_at: '2026-10-02T01:00:00Z',
}

const run = {
  id: ids.run,
  project_id: ids.project,
  task_id: ids.task,
  status: 'RUNNING',
  requested_executor_id: ids.executor,
  resolved_executor_id: ids.executor,
  workflow_snapshot_id: ids.workflow,
  changed_areas: ['FRONTEND'],
  failure_code: null,
  failure_summary: null,
  started_at: '2026-10-02T01:00:00Z',
  completed_at: null,
  cancel_requested_at: null,
  remediation_cycles_used: 0,
  candidate_workspace_id: ids.workspace,
  created_at: '2026-10-02T01:00:00Z',
  updated_at: '2026-10-02T01:04:00Z',
}

const stage = {
  stage_key: 'IMPLEMENTATION',
  status: 'RUNNING',
  required: true,
  order_hint: 1,
  execution_mode: 'SEQUENTIAL',
  condition: 'ALWAYS',
  reason_code: null,
  reason_summary: null,
  started_at: run.started_at,
  completed_at: null,
}

const agent = {
  id: ids.agent,
  run_id: ids.run,
  project_id: ids.project,
  stage_key: stage.stage_key,
  agent_profile_key: 'backend-developer',
  agent_profile_version: 1,
  executor_id: ids.executor,
  access_mode: 'WRITE',
  status: 'RUNNING',
  attempt: 1,
  retry_of_agent_run_id: null,
  remediation_cycle: 0,
  review_verdict: null,
  workspace_id: ids.workspace,
  result_outcome: null,
  result_summary: null,
  reason_code: null,
  reason_summary: null,
  failure_retryable: null,
  started_at: run.started_at,
  completed_at: null,
  created_at: run.started_at,
  updated_at: '2026-10-02T01:04:00Z',
}

const workspace = {
  id: ids.workspace,
  project_id: ids.project,
  run_id: ids.run,
  owner_agent_run_id: ids.agent,
  kind: 'GIT_WORKTREE',
  access_mode: 'WRITE',
  status: 'READY',
  base_revision: 'abc123',
  git_branch: 'ao/r3f-smoke',
  reason_code: null,
  reason_summary: null,
  writable: true,
  created_at: run.started_at,
  updated_at: '2026-10-02T01:04:00Z',
  released_at: null,
}

const profile = {
  id: ids.profile,
  key: 'backend-developer',
  name: 'Backend Developer',
  description: 'Backend implementer.',
  default_access_mode: 'WRITE',
  version: 1,
  status: 'ACTIVE',
}

const executor = {
  id: ids.executor,
  kind: 'REFERENCE',
  name: 'Reference Executor',
  status: 'AVAILABLE',
  runtime_version: '1',
  health_summary: 'Available.',
  last_check: '2026-10-02T01:04:00Z',
  capabilities: [],
  security_limitations: [],
}

const events = [
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    event_type: 'agent.started',
    project_id: ids.project,
    run_id: ids.run,
    agent_run_id: ids.agent,
    source: 'EXECUTOR',
    occurred_at: '2026-10-02T01:00:10Z',
    recorded_at: '2026-10-02T01:00:11Z',
    payload: {},
  },
  {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    event_type: 'agent.signal',
    project_id: ids.project,
    run_id: ids.run,
    agent_run_id: ids.agent,
    source: 'EXECUTOR',
    occurred_at: '2026-10-02T01:02:00Z',
    recorded_at: '2026-10-02T01:02:01Z',
    payload: { summary: 'Canonical smoke signal' },
  },
]

function json(route, body) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function waitForServer(process, timeoutMs = 20_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (process.exitCode !== null) {
      throw new Error(
        `Vite exited before production smoke was ready (code ${process.exitCode}).`,
      )
    }

    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // Vite has not started listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for Vite at ${baseUrl}.`)
}

async function stopServer(process) {
  if (process.exitCode !== null) return
  process.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => process.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ])
  if (process.exitCode === null) process.kill('SIGKILL')
}

async function configureRoutes(page) {
  await page.addInitScript(() => {
    // The production smoke is a bounded REST projection check. Disable SSE so
    // no long-lived connection can make network-idle nondeterministic.
    Object.defineProperty(window, 'EventSource', {
      configurable: true,
      value: undefined,
    })
  })

  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/health') {
      return route.continue()
    }

    const pathname = url.pathname
    if (pathname === '/health') return json(route, { status: 'ok' })
    if (pathname === '/api/projects') return json(route, [project])
    if (pathname === `/api/projects/${ids.project}`) return json(route, project)
    if (pathname === `/api/projects/${ids.project}/tasks`) return json(route, [task])
    if (pathname === `/api/tasks/${ids.task}`) return json(route, task)
    if (pathname === `/api/runs/${ids.run}`) return json(route, run)
    if (pathname === `/api/runs/${ids.run}/stages`) return json(route, [stage])
    if (pathname === `/api/runs/${ids.run}/agents`) return json(route, [agent])
    if (pathname === `/api/runs/${ids.run}/workspaces`) return json(route, [workspace])
    if (pathname === `/api/runs/${ids.run}/events`) {
      return json(route, { events, next_cursor: null })
    }
    if (pathname === `/api/runs/${ids.run}/evidence`) return json(route, [])
    if (pathname === `/api/runs/${ids.run}/findings`) {
      return json(route, { run_id: ids.run, findings: [], open_blockers: 0 })
    }
    if (pathname === `/api/runs/${ids.run}/audit`) return json(route, [])
    if (pathname === `/api/workspaces/${ids.workspace}/status`) {
      return json(route, {
        workspace,
        change_summary: {
          base_revision: 'abc123',
          current_revision: 'def456',
          files_changed: 1,
          insertions: 2,
          deletions: 0,
          added_paths: [],
          modified_paths: ['frontend/src/example.ts'],
          deleted_paths: [],
          untracked_paths: [],
        },
      })
    }
    if (pathname === '/api/executors') return json(route, [executor])
    if (pathname === '/api/agent-profiles') return json(route, [profile])

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Unexpected smoke request ${pathname}` }),
    })
  })
}

async function assertR3F(page, label) {
  const host = page.locator('[data-office-renderer="r3f"]')
  await host.waitFor({ state: 'visible', timeout: 20_000 })
  await host.locator('canvas.office-three-canvas').waitFor({
    state: 'visible',
    timeout: 20_000,
  })

  if (await page.locator('.office-renderer-fallback').count()) {
    throw new Error(`${label}: outer renderer fallback is visible`)
  }

  const fallbackText = page.getByText('3D renderer unavailable')
  if (await fallbackText.count()) {
    throw new Error(`${label}: legacy renderer unavailable fallback is visible`)
  }

  process.stdout.write(`production R3F smoke passed: ${label}\n`)
}

async function smoke() {
  const viteEntry = path.join(
    frontendRoot,
    'node_modules',
    'vite',
    'bin',
    'vite.js',
  )
  const server = spawn(
    process.execPath,
    [viteEntry, '--host', '127.0.0.1', '--port', '5176', '--strictPort'],
    {
      cwd: frontendRoot,
      env: { ...process.env, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  let serverLog = ''
  server.stdout.on('data', (chunk) => {
    serverLog += chunk.toString()
  })
  server.stderr.on('data', (chunk) => {
    serverLog += chunk.toString()
  })

  let browser
  try {
    await waitForServer(server)
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
      locale: 'en-US',
      timezoneId: 'Asia/Jakarta',
    })
    const page = await context.newPage()
    await configureRoutes(page)

    await page.goto(`${baseUrl}/office?floor=build`, {
      waitUntil: 'domcontentloaded',
    })
    await assertR3F(page, 'Planning')

    await page.goto(
      `${baseUrl}/runs/${ids.run}/office?floor=build`,
      { waitUntil: 'domcontentloaded' },
    )
    await page.getByRole('button', { name: 'Live' }).waitFor()
    await assertR3F(page, 'Live')

    await page.goto(
      `${baseUrl}/runs/${ids.run}/office?floor=build&mode=replay`,
      { waitUntil: 'domcontentloaded' },
    )
    await page.getByRole('button', { name: 'Replay' }).waitFor()
    await assertR3F(page, 'Replay')

    await context.close()
    process.stdout.write(
      'Phase 13A production R3F smoke complete: Planning + Live + Replay.\n',
    )
  } catch (error) {
    if (serverLog.trim()) {
      process.stderr.write(
        `\n--- Vite output ---\n${serverLog.trim()}\n--- end Vite output ---\n`,
      )
    }
    throw error
  } finally {
    if (browser) await browser.close()
    await stopServer(server)
  }
}

smoke().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
