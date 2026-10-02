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

function maxRendererInfo(samples) {
  const first = samples[0]
  return {
    ...first,
    calls: Math.max(...samples.map((sample) => sample.calls)),
    triangles: Math.max(...samples.map((sample) => sample.triangles)),
    points: Math.max(...samples.map((sample) => sample.points)),
    lines: Math.max(...samples.map((sample) => sample.lines)),
    geometries: Math.max(...samples.map((sample) => sample.geometries)),
    textures: Math.max(...samples.map((sample) => sample.textures)),
  }
}

async function readRendererEvidence(page) {
  return page.evaluate(() => ({
    renderer:
      window.__AGENT_OFFICE_DIARAMA__?.renderer ?? 'three',
    rendererInfo:
      window.__AGENT_OFFICE_DIARAMA__?.rendererInfo ?? null,
    characterReadiness:
      window.__AGENT_OFFICE_DIARAMA__?.characterReadiness ?? null,
    pilot:
      window.__AGENT_OFFICE_DIARAMA_PILOT__ ?? null,
  }))
}

function rendererPresentationReady(evidence, requestedRenderer) {
  const rendererMatches =
    requestedRenderer === 'r3f'
      ? evidence.renderer === 'r3f'
      : evidence.renderer === 'three'

  const pilot = evidence.pilot
  const kitReady =
    pilot?.mode === 'kit' &&
    pilot.ready === true &&
    !pilot.error &&
    pilot.sourceAssetCount === 5 &&
    pilot.instanceCount >= 40 &&
    Boolean(pilot.bounds)

  const characters = evidence.characterReadiness
  const charactersReady =
    characters &&
    characters.expected > 0 &&
    characters.rigged === characters.expected &&
    characters.fallback === 0

  return Boolean(
    rendererMatches &&
      evidence.rendererInfo &&
      kitReady &&
      charactersReady,
  )
}

async function waitForRendererSettled(page, requestedRenderer) {
  await page.waitForFunction(
    (rendererMode) => {
      const evidence = window.__AGENT_OFFICE_DIARAMA__
      const pilot = window.__AGENT_OFFICE_DIARAMA_PILOT__
      if (!evidence?.ready || !evidence.rendererInfo) return false

      const rendererMatches =
        rendererMode === 'r3f'
          ? evidence.renderer === 'r3f'
          : evidence.renderer === 'three'
      const kitReady =
        pilot?.mode === 'kit' &&
        pilot.ready === true &&
        !pilot.error &&
        pilot.sourceAssetCount === 5 &&
        pilot.instanceCount >= 40 &&
        Boolean(pilot.bounds)
      const characters = evidence.characterReadiness
      const charactersReady =
        characters &&
        characters.expected > 0 &&
        characters.rigged === characters.expected &&
        characters.fallback === 0

      return Boolean(rendererMatches && kitReady && charactersReady)
    },
    requestedRenderer,
    { timeout: 30_000 },
  )

  const samples = []
  let lastEvidence = null

  // Readiness and renderer sampling are deliberately separate phases.
  // Once the presentation is complete, keep up to four conservative GPU
  // samples. A transient remount restarts only this sampling window.
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const evidence = await readRendererEvidence(page)
    lastEvidence = evidence

    if (evidence.pilot?.error) {
      throw new Error(
        `Kit load failed while sampling ${requestedRenderer}: ${evidence.pilot.error}`,
      )
    }

    if (!rendererPresentationReady(evidence, requestedRenderer)) {
      samples.length = 0
      await page.waitForTimeout(250)
      continue
    }

    samples.push(evidence)

    if (samples.length >= 4) {
      const rendererSamples = samples.map(
        (sample) => sample.rendererInfo,
      )
      return {
        ...evidence,
        rendererInfo: maxRendererInfo(rendererSamples),
        rendererSamples,
      }
    }

    await page.waitForTimeout(250)
  }

  throw new Error(
    `Renderer became presentation-ready but did not remain sampleable for ${requestedRenderer}. Last evidence: ${JSON.stringify(lastEvidence)}`,
  )
}

function rendererBudgetViolations(capture) {
  const ceiling = buildCeilings[String(capture.viewport.width)]
  if (!ceiling) {
    return [`No renderer ceiling for ${capture.file}`]
  }

  const violations = []
  if (capture.renderer.calls > ceiling.calls) {
    violations.push(
      `calls=${capture.renderer.calls} > ${ceiling.calls}`,
    )
  }
  if (capture.renderer.triangles > ceiling.triangles) {
    violations.push(
      `triangles=${capture.renderer.triangles} > ${ceiling.triangles}`,
    )
  }

  const lights = capture.renderer.lights
  if (!lights) {
    violations.push('light metrics missing')
  } else {
    if (lights.hemisphere !== 1) {
      violations.push(
        `hemisphere lights=${lights.hemisphere} > expected 1`,
      )
    }
    if (lights.directional !== 1) {
      violations.push(
        `directional lights=${lights.directional} > expected 1`,
      )
    }
    if (lights.point > 3) {
      violations.push(`point lights=${lights.point} > 3`)
    }
    if (lights.total > 5) {
      violations.push(`total lights=${lights.total} > 5`)
    }
  }

  return violations
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

          const evidence = await waitForRendererSettled(page, renderer)

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
            rendererSamples: evidence.rendererSamples,
            characterReadiness: evidence.characterReadiness,
            pilotState: evidence.pilot,
          }
          record.budgetViolations = rendererBudgetViolations(record)
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

    const budgetFailures = captures.flatMap((capture) =>
      capture.budgetViolations.map((violation) => ({
        file: capture.file,
        rendererMode: capture.rendererMode,
        violation,
      })),
    )

    const payload = {
      schemaVersion: 2,
      fixture: 'diorama',
      mode: 'renderer-ab',
      floor: 'build',
      furniture: 'kit',
      timeZone: 'Asia/Jakarta',
      captureCount: captures.length,
      budgetStatus: {
        passed: budgetFailures.length === 0,
        violationCount: budgetFailures.length,
        violations: budgetFailures,
      },
      captures,
    }
    await writeFile(
      path.join(outputRoot, 'renderer-info.json'),
      `${JSON.stringify(payload, null, 2)}\n`,
      'utf8',
    )

    process.stdout.write(
      'R3F renderer pilot capture complete: 8 PNG files + renderer-info.json\n',
    )
    process.stdout.write(`Artifacts: ${outputRoot}\n`)

    if (budgetFailures.length > 0) {
      process.stderr.write(
        `Renderer comparison completed with ${budgetFailures.length} budget violation(s):\n`,
      )
      for (const failure of budgetFailures) {
        process.stderr.write(
          `- ${failure.file}: ${failure.violation}\n`,
        )
      }
      process.stderr.write(
        'Evidence was retained for full Three.js vs R3F review; accepted ceilings were not changed.\n',
      )
      process.exitCode = 1
      return
    }

    process.stdout.write(
      'Three.js and R3F captures both passed the accepted Build call/triangle/light ceilings.\n',
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

capture().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
