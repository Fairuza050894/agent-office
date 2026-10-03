import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const repositoryRoot = path.resolve(frontendRoot, '..')
const pilotRequested = process.argv.includes('--pilot')
const outputRoot = path.join(
  repositoryRoot,
  'artifacts',
  pilotRequested ? 'office-pilot-shots' : 'office-shots',
)
const baseUrl = 'http://127.0.0.1:5174'
const v0BudgetPath = path.join(__dirname, 'office-v0-renderer-budget.json')

const fullFloors = ['commons', 'build', 'strategy']
const fullLightingWindows = [
  { key: 'morning', debugTime: '2026-10-05T01:00:00.000Z' },
  { key: 'day', debugTime: '2026-10-05T04:00:00.000Z' },
  { key: 'evening', debugTime: '2026-10-05T11:30:00.000Z' },
  { key: 'night', debugTime: '2026-10-05T16:00:00.000Z' },
]
const pilotLightingWindows = fullLightingWindows.filter(
  (candidate) => candidate.key === 'day' || candidate.key === 'night',
)
const viewports = [
  { key: '1440', width: 1440, height: 1000 },
  { key: '390', width: 390, height: 844 },
]
const floors = pilotRequested ? ['build'] : fullFloors
const lightingWindows = pilotRequested
  ? pilotLightingWindows
  : fullLightingWindows
// Full acceptance must reflect the normal production path. Do not force the
// primitive pilot fallback when generating release-facing screenshots.
const pilotVariants = pilotRequested ? ['primitive', 'kit'] : [null]

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
        `Vite exited before the visual harness was ready (code ${process.exitCode}).`,
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

function expectedBudget(capture, budget) {
  const viewportKey = String(capture.viewport.width)
  const expected = budget.floors?.[capture.floor]?.[viewportKey]
  if (!expected) {
    throw new Error(
      `Missing V0 renderer budget for ${capture.floor}/${viewportKey}.`,
    )
  }
  return expected
}

function assertLightBudget(capture) {
  const lights = capture.renderer.lights
  if (!lights) {
    throw new Error(`Light metrics missing for ${capture.file}.`)
  }
  if (lights.hemisphere !== 1 || lights.directional !== 1) {
    throw new Error(
      `Global lighting contract failed for ${capture.file}: hemisphere=${lights.hemisphere}, directional=${lights.directional}.`,
    )
  }
  if (lights.point > 3 || lights.total > 5) {
    throw new Error(
      `Accent-light budget failed for ${capture.file}: point=${lights.point}, total=${lights.total}.`,
    )
  }
}

function assertProductionRendererBudget(capture, budget) {
  const expected = expectedBudget(capture, budget)

  for (const key of ['calls', 'triangles', 'geometries', 'textures']) {
    if (capture.renderer[key] > expected[key]) {
      throw new Error(
        `Production R3F renderer budget exceeded for ${capture.file}: ${key}=${capture.renderer[key]} > accepted ceiling ${expected[key]}.`,
      )
    }
  }

  assertLightBudget(capture)
}

