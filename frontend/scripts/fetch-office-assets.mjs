import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outputRoot = resolve(here, '../public/assets/office')

const SOURCE_COMMIT = '9ab58fecc42490b9212d62813a778c0cc8158726'
const SOURCE_REPOSITORY = 'dantol29/wall_street_online'

const assets = [
  {
    filename: 'quaternius-business-man.glb',
    sourcePath: 'apps/client/public/assets/BusinessMan.glb',
    sha256:
      '82b81257c1e94cd9ee48cb1dcbe5ff506e81c9ce67cd0c5af542d8712dca546e',
    size: 1529248,
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
