import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const repositoryRoot = path.resolve(frontendRoot, '..')
const outputRoot = path.join(repositoryRoot, 'artifacts', 'target-ui-shell')
const baseUrl = 'http://127.0.0.1:5176'

const viewports = [
  { key: '1440', width: 1440, height: 1000 },
  { key: '1024', width: 1024, height: 900 },
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
      throw new Error(
        `Vite exited before target shell capture was ready (code ${process.exitCode}).`,
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
  await page.route('**/health', (route) => jsonResponse(route, { status: 'ok' }))
  await page.route('**/api/projects', (route) => jsonResponse(route, []))
}

async function capture() {
  await rm(outputRoot, { recursive: true, force: true })
  await mkdir(outputRoot, { recursive: true })

  const viteEntry = path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js')
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

    const captures = []
    for (const viewport of viewports) {
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
      await page.goto(`${baseUrl}/projects`, { waitUntil: 'networkidle' })
      await page.getByRole('banner').waitFor()
      await page
        .getByRole('navigation', { name: 'Primary Navigation' })
        .waitFor({ state: viewport.width <= 920 ? 'hidden' : 'visible' })

      const filename = `shell-projects-${viewport.key}.png`
      await page.screenshot({
        path: path.join(outputRoot, filename),
        fullPage: false,
        animations: 'disabled',
      })
      captures.push({
        file: filename,
        route: '/projects',
        viewport: {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
        },
      })
      await context.close()
      process.stdout.write(`captured ${filename}\n`)
    }

    await writeFile(
      path.join(outputRoot, 'capture-info.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          scope: 'target-ui-shell',
          route: '/projects',
          canonicalDataFixture: 'empty-registry',
          captureCount: captures.length,
          captures,
        },
        null,
        2,
      )}\n`,
      'utf8',
    )

    process.stdout.write(
      `Target UI shell capture complete: ${captures.length} PNG files + capture-info.json\n`,
    )
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
