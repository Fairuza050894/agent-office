import { readFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(here, '..')
const assetRoot = resolve(frontendRoot, 'public/assets/office')
const characterSourcePath = resolve(frontendRoot, 'src/office3d/character.ts')
const livingOfficeSourcePath = resolve(frontendRoot, 'src/office3d/livingOffice.ts')
const bootstrapPath = resolve(here, 'fetch-office-assets.mjs')

const CHARACTER_ASSETS = [
  'char-m-suit.glb',
  'char-m-casual.glb',
  'char-m-hoodie.glb',
  'char-f-dress.glb',
  'char-f-smart.glb',
]

const CORE_ROLES = [
  'product-manager',
  'system-analyst',
  'principal-engineer',
  'product-designer',
  'backend-engineer',
  'frontend-engineer',
  'qa-engineer',
  'security-reviewer',
  'technical-writer',
]

function animationNames(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
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

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const [characterSource, livingOfficeSource, bootstrapSource] = await Promise.all([
  readFile(characterSourcePath, 'utf8'),
  readFile(livingOfficeSourcePath, 'utf8'),
  readFile(bootstrapPath, 'utf8'),
])

assert(
  bootstrapSource.includes("const SOURCE_COMMIT = '") &&
    bootstrapSource.includes("const SOURCE_REPOSITORY = '"),
  'Office character bootstrap must pin source repository and commit provenance.',
)

for (const role of CORE_ROLES) {
  assert(
    livingOfficeSource.includes(`'${role}'`),
    `Living Office core role missing from canonical roster: ${role}`,
  )
  assert(
    characterSource.includes(`'${role}': {`),
    `Production character appearance missing for core role: ${role}`,
  )
}

const appearanceIds = [...characterSource.matchAll(/id: '([^']+)'/g)].map(
  (match) => match[1],
)
assert(
  new Set(appearanceIds).size === appearanceIds.length,
  'Character appearance ids must be unique.',
)

for (const filename of CHARACTER_ASSETS) {
  const path = resolve(assetRoot, filename)
  const metadata = await stat(path)
  assert(metadata.size > 250_000, `${filename} is unexpectedly small.`)

  const buffer = await readFile(path)
  assert(
    buffer.subarray(0, 4).toString('ascii') === 'glTF',
    `${filename} is not a valid binary glTF container.`,
  )

  const clips = animationNames(buffer)
  for (const required of ['Idle', 'Walk', 'Run']) {
    assert(clips.has(required), `${filename} is missing required ${required} clip.`)
  }

  assert(
    bootstrapSource.includes(`filename: '${filename}'`) &&
      bootstrapSource.includes('gitBlobSha:'),
    `${filename} must remain integrity-pinned in the asset bootstrap.`,
  )
}

console.log(
  `Office character production guard passed: ${CORE_ROLES.length} core roles / ${CHARACTER_ASSETS.length} integrity-pinned rigged variants.`,
)
