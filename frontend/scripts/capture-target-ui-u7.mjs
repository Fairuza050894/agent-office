import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const repositoryRoot = path.resolve(frontendRoot, '..')
const outputRoot = path.join(repositoryRoot, 'artifacts', 'target-ui-u7')
const baseUrl = 'http://127.0.0.1:5178'

const viewports = [
  { key: '1440', width: 1440, height: 1000 },
  { key: '1024', width: 1024, height: 900 },
  { key: '390', width: 390, height: 844 },
]

const PROJECT = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Agent Office',
  repository: { name: 'agent-office' },
  default_branch: 'main',
  preferred_executor_id: null,
  default_workflow_id: null,
  status: 'ACTIVE',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  archived_at: null,
}

const TASK = {
  id: '22222222-2222-4222-8222-222222222222',
  project_id: PROJECT.id,
  title: 'Close delivery loop',
  objective: 'Require human acceptance before managed delivery.',
  constraints: null,
  requested_workflow_id: null,
  requested_executor_id: null,
  created_at: '2026-10-01T01:00:00Z',
  updated_at: '2026-10-01T01:00:00Z',
}

const RUN = {
  id: '33333333-3333-4333-8333-333333333333',
  project_id: PROJECT.id,
  task_id: TASK.id,
  status: 'RUNNING',
  requested_executor_id: null,
  resolved_executor_id: 'reference',
  workflow_snapshot_id: null,
  changed_areas: null,
  failure_code: null,
  failure_summary: null,
  started_at: '2026-10-01T02:00:00Z',
  completed_at: null,
  cancel_requested_at: null,
  remediation_cycles_used: 0,
  candidate_workspace_id: null,
  created_at: '2026-10-01T02:00:00Z',
  updated_at: '2026-10-01T02:30:00Z',
}

const AGENT = {
  id: '99999999-9999-4999-8999-999999999999',
  run_id: RUN.id,
  project_id: PROJECT.id,
  stage_key: 'IMPLEMENTATION',
  agent_profile_key: 'backend-engineer',
  agent_profile_version: 1,
  executor_id: 'reference',
  access_mode: 'WRITE',
  status: 'RUNNING',
  attempt: 1,
  retry_of_agent_run_id: null,
  remediation_cycle: 0,
  review_verdict: null,
  workspace_id: null,
  result_outcome: null,
  result_summary: null,
  reason_code: null,
  reason_summary: null,
  failure_retryable: null,
  started_at: '2026-10-01T02:00:00Z',
  completed_at: null,
  created_at: '2026-10-01T02:00:00Z',
  updated_at: '2026-10-01T02:30:00Z',
}

const STAGES = [
  {
    stage_key: 'PLAN',
    status: 'COMPLETED',
    required: true,
    order_hint: 0,
    execution_mode: 'SEQUENTIAL',
    condition: 'ALWAYS',
    reason_code: null,
    reason_summary: null,
    started_at: '2026-10-01T02:00:00Z',
    completed_at: '2026-10-01T02:10:00Z',
  },
  {
    stage_key: 'IMPLEMENTATION',
    status: 'RUNNING',
    required: true,
    order_hint: 1,
    execution_mode: 'SEQUENTIAL',
    condition: 'ALWAYS',
    reason_code: null,
    reason_summary: null,
    started_at: '2026-10-01T02:10:00Z',
    completed_at: null,
  },
  {
    stage_key: 'VERIFY',
    status: 'PENDING',
    required: true,
    order_hint: 2,
    execution_mode: 'SEQUENTIAL',
    condition: 'ALWAYS',
    reason_code: null,
    reason_summary: null,
    started_at: null,
    completed_at: null,
  },
]

const EVENTS = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    event_type: 'agent.started',
    project_id: PROJECT.id,
    run_id: RUN.id,
    agent_run_id: AGENT.id,
    source: 'backend-engineer',
    occurred_at: '2026-10-01T02:10:00Z',
    recorded_at: '2026-10-01T02:10:00Z',
    payload: { summary: 'Backend engineer started implementation' },
    redacted_keys: [],
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    event_type: 'test.started',
    project_id: PROJECT.id,
    run_id: RUN.id,
    agent_run_id: AGENT.id,
    source: 'qa-engineer',
    occurred_at: '2026-10-01T02:20:00Z',
    recorded_at: '2026-10-01T02:20:00Z',
    payload: { summary: 'Verification started' },
    redacted_keys: ['secret_token'],
  },
]

const routes = [
  { key: 'office', path: '/office', wait: 'Agent Office' },
  { key: 'run-office', path: `/runs/${RUN.id}/office`, wait: 'Agent Office' },
]

