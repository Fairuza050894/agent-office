import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const repositoryRoot = path.resolve(frontendRoot, '..')
const outputRoot = path.join(repositoryRoot, 'artifacts', 'office-shots')
const baseUrl = 'http://127.0.0.1:5174'

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

async function capture() {
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

          captures.push({
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
          })

          await context.close()
          process.stdout.write(`captured ${filename}\n`)
        }
      }
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
