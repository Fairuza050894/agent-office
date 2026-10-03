import { createHash } from 'node:crypto'
import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distRoot = path.resolve(__dirname, '..', 'dist')
const markers = [
  '__AGENT_OFFICE_DIARAMA__',
  'data-office-diorama-debug',
  'Simulated Product Manager',
  'Office Diorama fixture',
  '__AGENT_OFFICE_DIARAMA_PILOT__',
  'office-pilot/kenney',
  'Kenney kit pilot',
  'R3F renderer pilot',
  'office-renderer-pilot-shots',
]

// The three production modes intentionally share one lazy R3F bundle. Vite
// can fold mode-specific aria labels into a dynamic expression during
// minification, so the static bundle guard proves the shared production path
// while the Chromium smoke below proves Planning / Live / Replay separately.
const requiredProductionMarkers = [
  'office-three-host-r3f',
  'data-office-renderer',
  'data-office-scope',
  'office-r3f-canvas-shell',
]

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await filesUnder(target)))
    } else if (/\.(?:js|css|html)$/.test(entry.name)) {
      files.push(target)
    }
  }

  return files
}

const files = await filesUnder(distRoot)
const failures = []
const observedProductionMarkers = new Set()

for (const file of files) {
  const content = await readFile(file, 'utf8')
  for (const marker of markers) {
    if (content.includes(marker)) failures.push({ file, marker })
  }
  for (const marker of requiredProductionMarkers) {
    if (content.includes(marker)) observedProductionMarkers.add(marker)
  }
}

for (const marker of requiredProductionMarkers) {
  if (!observedProductionMarkers.has(marker)) {
    failures.push({
      file: distRoot,
      marker: `required production R3F marker missing: ${marker}`,
    })
  }
}

try {
  await access(path.join(distRoot, 'assets', 'office-pilot'))
  failures.push({
    file: path.join(distRoot, 'assets', 'office-pilot'),
    marker: 'pilot asset directory',
  })
} catch {
  // Expected: production build must not contain legacy pilot assets.
}

const furnitureRoot = path.join(
  distRoot,
  'assets',
  'office',
  'furniture',
  'kenney-v1',
)
const expectedFurniture = [
  ['desk.glb', 15048, '8ca187070cd666239ab1d93dda2e98105f7de776'],
  [
    'chairmoderncushion.glb',
    7376,
    'a6c18d94ec17231807043b0fb18e766b020ec81e',
  ],
  [
    'computerscreen.glb',
    6404,
    'c509093d35ee40bb6791dde9ad8e9de4bc3348dd',
  ],
  [
    'computerkeyboard.glb',
    3476,
    '77e5b4fc0d2d4c748173068f8ec325497f3c9011',
  ],
  [
    'computermouse.glb',
    5868,
    '333b20fad5121354f165ca7f77b6f2e777691bbb',
  ],
]

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.byteLength}\0`)
  return createHash('sha1').update(header).update(buffer).digest('hex')
}

for (const [filename, expectedSize, expectedSha] of expectedFurniture) {
  const target = path.join(furnitureRoot, filename)
  try {
    const buffer = await readFile(target)
    if (
      buffer.byteLength !== expectedSize ||
      gitBlobSha(buffer) !== expectedSha
    ) {
      failures.push({
        file: target,
        marker: 'furniture integrity mismatch',
      })
    }
  } catch {
    failures.push({
      file: target,
      marker: 'required production furniture missing',
    })
  }
}

if (failures.length > 0) {
  console.error('Production Office verification failed:')
  for (const failure of failures) {
    console.error(`- ${path.relative(distRoot, failure.file)}: ${failure.marker}`)
  }
  process.exitCode = 1
} else {
  console.log('Production bundle contains no Diorama debug/pilot leakage, includes verified Office furniture assets, and contains the shared production R3F renderer path. Planning / Live / Replay mode coverage is enforced by the Chromium production smoke.')
}
