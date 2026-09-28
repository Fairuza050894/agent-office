import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outputRoot = resolve(here, '../public/assets/office')

const CHARACTER_SOURCE = {
  commit: '6d73cc9e68839b469f35a2fe11e246eaab2ae426',
  repository: 'JadenB9/casino-simulator',
}

const ANIMATION_SOURCE = {
  commit: 'e24c23cf2a1323488a3faa226ea7ea21f644b73e',
  repository: 'J-Ponzo/gltf-universal-animation-library',
}

const characterAssets = [
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

const animationAssets = [
  {
    filename: 'AnimationLibrary_Godot_Standard.gltf',
    sourcePath: 'glTF/AnimationLibrary_Godot_Standard.gltf',
    gitBlobSha: 'd9e132ad1d41089f8f96488775829d220a4beb05',
    size: 2459987,
  },
  {
    filename: 'AnimationLibrary_Godot_Standard.bin',
    sourcePath: 'glTF/AnimationLibrary_Godot_Standard.bin',
    gitBlobSha: '481652b8b1571b15c254b44f4d9b9f702498f948',
    size: 1587224,
  },
]

const REQUIRED_CHARACTER_CLIPS = ['Idle', 'Walk', 'Run']
const REQUIRED_BEHAVIOR_CLIPS = [
  'Idle_Talking_Loop',
  'Interact',
  'PickUp_Table',
  'Sitting_Idle_Loop',
  'Sitting_Talking_Loop',
]

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.byteLength}\0`)
  return createHash('sha1').update(header).update(buffer).digest('hex')
}

function glbJson(buffer) {
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
      return JSON.parse(
        buffer
          .subarray(offset + 8, offset + 8 + chunkLength)
          .toString('utf8')
          .replace(/\0+$/, ''),
      )
    }

    offset += 8 + chunkLength
  }

  throw new Error('GLB JSON chunk is missing.')
}

function animationNamesFromJson(json) {
  return new Set((json.animations ?? []).map((animation) => animation.name))
}

function validIntegrity(buffer, expected) {
  return (
    buffer.byteLength === expected.size &&
    gitBlobSha(buffer) === expected.gitBlobSha
  )
}

function validCharacterBuffer(buffer, expected) {
  if (!validIntegrity(buffer, expected)) return false

  const clips = animationNamesFromJson(glbJson(buffer))
  return REQUIRED_CHARACTER_CLIPS.every((name) => clips.has(name))
}

function validAnimationJsonBuffer(buffer, expected) {
  if (!validIntegrity(buffer, expected)) return false

  const json = JSON.parse(buffer.toString('utf8'))
  const clips = animationNamesFromJson(json)
  return REQUIRED_BEHAVIOR_CLIPS.every((name) => clips.has(name))
}

async function validExisting(path, expected, validator) {
  try {
    const buffer = await readFile(path)
    return validator(buffer, expected)
  } catch {
    return false
  }
}

async function fetchAsset(asset, source, validator) {
  const destination = resolve(outputRoot, asset.filename)
  if (await validExisting(destination, asset, validator)) {
    console.log(`office asset verified: ${asset.filename}`)
    return
  }

  const url =
    `https://raw.githubusercontent.com/${source.repository}/${source.commit}/${asset.sourcePath}`

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
  if (!validator(buffer, asset)) {
    throw new Error(
      `Integrity mismatch for ${asset.filename}; expected ${asset.size} bytes / Git blob ${asset.gitBlobSha}`,
    )
  }

  await writeFile(destination, buffer)
  console.log(`office asset ready: ${asset.filename}`)
}

function animationTargetNames(json, clipNames) {
  const targets = new Set()

  for (const animation of json.animations ?? []) {
    if (!clipNames.includes(animation.name)) continue

    for (const channel of animation.channels ?? []) {
      const node = json.nodes?.[channel.target?.node]
      if (node?.name) targets.add(node.name)
    }
  }

  return targets
}

async function verifyBehaviorRigCompatibility() {
  const animationJson = JSON.parse(
    await readFile(
      resolve(outputRoot, 'AnimationLibrary_Godot_Standard.gltf'),
      'utf8',
    ),
  )
  const requiredTargets = animationTargetNames(
    animationJson,
    REQUIRED_BEHAVIOR_CLIPS,
  )

  if (requiredTargets.size === 0) {
    throw new Error('Behavior animation library exposes no target bones.')
  }

  for (const asset of characterAssets) {
    const characterJson = glbJson(
      await readFile(resolve(outputRoot, asset.filename)),
    )
    const characterNodes = new Set(
      (characterJson.nodes ?? [])
        .map((node) => node.name)
        .filter(Boolean),
    )
    const missing = [...requiredTargets].filter(
      (target) => !characterNodes.has(target),
    )

    if (missing.length > 0) {
      throw new Error(
        `Office character ${asset.filename} is not compatible with the behavior animation rig; missing targets: ${missing.slice(0, 8).join(', ')}`,
      )
    }
  }

  console.log(
    `office behavior rig verified: ${requiredTargets.size} targeted bones across ${characterAssets.length} character variants`,
  )
}

await mkdir(outputRoot, { recursive: true })

try {
  for (const asset of characterAssets) {
    await fetchAsset(asset, CHARACTER_SOURCE, validCharacterBuffer)
  }

  for (const asset of animationAssets) {
    const validator = asset.filename.endsWith('.gltf')
      ? validAnimationJsonBuffer
      : validIntegrity
    await fetchAsset(asset, ANIMATION_SOURCE, validator)
  }

  await verifyBehaviorRigCompatibility()
} catch (error) {
  for (const asset of [...characterAssets, ...animationAssets]) {
    const destination = resolve(outputRoot, asset.filename)
    const source = characterAssets.includes(asset)
      ? CHARACTER_SOURCE
      : ANIMATION_SOURCE
    const validator = asset.filename.endsWith('.glb')
      ? validCharacterBuffer
      : asset.filename.endsWith('.gltf')
        ? validAnimationJsonBuffer
        : validIntegrity

    if (!(await validExisting(destination, asset, validator))) {
      await rm(destination, { force: true })
    }

    void source
  }
  throw error
}
