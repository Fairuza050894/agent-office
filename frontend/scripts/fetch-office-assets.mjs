import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outputRoot = resolve(here, '../public/assets/office')

const SOURCE_COMMIT = '6d73cc9e68839b469f35a2fe11e246eaab2ae426'
const SOURCE_REPOSITORY = 'JadenB9/casino-simulator'

const assets = [
  {
    filename: 'char-m-suit.glb',
    sourcePath: 'client/public/assets/models/char-m-suit.glb',
    gitBlobSha: '32c16cc24a32b0760102d3fd7646dd97d4682efc',
    size: 440404,
  },
  {
    filename: 'char-m-casual.glb',
    sourcePath: 'client/public/assets/models/char-m-casual.glb',
    gitBlobSha: '22200677afc9ef3a9250ccdbf10bb52a1fc9c884',
    size: 395328,
  },
  {
    filename: 'char-m-hoodie.glb',
    sourcePath: 'client/public/assets/models/char-m-hoodie.glb',
    gitBlobSha: '86d6622910bccb45a76c842102baba3ee2d6d170',
    size: 418592,
  },
  {
    filename: 'char-f-dress.glb',
    sourcePath: 'client/public/assets/models/char-f-dress.glb',
    gitBlobSha: 'e655f78f69908d5f53400bf32a970b31c15f81d5',
    size: 415408,
  },
  {
    filename: 'char-f-smart.glb',
    sourcePath: 'client/public/assets/models/char-f-smart.glb',
    gitBlobSha: 'ce39fe182e39e6a44118e5ed1fc33c16167e8804',
    size: 433156,
  },
]

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.byteLength}\0`)
  return createHash('sha1').update(header).update(buffer).digest('hex')
}

function animationNames(buffer) {
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  )
  let offset = 12

  while (offset + 8 <= buffer.byteLength) {
    const chunkLength = view.getUint32(offset, true)
    const chunkType = view.getUint32(offset + 4, true)

    if (chunkType === 0x4e4f534a) {
      const json = JSON.parse(
        buffer
          .subarray(offset + 8, offset + 8 + chunkLength)
          .toString('utf8')
          .replace(/\0+$/, ''),
      )
      return new Set((json.animations ?? []).map((animation) => animation.name))
    }

    offset += 8 + chunkLength
  }

  return new Set()
}

function validBuffer(buffer, expected) {
  if (
    buffer.byteLength !== expected.size ||
    gitBlobSha(buffer) !== expected.gitBlobSha
  ) {
    return false
  }

  const clips = animationNames(buffer)
  return ['Idle', 'Walk', 'Run'].every((name) => clips.has(name))
}

async function validExisting(path, expected) {
  try {
    const buffer = await readFile(path)
    return validBuffer(buffer, expected)
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
  if (!validBuffer(buffer, asset)) {
    throw new Error(
      `Integrity mismatch for ${asset.filename}; expected ${asset.size} bytes / Git blob ${asset.gitBlobSha}`,
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
