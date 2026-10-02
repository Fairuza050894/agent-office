import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const baseUrl = 'http://127.0.0.1:4174'

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
  await page.route('**/api/projects**', (route) =>
    jsonResponse(route, []),
  )
  await page.route('**/api/executors**', (route) =>
    jsonResponse(route, []),
  )
  await page.route('**/api/agent-profiles**', (route) =>
    jsonResponse(route, []),
  )
}

async function run() {
  const viteEntry = path.join(
    frontendRoot,
    'node_modules',
    'vite',
    'bin',
    'vite.js',
  )
  const server = spawn(
    process.execPath,
    [
      viteEntry,
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      '4174',
      '--strictPort',
    ],
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
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    await configureApiMocks(page)
    await page.goto(`${baseUrl}/office`, {
      waitUntil: 'networkidle',
    })

    await page.getByText('Planning Office', { exact: true }).waitFor()
    const host = page.locator('[data-office-renderer="r3f"]')
    await host.waitFor()
    await host.locator('canvas.office-three-canvas').waitFor()

    const dimensions = await host.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
    }))

    if (dimensions.width < 600 || dimensions.height < 300) {
      throw new Error(
        `Production R3F Planning host is unexpectedly small: ${JSON.stringify(dimensions)}`,
      )
    }

    if (
      (await page.locator('[data-office-diorama-debug="simulated"]').count()) >
      0
    ) {
      throw new Error(
        'Development Diorama fixture leaked into production Planning Office.',
      )
    }

    if (pageErrors.length > 0) {
      throw new Error(
        `Production Planning Office raised page errors: ${pageErrors.join(' | ')}`,
      )
    }

    await context.close()
    process.stdout.write(
      'Production Planning Office rendered through R3F with no Diorama fixture leakage.\n',
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