function jsonResponse(route, body) {
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
      throw new Error(`Vite exited before capture was ready (code ${process.exitCode}).`)
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

async function configureApiMocks(page) {
  await page.route('**/health', (route) => jsonResponse(route, { status: 'ok' }))
  await page.route('**/api/projects', (route) => jsonResponse(route, [PROJECT]))
  await page.route(`**/api/projects/${PROJECT.id}`, (route) =>
    jsonResponse(route, PROJECT),
  )
  await page.route('**/api/executors', (route) =>
    jsonResponse(route, [
      {
        id: 'reference',
        kind: 'reference',
        name: 'Reference',
        status: 'AVAILABLE',
        runtime_version: null,
        health_summary: 'Available.',
        last_check: '2026-10-01T02:00:00Z',
        capabilities: [],
        security_limitations: [],
      },
    ]),
  )
  await page.route('**/api/agent-profiles', (route) =>
    jsonResponse(route, [
      {
        id: 'profile-1',
        key: 'backend-engineer',
        name: 'Backend Engineer',
        description: 'Builds backend code.',
        default_access_mode: 'WRITE',
        version: 1,
        status: 'ACTIVE',
      },
    ]),
  )
  await page.route(`**/api/projects/${PROJECT.id}/tasks`, (route) =>
    jsonResponse(route, [TASK]),
  )
  await page.route(`**/api/tasks/${TASK.id}`, (route) => jsonResponse(route, TASK))
  await page.route(`**/api/tasks/${TASK.id}/runs`, (route) => jsonResponse(route, [RUN]))
  await page.route(`**/api/runs/${RUN.id}`, (route) => jsonResponse(route, RUN))
  await page.route(`**/api/runs/${RUN.id}/stages`, (route) => jsonResponse(route, STAGES))
  await page.route(`**/api/runs/${RUN.id}/agents`, (route) => jsonResponse(route, [AGENT]))
  await page.route(`**/api/runs/${RUN.id}/events`, (route) =>
    jsonResponse(route, { events: EVENTS, next_cursor: null }),
  )
  await page.route(`**/api/runs/${RUN.id}/result-review`, (route) =>
    jsonResponse(route, {
      run_id: RUN.id,
      task_id: TASK.id,
      state: 'AWAITING_REVIEW',
      candidate_workspace_id: null,
      feedback: null,
      remediation_run_id: null,
      delivered_branch: null,
      delivered_commit: null,
      changes_requested_at: null,
      approved_at: null,
      delivered_at: null,
      can_approve: false,
      can_request_changes: false,
    }),
  )
  await page.route(`**/api/runs/${RUN.id}/workspaces`, (route) => jsonResponse(route, []))
  await page.route(`**/api/runs/${RUN.id}/snapshot`, (route) =>
    jsonResponse(route, {
      id: 'snapshot-1',
      run_id: RUN.id,
      project_id: PROJECT.id,
      source_workflow_id: null,
      source_workflow_key: 'enterprise-engineering',
      source_workflow_version: 1,
      schema_version: 1,
      stages: [],
      agent_assignments: [],
      created_at: '2026-10-01T02:00:00Z',
    }),
  )
  await page.route(`**/api/runs/${RUN.id}/verification`, (route) =>
    jsonResponse(route, { run_id: RUN.id, checked: false, checks: [], evidence_count: 0 }),
  )
  await page.route(`**/api/runs/${RUN.id}/evidence`, (route) => jsonResponse(route, []))
  await page.route(`**/api/runs/${RUN.id}/findings`, (route) =>
    jsonResponse(route, { run_id: RUN.id, findings: [], open_blockers: 0 }),
  )
  await page.route(`**/api/runs/${RUN.id}/audit`, (route) => jsonResponse(route, []))
  await page.route('**/api/projects/*/composer/threads', (route) =>
    jsonResponse(route, []),
  )
  await page.route('**/api/workflows', (route) => jsonResponse(route, []))
}

async function capture() {
  await rm(outputRoot, { recursive: true, force: true })
  await mkdir(outputRoot, { recursive: true })

  const viteEntry = path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js')
  const server = spawn(
    process.execPath,
    [viteEntry, '--host', '127.0.0.1', '--port', '5178', '--strictPort'],
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

    const captures = []
    for (const viewport of viewports) {
      for (const route of routes) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
          colorScheme: 'dark',
          reducedMotion: 'reduce',
          locale: 'en-US',
          timezoneId: 'Asia/Jakarta',
        })
        const page = await context.newPage()
        await configureApiMocks(page)
        await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'networkidle' })
        try {
          await page.getByRole('heading', { name: route.wait }).first().waitFor({ timeout: 8000 })
        } catch {
          await page.getByText(route.wait).first().waitFor({ timeout: 8000 })
        }
        await page.waitForTimeout(800)

        const filename = `u7-${route.key}-${viewport.key}.png`
        await page.screenshot({
          path: path.join(outputRoot, filename),
          fullPage: false,
          animations: 'disabled',
        })
        captures.push({
          file: filename,
          route: route.path,
          viewport: { width: viewport.width, height: viewport.height, deviceScaleFactor: 1 },
        })
        await context.close()
        process.stdout.write(`captured ${filename}\n`)
      }
    }

    await writeFile(
      path.join(outputRoot, 'capture-info.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          scope: 'target-ui-u7',
          canonicalDataFixture: 'one-task-running-awaiting-review',
          captureCount: captures.length,
          captures,
        },
        null,
        2,
      )}\n`,
      'utf8',
    )

    process.stdout.write(`U7 capture complete: ${captures.length} PNG files + capture-info.json\n`)
  } catch (error) {
    process.stderr.write(`${serverLog}\n`)
    throw error
  } finally {
    if (browser) await browser.close()
    await stopServer(server)
  }
}

capture().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
