import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const repositoryRoot = path.resolve(frontendRoot, '..')
const outputRoot = path.join(
  repositoryRoot,
  'artifacts',
  'office-renderer-pilot-shots',
)
const baseUrl = 'http://127.0.0.1:5174'

const renderers = ['three', 'r3f']
const lightingWindows = [
  { key: 'day', debugTime: '2026-10-05T04:00:00.000Z' },
  { key: 'night', debugTime: '2026-10-05T16:00:00.000Z' },
]
const viewports = [
  { key: '1440', width: 1440, height: 1000 },
  { key: '390', width: 390, height: 844 },
]

const buildCeilings = {
  '1440': { calls: 276, triangles: 33304 },
  '390': { calls: 225, triangles: 25320 },
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
        `Vite exited before the renderer pilot was ready (code ${process.exitCode}).`,
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

async function configureApiMocks(page) {
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
}

async function waitForKitSnapshot(page) {
  const handle = await page.waitForFunction(() => {
    const pilot = window.__AGENT_OFFICE_DIARAMA_PILOT__
    if (!pilot || pilot.mode !== 'kit' || (!pilot.ready && !pilot.error)) {
      return false
    }

    return {
      ready: pilot.ready,
      error: pilot.error ?? null,
      sourceAssetCount: pilot.sourceAssetCount,
      instanceCount: pilot.instanceCount,
      bounds: pilot.bounds ?? null,
    }
  })

  try {
    return await handle.jsonValue()
  } finally {
    await handle.dispose()
  }
}

function assertKitState(state) {
  if (!state) return false
  if (state.error) throw new Error(`Kit load failed: ${state.error}`)
  if (!state.ready) return false
  if (state.sourceAssetCount !== 5 || state.instanceCount < 40) {
    throw new Error(
      `Kit did not mount the expected furniture: ${JSON.stringify(state)}`,
    )
  }
  if (!state.bounds) {
    throw new Error('Kit renderer pilot is missing mounted bounds evidence.')
  }
  return true
}

async function waitForKit(page) {
  let lastObserved = null

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const candidate = await waitForKitSnapshot(page)
    lastObserved = candidate
    if (!assertKitState(candidate)) continue

    await page.waitForTimeout(500)
    const confirmed = await page.evaluate(() => {
      const pilot = window.__AGENT_OFFICE_DIARAMA_PILOT__
      if (
        !pilot ||
        pilot.mode !== 'kit' ||
        !pilot.ready ||
        pilot.error
      ) {
        return null
      }

      return {
        ready: pilot.ready,
        error: pilot.error ?? null,
        sourceAssetCount: pilot.sourceAssetCount,
        instanceCount: pilot.instanceCount,
        bounds: pilot.bounds ?? null,
      }
    })

    if (!confirmed) continue
    lastObserved = confirmed
    if (assertKitState(confirmed)) return confirmed
  }

  throw new Error(
    `Kit did not remain ready after 8 settle attempts. Last observed state: ${JSON.stringify(lastObserved)}`,
  )
}

function assertRendererBudget(capture) {
  const ceiling = buildCeilings[String(capture.viewport.width)]
  if (!ceiling) throw new Error(`No renderer ceiling for ${capture.file}`)

  if (capture.renderer.calls > ceiling.calls) {
    throw new Error(
      `Renderer pilot call budget exceeded for ${capture.file}: ${capture.renderer.calls} > ${ceiling.calls}`,
    )
  }
  if (capture.renderer.triangles > ceiling.triangles) {
    throw new Error(
      `Renderer pilot triangle budget exceeded for ${capture.file}: ${capture.renderer.triangles} > ${ceiling.triangles}`,
    )
  }

  const lights = capture.renderer.lights
  if (
    !lights ||
    lights.hemisphere !== 1 ||
    lights.directional !== 1 ||
    lights.point > 3 ||
    lights.total > 5
  ) {
    throw new Error(
      `Renderer pilot light contract failed for ${capture.file}: ${JSON.stringify(lights)}`,
    )
  }
}

async function capture() {
  await rm(outputRoot, { recursive: true, force: true })
  await mkdir(outputRoot, { recursive: true })

  const viteEntry = path.join(
    frontendRoot,
    'node_modules',
    'vite',
    'bin',
    'vite.js',
  )
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
    browser = await chromium.launch({ headless: true })
    const captures = []

    for (const viewport of viewports) {
      for (const lighting of lightingWindows) {
        for (const renderer of renderers) {
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

          const params = new URLSearchParams({
            floor: 'build',
            fixture: 'diorama',
            pilot: 'kit',
            renderer,
            debugTime: lighting.debugTime,
          })

          await page.goto(`${baseUrl}/office?${params.toString()}`, {
            waitUntil: 'networkidle',
          })
          await page
            .locator('[data-office-diorama-debug="simulated"]')
            .waitFor()
          await page.locator('.office-three-host canvas').waitFor()
          await waitForKit(page)

          await page.waitForFunction((requestedRenderer) => {
            const evidence = window.__AGENT_OFFICE_DIARAMA__
            if (!evidence?.ready || !evidence.rendererInfo) return false
            if (requestedRenderer === 'r3f') {
              return evidence.renderer === 'r3f'
            }
            return evidence.renderer !== 'r3f'
          }, renderer)

          await page.waitForTimeout(650)

          const evidence = await page.evaluate(() => ({
            renderer:
              window.__AGENT_OFFICE_DIARAMA__?.renderer ?? 'three',
            rendererInfo:
              window.__AGENT_OFFICE_DIARAMA__?.rendererInfo ?? null,
            pilot:
              window.__AGENT_OFFICE_DIARAMA_PILOT__ ?? null,
          }))

          if (!evidence.rendererInfo) {
            throw new Error(
              `Renderer metrics unavailable for ${renderer}/${lighting.key}/${viewport.key}`,
            )
          }

          const filename =
            `${renderer}-${lighting.key}-${viewport.key}.png`
          await page.screenshot({
            path: path.join(outputRoot, filename),
            fullPage: false,
            animations: 'disabled',
          })

          const record = {
            file: filename,
            rendererMode: renderer,
            lighting: lighting.key,
            debugTime: lighting.debugTime,
            viewport: {
              width: viewport.width,
              height: viewport.height,
              deviceScaleFactor: 1,
            },
            renderer: evidence.rendererInfo,
            pilotState: evidence.pilot,
          }
          assertRendererBudget(record)
          captures.push(record)

          await context.close()
          process.stdout.write(`captured ${filename}\n`)
        }
      }
    }

    if (captures.length !== 8) {
      throw new Error(
        `Expected 8 renderer A/B captures, received ${captures.length}.`,
      )
    }

    const payload = {
      schemaVersion: 1,
      fixture: 'diorama',
      mode: 'renderer-ab',
      floor: 'build',
      furniture: 'kit',
      timeZone: 'Asia/Jakarta',
      captureCount: captures.length,
      captures,
    }
    await writeFile(
      path.join(outputRoot, 'renderer-info.json'),
      `${JSON.stringify(payload, null, 2)}\n`,
      'utf8',
    )

    process.stdout.write(
      'R3F renderer pilot complete: 8 PNG files + renderer-info.json\n',
    )
    process.stdout.write(
      'Three.js and R3F captures both passed the accepted Build call/triangle/light ceilings.\n',
    )
    process.stdout.write(`Artifacts: ${outputRoot}\n`)
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

capture().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
