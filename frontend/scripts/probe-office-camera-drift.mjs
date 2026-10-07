import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const baseUrl = 'http://127.0.0.1:5179'
const targetPath = process.argv[2] ?? '/office?project=probe&cameraProbe=1'

// Bounded envelope from src/office3d/camera.ts OFFICE_CAMERA_CONTROL_POLICY.
const MIN_DISTANCE = 7.5
const MAX_DISTANCE = 18.5
const EPSILON = 1e-3

const failures = []
const assert = (condition, message) => {
  if (!condition) failures.push(message)
}

function spawnVite() {
  const viteEntry = path.join(
    frontendRoot,
    'node_modules',
    'vite',
    'bin',
    'vite.js',
  )
  return spawn(
    process.execPath,
    [viteEntry, '--host', '127.0.0.1', '--port', '5179', '--strictPort'],
    {
      cwd: frontendRoot,
      env: { ...process.env, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
}

async function waitForServer(server, timeoutMs = 20_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (server.exitCode !== null) throw new Error('Vite exited early.')
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for Vite at ${baseUrl}.`)
}

async function stopServer(server) {
  if (server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ])
  if (server.exitCode === null) server.kill('SIGKILL')
}

const probe = async (page) =>
  page.evaluate(() => window.__AGENT_OFFICE_CAMERA_PROBE__ ?? null)

const distance = (sample) => sample?.distance ?? Number.NaN

async function withModifier(page, key, deltaY, times) {
  await page.keyboard.down(key)
  try {
    for (let i = 0; i < times; i += 1) {
      await page.mouse.wheel(0, deltaY)
    }
  } finally {
    await page.keyboard.up(key)
  }
  await page.waitForTimeout(500)
}

async function drift() {
  const server = spawnVite()
  let browser
  try {
    await waitForServer(server)
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    await page.goto(`${baseUrl}${targetPath}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)

    const canvas = page.locator('.office-three-host canvas').first()
    await canvas.hover()

    // 1. Idle stability: camera must not drift on its own.
    const samples = []
    for (let i = 0; i < 4; i += 1) {
      samples.push(await probe(page))
      await page.waitForTimeout(500)
    }
    const origin = samples[0]
    for (const sample of samples) {
      assert(
        Math.abs(distance(sample) - distance(origin)) < EPSILON,
        `idle drift: distance ${distance(sample)} != ${distance(origin)}`,
      )
    }

    // 2. Plain wheel must scroll the page, not move the camera.
    const beforePlain = await probe(page)
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(600)
    const afterPlain = await probe(page)
    assert(
      Math.abs(distance(afterPlain) - distance(beforePlain)) < EPSILON,
      'plain wheel moved the camera',
    )

    // 3. Ctrl/Cmd+wheel must dolly in, bounded by minDistance.
    await withModifier(page, 'Control', -400, 40)
    const zoomedIn = await probe(page)
    assert(
      distance(zoomedIn) < distance(beforePlain) - EPSILON,
      `ctrl+wheel (in) did not dolly in: ${distance(zoomedIn)}`,
    )
    assert(
      distance(zoomedIn) >= MIN_DISTANCE - EPSILON,
      `ctrl+wheel (in) escaped minDistance: ${distance(zoomedIn)}`,
    )

    // 4. Ctrl/Cmd+wheel must dolly out, bounded by maxDistance.
    await withModifier(page, 'Control', 400, 80)
    const zoomedOut = await probe(page)
    assert(
      distance(zoomedOut) > distance(zoomedIn) + EPSILON,
      `ctrl+wheel (out) did not dolly out: ${distance(zoomedOut)}`,
    )
    assert(
      distance(zoomedOut) <= MAX_DISTANCE + EPSILON,
      `ctrl+wheel (out) escaped maxDistance: ${distance(zoomedOut)}`,
    )
    assert(
      zoomedIn.zoomEnabled === false && zoomedOut.zoomEnabled === false,
      'OrbitControls.enableZoom must stay false',
    )

    console.log(
      JSON.stringify(
        {
          idle: samples.map(distance),
          plainWheel: [distance(beforePlain), distance(afterPlain)],
          ctrlWheelIn: distance(zoomedIn),
          ctrlWheelOut: distance(zoomedOut),
          envelope: [MIN_DISTANCE, MAX_DISTANCE],
          failures,
        },
        null,
        2,
      ),
    )

    if (failures.length > 0) {
      console.error(`camera drift probe FAILED (${failures.length}):`)
      for (const failure of failures) console.error(`- ${failure}`)
      process.exitCode = 1
    } else {
      console.log('camera drift probe passed')
    }

    await context.close()
  } finally {
    if (browser) await browser.close()
    await stopServer(server)
  }
}

drift().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
})
