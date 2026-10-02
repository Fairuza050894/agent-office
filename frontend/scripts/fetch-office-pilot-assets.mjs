import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outputRoot = resolve(here, '../public/assets/office-pilot/kenney')

const SOURCE_REPOSITORY = 'Hidencod/tge-assets'
const SOURCE_COMMIT = '1f7dee9076ee848773f08fd632ab4e4e73357777'

const assets = [
  {
    filename: 'desk.glb',
    sourcePath: 'packs/furniture-kit/desk.glb',
    gitBlobSha: '8ca187070cd666239ab1d93dda2e98105f7de776',
    size: 15048,
  },
  {
    filename: 'chairmoderncushion.glb',
    sourcePath: 'packs/furniture-kit/chairmoderncushion.glb',
    gitBlobSha: 'a6c18d94ec17231807043b0fb18e766b020ec81e',
    size: 7376,
  },
  {
    filename: 'computerscreen.glb',
    sourcePath: 'packs/furniture-kit/computerscreen.glb',
    gitBlobSha: 'c509093d35ee40bb6791dde9ad8e9de4bc3348dd',
    size: 6404,
  },
  {
    filename: 'computerkeyboard.glb',
    sourcePath: 'packs/furniture-kit/computerkeyboard.glb',
    gitBlobSha: '77e5b4fc0d2d4c748173068f8ec325497f3c9011',
    size: 3476,
  },
  {
    filename: 'computermouse.glb',
    sourcePath: 'packs/furniture-kit/computermouse.glb',
    gitBlobSha: '333b20fad5121354f165ca7f77b6f2e777691bbb',
    size: 5868,
  },
]

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.byteLength}\0`)
  return createHash('sha1').update(header).update(buffer).digest('hex')
}

function hasGlbHeader(buffer) {
  return (
    buffer.byteLength >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'glTF' &&
    buffer.readUInt32LE(4) === 2
  )
}

function validBuffer(buffer, expected) {
  return (
    hasGlbHeader(buffer) &&
    buffer.byteLength === expected.size &&
    gitBlobSha(buffer) === expected.gitBlobSha
  )
}

async function validExisting(path, expected) {
  try {
    return validBuffer(await readFile(path), expected)
  } catch {
    return false
  }
}

async function fetchAsset(asset) {
  const destination = resolve(outputRoot, asset.filename)
  if (await validExisting(destination, asset)) {
    console.log(`office pilot asset verified: ${asset.filename}`)
    return
  }

  const url =
    `https://raw.githubusercontent.com/${SOURCE_REPOSITORY}/${SOURCE_COMMIT}/${asset.sourcePath}`

  console.log(`fetching office pilot asset: ${asset.filename}`)
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'agent-office-pilot-asset-bootstrap' },
  })
  if (!response.ok) {
    throw new Error(
      `Failed to fetch pilot asset ${asset.filename}: HTTP ${response.status}`,
    )
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (!validBuffer(buffer, asset)) {
    throw new Error(
      `Integrity mismatch for pilot asset ${asset.filename}; expected ${asset.size} bytes / Git blob ${asset.gitBlobSha}`,
    )
  }

  await writeFile(destination, buffer)
  console.log(`office pilot asset ready: ${asset.filename}`)
}

await mkdir(outputRoot, { recursive: true })

const expectedFiles = new Set(assets.map((asset) => asset.filename))
for (const filename of await readdir(outputRoot)) {
  if (!expectedFiles.has(filename)) {
    await rm(resolve(outputRoot, filename), { recursive: true, force: true })
    console.log(`removed stale office pilot asset: ${filename}`)
  }
}

try {
  for (const asset of assets) await fetchAsset(asset)
} catch (error) {
  for (const asset of assets) {
    const destination = resolve(outputRoot, asset.filename)
    if (!(await validExisting(destination, asset))) {
      await rm(destination, { force: true })
    }
  }
  throw error
}
