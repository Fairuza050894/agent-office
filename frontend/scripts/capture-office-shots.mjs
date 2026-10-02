import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const repositoryRoot = path.resolve(frontendRoot, '..')
const outputRoot = path.join(repositoryRoot, 'artifacts', 'office-shots')
const baseUrl = 'http://127.0.0.1:5174'
const v0BudgetPath = path.join(__dirname, 'office-v0-renderer-budget.json')

const floors = ['commons', 'build', 'strategy']
const lightingWindows = [
  { key: 'morning', debugTime: '2026-10-05T01:00:00.000Z' },
  { key: 'day', debugTime: '2026-10-05T04:00:00.000Z' },
  { key: 'evening', debugTime: '2026-10-05T11:30:00.000Z' },
  { key: 'night', debugTime: '2026-10-05T16:00:00.000Z' },
]
const viewports = [
  { key: '1440', width: 1440, height: 1000 },
  { key: '390', width: 390, height: 844 },
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
      throw new Error(`Vite exited before the visual harness was ready (code ${process.exitCode}).`)
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

function assertV1RendererBudget(capture, budget) {
  const viewportKey = String(capture.viewport.width)
  const expected = budget.floors?.[capture.floor]?.[viewportKey]
  if (!expected) {
    throw new Error(
      `Missing V0 renderer budget for ${capture.floor}/${viewportKey}.`,
    )
  }

  for (const key of ['calls', 'triangles', 'geometries', 'textures']) {
    if (capture.renderer[key] > expected[key]) {
      throw new Error(
        `V1 renderer budget exceeded for ${capture.file}: ${key}=${capture.renderer[key]} > V0 ${expected[key]}.`,
      )
    }
  }

  const lights = capture.renderer.lights
  if (!lights) {
    throw new Error(`V1 light metrics missing for ${capture.file}.`)
  }
  if (lights.hemisphere !== 1 || lights.directional !== 1) {
    throw new Error(
      `V1 global lighting contract failed for ${capture.file}: hemisphere=${lights.hemisphere}, directional=${lights.directional}.`,
    )
  }
  if (lights.point > 3 || lights.total > 5) {
    throw new Error(
      `V1 accent-light budget failed for ${capture.file}: point=${lights.point}, total=${lights.total}.`,
    )
  }
}

async function capture() {
  const v0Budget = JSON.parse(await readFile(v0BudgetPath, 'utf8'))

  await rm(outputRoot, { recursive: true, force: true })
  await mkdir(outputRoot, { recursive: true })

  const viteEntry = path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js')
  const server = spawn(
    process.execPath,
    [viteEntry, '--host', '127.0.0.1', '--port', '5174', '--strictPort'],
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

    try {
      browser = await chromium.launch({ headless: true })
    } catch (error) {
      throw new Error(
        `Chromium is unavailable for Playwright. Run "npm run office:shots:install" once, then retry.\n${error instanceof Error ? error.message : String(error)}`,
      )
    }

    const captures = []

    for (const viewport of viewports) {
      for (const floor of floors) {
        for (const lighting of lightingWindows) {
          const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            deviceScaleFactor: 1,
            colorScheme: 'dark',
            reducedMotion: 'reduce',
            locale: 'en-US',
            timezoneId: 'Asia/Jakarta',
          })
          const page = await context.newPage()

          await page.route('**/health', (route) =>
            jsonResponse(route, { status: 'ok' }),
          )
          await page.route('**/api/projects', (route) =>
            jsonResponse(route, []),
          )
          await page.route('**/api/executors', (route) =>
            jsonResponse(route, []),
          )
          await page.route('**/api/agent-profiles', (route) =>
            jsonResponse(route, []),
          )

          const params = new URLSearchParams({
            floor,
            fixture: 'diorama',
            debugTime: lighting.debugTime,
          })
          const url = `${baseUrl}/office?${params.toString()}`

          await page.goto(url, { waitUntil: 'networkidle' })
          await page.locator('[data-office-diorama-debug="simulated"]').waitFor()
          await page.locator('.office-three-host canvas').waitFor()
          await page.waitForFunction(
            () =>
              Boolean(
                window.__AGENT_OFFICE_DIARAMA__?.ready &&
                  window.__AGENT_OFFICE_DIARAMA__?.rendererInfo,
              ),
          )
          await page.waitForTimeout(350)

          const rendererInfo = await page.evaluate(
            () => window.__AGENT_OFFICE_DIARAMA__?.rendererInfo ?? null,
          )
          if (!rendererInfo) {
            throw new Error(
              `Renderer metrics were unavailable for ${floor}/${lighting.key}/${viewport.key}.`,
            )
          }

          const filename = `${floor}-${lighting.key}-${viewport.key}.png`
          await page.screenshot({
            path: path.join(outputRoot, filename),
            fullPage: false,
            animations: 'disabled',
          })

          const captureRecord = {
            file: filename,
            floor,
            lighting: lighting.key,
            debugTime: lighting.debugTime,
            viewport: {
              width: viewport.width,
              height: viewport.height,
              deviceScaleFactor: 1,
            },
            renderer: rendererInfo,
          }
          assertV1RendererBudget(captureRecord, v0Budget)
          captures.push(captureRecord)

          await context.close()
          process.stdout.write(`captured ${filename}\n`)
        }
      }
    }

    const expectedCaptureCount =
      floors.length * lightingWindows.length * viewports.length
    if (captures.length !== expectedCaptureCount) {
      throw new Error(
        `Expected ${expectedCaptureCount} Office captures, received ${captures.length}.`,
      )
    }

    const baseline = {
      schemaVersion: 1,
      fixture: 'diorama',
      timeZone: 'Asia/Jakarta',
      captureCount: captures.length,
      captures,
    }
    await writeFile(
      path.join(outputRoot, 'renderer-info.json'),
      `${JSON.stringify(baseline, null, 2)}\n`,
      'utf8',
    )

    process.stdout.write(
      `Office visual baseline complete: ${captures.length} PNG files + renderer-info.json\n`,
    )
    process.stdout.write(`Artifacts: ${outputRoot}\n`)
  } catch (error) {
    if (serverLog.trim()) {
      process.stderr.write(`\n--- Vite output ---\n${serverLog.trim()}\n--- end Vite output ---\n`)
    }
    throw error
  } finally {
    if (browser) await browser.close()
    await stopServer(server)
  }
}

capture().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
