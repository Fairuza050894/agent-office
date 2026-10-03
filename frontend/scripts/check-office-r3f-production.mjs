import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const baseUrl = 'http://127.0.0.1:4174'

const PROJECT = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Production smoke project',
  repository: { name: 'production-smoke-project' },
  default_branch: 'main',
  preferred_executor_id: null,
  default_workflow_id: null,
  status: 'ACTIVE',
  created_at: '2026-10-02T01:00:00Z',
  updated_at: '2026-10-02T01:00:00Z',
  archived_at: null,
}
const TASK = {
  id: '22222222-2222-4222-8222-222222222222',
  project_id: PROJECT.id,
  title: 'Verify production Office renderer',
  objective: 'Verify Planning, Live, and Replay renderer selection without changing canonical truth.',
  constraints: null,
  requested_workflow_id: null,
  requested_executor_id: null,
  created_at: '2026-10-02T01:00:00Z',
  updated_at: '2026-10-02T01:00:00Z',
}
const EXECUTOR = {
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'REFERENCE',
  name: 'Reference Executor',
  status: 'AVAILABLE',
  runtime_version: '1',
  health_summary: 'Available.',
  last_check: '2026-10-02T01:00:00Z',
  capabilities: [],
  security_limitations: [],
}
const PROFILE = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  key: 'backend-developer',
  name: 'Backend Developer',
  description: 'Backend role',
  default_access_mode: 'WRITE',
  version: 1,
  status: 'ACTIVE',
}
const RUN = {
  id: '33333333-3333-4333-8333-333333333333',
  project_id: PROJECT.id,
  task_id: TASK.id,
  status: 'RUNNING',
  requested_executor_id: EXECUTOR.id,
  resolved_executor_id: EXECUTOR.id,
  workflow_snapshot_id: '44444444-4444-4444-8444-444444444444',
  changed_areas: ['FRONTEND'],
  failure_code: null,
  failure_summary: null,
  started_at: '2026-10-02T01:00:00Z',
  completed_at: null,
  cancel_requested_at: null,
  remediation_cycles_used: 0,
  candidate_workspace_id: null,
  created_at: '2026-10-02T01:00:00Z',
  updated_at: '2026-10-02T01:00:00Z',
}
const STAGE = {
  stage_key: 'IMPLEMENTATION',
  status: 'RUNNING',
  required: true,
  order_hint: 1,
  execution_mode: 'SEQUENTIAL',
  condition: 'ALWAYS',
  reason_code: null,
  reason_summary: null,
  started_at: RUN.started_at,
  completed_at: null,
}
const AGENT = {
  id: '55555555-5555-4555-8555-555555555555',
  run_id: RUN.id,
  project_id: PROJECT.id,
  stage_key: STAGE.stage_key,
  agent_profile_key: PROFILE.key,
  agent_profile_version: 1,
  executor_id: EXECUTOR.id,
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
  started_at: RUN.started_at,
  completed_at: null,
  created_at: RUN.started_at,
  updated_at: RUN.updated_at,
}

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
      throw new Error(
        `Vite preview exited before production smoke was ready (code ${process.exitCode}).`,
      )
    }
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // Preview has not started listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for Vite preview at ${baseUrl}.`)
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
  await page.route('**/health', (route) =>
    jsonResponse(route, { status: 'ok' }),
  )
  await page.route('**/api/**', (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/api/projects') return jsonResponse(route, [])
    if (pathname === `/api/projects/${PROJECT.id}`) return jsonResponse(route, PROJECT)
    if (pathname === `/api/projects/${PROJECT.id}/tasks`) return jsonResponse(route, [TASK])
    if (pathname === '/api/executors') return jsonResponse(route, [EXECUTOR])
    if (pathname === '/api/agent-profiles') return jsonResponse(route, [PROFILE])
    if (pathname === `/api/runs/${RUN.id}`) return jsonResponse(route, RUN)
    if (pathname === `/api/runs/${RUN.id}/stages`) return jsonResponse(route, [STAGE])
    if (pathname === `/api/runs/${RUN.id}/agents`) return jsonResponse(route, [AGENT])
    if (pathname === `/api/runs/${RUN.id}/workspaces`) return jsonResponse(route, [])
    if (pathname === `/api/runs/${RUN.id}/events`) {
      return jsonResponse(route, { events: [], next_cursor: null })
    }
    if (pathname === `/api/runs/${RUN.id}/evidence`) return jsonResponse(route, [])
    if (pathname === `/api/runs/${RUN.id}/findings`) {
      return jsonResponse(route, { run_id: RUN.id, findings: [], open_blockers: 0 })
    }
    if (pathname === `/api/runs/${RUN.id}/audit`) return jsonResponse(route, [])
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Unmocked production smoke API: ${pathname}` }),
    })
  })
}

async function assertR3fHost(page, scope) {
  const host = page.locator(
    `[data-office-renderer="r3f"][data-office-scope="${scope}"]`,
  )
  await host.waitFor()
  await host.locator('canvas.office-three-canvas').waitFor()
  const dimensions = await host.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height,
  }))
  if (dimensions.width < 600 || dimensions.height < 300) {
    throw new Error(
      `Production R3F ${scope} host is unexpectedly small: ${JSON.stringify(dimensions)}`,
    )
  }
  return host
}

async function run() {
  const viteEntry = path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js')
  const server = spawn(
    process.execPath,
    [viteEntry, 'preview', '--host', '127.0.0.1', '--port', '4174', '--strictPort'],
    {
      cwd: frontendRoot,
      env: { ...process.env, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let serverLog = ''
  server.stdout.on('data', (chunk) => { serverLog += chunk.toString() })
  server.stderr.on('data', (chunk) => { serverLog += chunk.toString() })

  let browser
  try {
    await waitForServer(server)
    browser = await chromium.launch({
      headless: true,
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
      ],
    })
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
      locale: 'en-US',
      timezoneId: 'Asia/Jakarta',
    })
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (error) => { pageErrors.push(error.message) })

    await page.addInitScript(() => {
      class ProductionSmokeEventSource {
        static CONNECTING = 0
        static OPEN = 1
        static CLOSED = 2
        constructor(url) {
          this.url = String(url)
          this.readyState = ProductionSmokeEventSource.OPEN
          this.onopen = null
          this.onmessage = null
          this.onerror = null
          queueMicrotask(() => this.onopen?.(new Event('open')))
        }
        close() { this.readyState = ProductionSmokeEventSource.CLOSED }
        addEventListener() {}
        removeEventListener() {}
        dispatchEvent() { return true }
      }
      Object.defineProperty(window, 'EventSource', {
        configurable: true,
        writable: true,
        value: ProductionSmokeEventSource,
      })
    })
    await configureApiMocks(page)

    await page.goto(`${baseUrl}/office`, { waitUntil: 'networkidle' })
    await page.getByText('Planning Office', { exact: true }).waitFor()
    await assertR3fHost(page, 'planning')
    if ((await page.locator('[data-office-diorama-debug="simulated"]').count()) > 0) {
      throw new Error('Development Diorama fixture leaked into production Planning Office.')
    }

    await page.goto(`${baseUrl}/runs/${RUN.id}/office`, { waitUntil: 'networkidle' })
    await page.getByText('Live canonical Run / AgentRun projection', { exact: true }).waitFor()
    const liveHost = await assertR3fHost(page, 'live')
    await liveHost.locator('.office-avatar-nameplate', { hasText: 'Backend Developer' }).waitFor()

    await page.getByRole('button', { name: 'Replay', exact: true }).click()
    await page.getByText('Historical Run / AgentRun replay', { exact: true }).waitFor()
    const replayHost = await assertR3fHost(page, 'replay')
    await replayHost
      .locator('.office-avatar-nameplate.state-starting, .office-avatar-nameplate.state-running', {
        hasText: 'Backend Developer',
      })
      .waitFor({ state: 'attached' })
    if ((await page.locator('[data-office-renderer="three"]').count()) > 0) {
      throw new Error('Replay unexpectedly fell back to Three.js during production smoke.')
    }

    if (pageErrors.length > 0) {
      throw new Error(`Production Office raised page errors: ${pageErrors.join(' | ')}`)
    }
    await context.close()
    process.stdout.write(
      'Production Office R3F migration verified: Planning=R3F, Live=R3F, Replay=R3F; Replay reached its factual start state, Three.js remains fallback-only, and no Diorama fixture leaked.\n',
    )
  } catch (error) {
    if (serverLog.trim()) {
      process.stderr.write(
        `\n--- Vite preview output ---\n${serverLog.trim()}\n--- end Vite preview output ---\n`,
      )
    }
    throw error
  } finally {
    if (browser) await browser.close()
    await stopServer(server)
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