function assertV2PilotBudget(capture, budget) {
  const expected = expectedBudget(capture, budget)

  for (const key of ['calls', 'triangles']) {
    if (capture.renderer[key] > expected[key]) {
      throw new Error(
        `V2 pilot budget exceeded for ${capture.file}: ${key}=${capture.renderer[key]} > accepted Build ceiling ${expected[key]}.`,
      )
    }
  }

  assertLightBudget(capture)
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

async function waitForPilotSnapshot(page, variant) {
  const handle = await page.waitForFunction(
    (requestedVariant) => {
      const pilot = window.__AGENT_OFFICE_DIARAMA_PILOT__
      if (
        !pilot ||
        pilot.mode !== requestedVariant ||
        (!pilot.ready && !pilot.error)
      ) {
        return false
      }

      return {
        mode: pilot.mode,
        ready: pilot.ready,
        sourceAssetCount: pilot.sourceAssetCount,
        instanceCount: pilot.instanceCount,
        bounds: pilot.bounds ?? null,
        error: pilot.error ?? null,
      }
    },
    variant,
  )

  try {
    return await handle.jsonValue()
  } finally {
    await handle.dispose()
  }
}

function assertPilotState(pilot, variant) {
  if (!pilot) {
    throw new Error(`Pilot state missing for ${variant} capture.`)
  }
  if (pilot.error) {
    throw new Error(`Pilot ${variant} failed: ${pilot.error}`)
  }
  if (!pilot.ready || pilot.mode !== variant) {
    return false
  }

  if (
    variant === 'kit' &&
    (pilot.sourceAssetCount !== 5 || pilot.instanceCount < 40)
  ) {
    throw new Error(
      `Kit pilot did not mount the expected instanced furniture: sources=${pilot.sourceAssetCount}, instances=${pilot.instanceCount}.`,
    )
  }

  if (variant === 'kit') {
    const bounds = pilot.bounds
    if (!bounds) {
      throw new Error('Kit pilot mounted without spatial bounds evidence.')
    }

    const [width, height, depth] = bounds.size
    const [minX, minY, minZ] = bounds.min
    const [maxX, maxY, maxZ] = bounds.max
    const plausible =
      minX >= -5 &&
      maxX <= 5 &&
      minZ >= -1.5 &&
      maxZ <= 4.4 &&
      minY >= -0.15 &&
      maxY <= 2.4 &&
      width >= 5 &&
      depth >= 2 &&
      height >= 0.4

    if (!plausible) {
      throw new Error(
        `Kit pilot bounds are not plausible: min=${bounds.min.join(',')} max=${bounds.max.join(',')} size=${bounds.size.join(',')}.`,
      )
    }
  }

  return true
}

async function waitForPilot(page, variant) {
  let lastObserved = null

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const candidate = await waitForPilotSnapshot(page, variant)
    lastObserved = candidate
    if (!assertPilotState(candidate, variant)) continue

    await page.waitForTimeout(500)

    const confirmed = await page.evaluate((requestedVariant) => {
      const pilot = window.__AGENT_OFFICE_DIARAMA_PILOT__
      if (
        !pilot ||
        pilot.mode !== requestedVariant ||
        !pilot.ready ||
        pilot.error
      ) {
        return null
      }

      return {
        mode: pilot.mode,
        ready: pilot.ready,
        sourceAssetCount: pilot.sourceAssetCount,
        instanceCount: pilot.instanceCount,
        bounds: pilot.bounds ?? null,
        error: pilot.error ?? null,
      }
    }, variant)

    if (!confirmed) continue

    lastObserved = confirmed
    if (assertPilotState(confirmed, variant)) return confirmed
  }

  throw new Error(
    `Pilot ${variant} did not remain ready after 8 settle attempts. Last observed state: ${JSON.stringify(lastObserved)}`,
  )
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
          for (const pilot of pilotVariants) {
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
              floor,
              fixture: 'diorama',
              renderer: 'r3f',
              debugTime: lighting.debugTime,
            })
            if (pilotRequested && pilot) params.set('pilot', pilot)
            const url = `${baseUrl}/office?${params.toString()}`

            await page.goto(url, { waitUntil: 'networkidle' })
            await page.locator('[data-office-diorama-debug="simulated"]').waitFor()
            await page.locator('[data-office-renderer="r3f"] canvas').waitFor()
            await page.waitForFunction(
              () =>
                Boolean(
                  window.__AGENT_OFFICE_DIARAMA__?.ready &&
                    window.__AGENT_OFFICE_DIARAMA__?.rendererInfo,
                ),
            )

            const rendererKind = await page.evaluate(
              () => window.__AGENT_OFFICE_DIARAMA__?.renderer ?? null,
            )
            if (rendererKind !== 'r3f') {
              throw new Error(
                `Visual acceptance captured ${rendererKind ?? 'unknown'} instead of production R3F for ${floor}/${lighting.key}/${viewport.key}.`,
              )
            }

            const pilotState = pilotRequested && pilot
              ? await waitForPilot(page, pilot)
              : null

            // Normal Build production mode mounts the GLB furniture kit
            // asynchronously. Give the settled scene a short deterministic
            // window before renderer metrics and screenshots are collected.
            if (!pilotRequested && floor === 'build') {
              await page.waitForTimeout(900)
            } else {
              await page.waitForTimeout(350)
            }

            const rendererInfo = await page.evaluate(
              () => window.__AGENT_OFFICE_DIARAMA__?.rendererInfo ?? null,
            )
            if (!rendererInfo) {
              throw new Error(
                `Renderer metrics were unavailable for ${floor}/${lighting.key}/${viewport.key}.`,
              )
            }

            const filename = pilotRequested
              ? `${pilot}-${lighting.key}-${viewport.key}.png`
              : `${floor}-${lighting.key}-${viewport.key}.png`

            await page.screenshot({
              path: path.join(outputRoot, filename),
              fullPage: false,
              animations: 'disabled',
            })

            const captureRecord = {
              file: filename,
              floor,
              lighting: lighting.key,
              pilot: pilot ?? null,
              debugTime: lighting.debugTime,
              viewport: {
                width: viewport.width,
                height: viewport.height,
                deviceScaleFactor: 1,
              },
              rendererKind,
              renderer: rendererInfo,
              pilotState,
            }

            if (pilotRequested) {
              assertV2PilotBudget(captureRecord, v0Budget)
            } else {
              assertProductionRendererBudget(captureRecord, v0Budget)
            }
            captures.push(captureRecord)

            await context.close()
            process.stdout.write(`captured ${filename} with ${rendererKind}\n`)
          }
        }
      }
    }

    const expectedCaptureCount =
      floors.length *
      lightingWindows.length *
      viewports.length *
      pilotVariants.length
    if (captures.length !== expectedCaptureCount) {
      throw new Error(
        `Expected ${expectedCaptureCount} Office captures, received ${captures.length}.`,
      )
    }

    const baseline = {
      schemaVersion: pilotRequested ? 2 : 3,
      fixture: 'diorama',
      renderer: 'r3f',
      mode: pilotRequested ? 'pilot-ab' : 'production-visual-acceptance',
      timeZone: 'Asia/Jakarta',
      captureCount: captures.length,
      captures,
    }
    await writeFile(
      path.join(outputRoot, 'renderer-info.json'),
      `${JSON.stringify(baseline, null, 2)}\n`,
      'utf8',
    )

    if (pilotRequested) {
      process.stdout.write(
        `Office V2 pilot A/B complete: ${captures.length} PNG files + renderer-info.json\n`,
      )
      process.stdout.write(
        'V2 pilot draw-call, triangle, and light budgets passed against the accepted Build ceiling.\n',
      )
    } else {
      process.stdout.write(
        `Office production R3F visual acceptance complete: ${captures.length} PNG files + renderer-info.json\n`,
      )
      process.stdout.write(
        'Production R3F renderer/light budgets passed against the accepted ceiling.\n',
      )
    }
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
