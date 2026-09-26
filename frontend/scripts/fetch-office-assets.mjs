import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outputRoot = resolve(here, '../public/assets/office')

const SOURCE_COMMIT = 'aa02a4e6d8337a0604d2da131bcbbeb1f01badf0'
const SOURCE_REPOSITORY = 'Seyamalam/blood-league-kickoff'

const assets = [
  {
    filename: 'quaternius-office-character.glb',
    sourcePath:
      'public/assets/vendor/quaternius/night-striker.glb',
    sha256:
      'a466828c67a4acc9b2413212ce6d9cde235e3aed9b675680c14fd9673858f118',
    size: 6465208,
  },
  {
    filename: 'quaternius-universal-animation-library.glb',
    sourcePath:
      'public/assets/vendor/quaternius/universal-animation-library.glb',
    sha256:
      '4c748767741a3e495d89667b9a218b690ba9810b9517a12e960780e3ca72c4e9',
    size: 2714756,
  },
]

function digest(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function validExisting(path, expected) {
  try {
    const buffer = await readFile(path)
    return (
      buffer.byteLength === expected.size &&
      digest(buffer) === expected.sha256
    )
  } catch {
    return false
  }
}

async function fetchAsset(asset) {
  const destination = resolve(outputRoot, asset.filename)
  if (await validExisting(destination, asset)) {
    console.log(`office asset verified: ${asset.filename}`)
    return
  }

  const url =
    `https://raw.githubusercontent.com/${SOURCE_REPOSITORY}/${SOURCE_COMMIT}/${asset.sourcePath}`

  console.log(`fetching office asset: ${asset.filename}`)
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'agent-office-asset-bootstrap' },
  })
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${asset.filename}: HTTP ${response.status}`,
    )
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength !== asset.size) {
    throw new Error(
      `Unexpected size for ${asset.filename}: ${buffer.byteLength} bytes`,
    )
  }

  const actual = digest(buffer)
  if (actual !== asset.sha256) {
    throw new Error(
      `Checksum mismatch for ${asset.filename}: expected ${asset.sha256}, got ${actual}`,
    )
  }

  await writeFile(destination, buffer)
  console.log(`office asset ready: ${asset.filename}`)
}

await mkdir(outputRoot, { recursive: true })

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
