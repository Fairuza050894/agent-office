import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, firefox, webkit } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const repositoryRoot = path.resolve(frontendRoot, '..')
const outputRoot = path.join(repositoryRoot, 'artifacts', 'office-browser-qa')
const baseUrl = 'http://127.0.0.1:5175'
const debugTime = '2026-10-05T04:00:00.000Z'

const browserTargets = [
  {
    key: 'chromium',
    type: chromium,
    launchOptions: {
      headless: true,
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  {
    key: 'firefox',
    type: firefox,
    launchOptions: {
      headless: true,
      firefoxUserPrefs: {
        'webgl.disabled': false,
        'webgl.force-enabled': true,
      },
      env: {
        ...process.env,
        LIBGL_ALWAYS_SOFTWARE: '1',
        MOZ_WEBRENDER: '1',
      },
    },
  },
  {
    key: 'webkit',
    type: webkit,
    launchOptions: { headless: true },
  },
]

const floors = ['commons', 'build', 'strategy']
const viewports = [
  { key: 'desktop', width: 1440, height: 1000 },
  { key: 'mobile', width: 390, height: 844 },
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
      throw new Error(
        `Vite exited before browser QA was ready (code ${process.exitCode}).`,
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

async function captureTarget(browserTarget, browser, floor, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'Asia/Jakarta',
  })

  try {
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await configureApiMocks(page)

    const params = new URLSearchParams({
      floor,
      fixture: 'diorama',
      renderer: 'r3f',
      quality: 'fixed',
      debugTime,
    })
    const url = `${baseUrl}/office?${params.toString()}`

    await page.goto(url, { waitUntil: 'networkidle' })
    await page.locator('[data-office-diorama-debug="simulated"]').waitFor()
    const host = page.locator(
      '[data-office-renderer="r3f"][data-office-quality="premium"]',
    )
    await host.waitFor()
    await host.locator('canvas.office-three-canvas').waitFor()
    await page.waitForFunction(
      () =>
        Boolean(
          window.__AGENT_OFFICE_DIARAMA__?.ready &&
            window.__AGENT_OFFICE_DIARAMA__?.rendererInfo,
        ),
    )

    if (floor === 'build') {
      await page.waitForTimeout(900)
    } else {
      await page.waitForTimeout(350)
    }

    const evidence = await page.evaluate(() => ({
      rendererKind: window.__AGENT_OFFICE_DIARAMA__?.renderer ?? null,
      rendererInfo: window.__AGENT_OFFICE_DIARAMA__?.rendererInfo ?? null,
      userAgent: navigator.userAgent,
    }))

    if (evidence.rendererKind !== 'r3f') {
      throw new Error(
        `${browserTarget.key}/${floor}/${viewport.key} rendered ${evidence.rendererKind ?? 'unknown'} instead of R3F.`,
      )
    }
    if (!evidence.rendererInfo) {
      throw new Error(
        `${browserTarget.key}/${floor}/${viewport.key} did not publish renderer evidence.`,
      )
    }
    if (pageErrors.length > 0) {
      throw new Error(
        `${browserTarget.key}/${floor}/${viewport.key} raised page errors: ${pageErrors.join(' | ')}`,
      )
    }

    const dimensions = await host.evaluate((element) => ({
      width: Math.round(element.getBoundingClientRect().width),
      height: Math.round(element.getBoundingClientRect().height),
    }))
    if (dimensions.width < 300 || dimensions.height < 300) {
      throw new Error(
        `${browserTarget.key}/${floor}/${viewport.key} Office host is unexpectedly small: ${JSON.stringify(dimensions)}.`,
      )
    }

    const filename = `${browserTarget.key}-${floor}-${viewport.key}.png`
    await page.screenshot({
      path: path.join(outputRoot, filename),
      fullPage: false,
      animations: 'disabled',
    })

    return {
      file: filename,
      browser: browserTarget.key,
      browserVersion: browser.version(),
      floor,
      viewport: {
        key: viewport.key,
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
      },
      debugTime,
      rendererKind: evidence.rendererKind,
      quality: 'premium-fixed',
      host: dimensions,
      renderer: evidence.rendererInfo,
      userAgent: evidence.userAgent,
    }
  } finally {
    await context.close()
  }
}

async function capture() {
  await rm(outputRoot, { recursive: true, force: true })
  await mkdir(outputRoot, { recursive: true })

  const viteEntry = path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js')
  const server = spawn(
    process.execPath,
    [viteEntry, '--host', '127.0.0.1', '--port', '5175', '--strictPort'],
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

  const captures = []
  try {
    await waitForServer(server)

    for (const browserTarget of browserTargets) {
      let browser
      try {
        browser = await browserTarget.type.launch(browserTarget.launchOptions)
      } catch (error) {
        throw new Error(
          `${browserTarget.key} is unavailable for Office browser QA. Install the Playwright Chromium, Firefox, and WebKit browsers before retrying.\n${error instanceof Error ? error.message : String(error)}`,
        )
      }

      try {
        for (const viewport of viewports) {
          for (const floor of floors) {
            const captureRecord = await captureTarget(
              browserTarget,
              browser,
              floor,
              viewport,
            )
            captures.push(captureRecord)
            process.stdout.write(`captured ${captureRecord.file} with R3F\n`)
          }
        }
      } finally {
        await browser.close()
      }
    }

    const expectedCaptureCount =
      browserTargets.length * floors.length * viewports.length
    if (captures.length !== expectedCaptureCount) {
      throw new Error(
        `Expected ${expectedCaptureCount} browser/device captures, received ${captures.length}.`,
      )
    }

    const manifest = {
      schemaVersion: 1,
      mode: 'browser-device-compatibility',
      fixture: 'diorama',
      renderer: 'r3f',
      quality: 'premium-fixed',
      timeZone: 'Asia/Jakarta',
      debugTime,
      browserCount: browserTargets.length,
      floorCount: floors.length,
      viewportCount: viewports.length,
      captureCount: captures.length,
      captures,
    }
    await writeFile(
      path.join(outputRoot, 'browser-qa.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    )

    process.stdout.write(
      `Office browser/device QA complete: ${captures.length} PNG files + browser-qa.json across Chromium, Firefox, and WebKit.\n`,
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
    await stopServer(server)
  }
}

capture().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
