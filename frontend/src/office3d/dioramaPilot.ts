import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import {
  engineeringPodPilotPlacements,
  type EngineeringPodPilotPlacement,
} from './environment'

export const OFFICE_DIORAMA_PILOT_ASSET_COUNT = 5

type PilotAssetKey =
  | 'desk'
  | 'chair'
  | 'screen'
  | 'keyboard'
  | 'mouse'

interface PilotAssetDefinition {
  filename: string
  target: THREE.Vector3
}

interface PilotAssetPart {
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
  matrix: THREE.Matrix4
}

interface PilotAssetTemplate {
  parts: PilotAssetPart[]
}

export interface EngineeringPodPilotMount {
  group: THREE.Group
  sourceAssetCount: number
  instanceCount: number
}

const ASSET_ROOT = '/assets/office-pilot/kenney'

const ASSETS: Record<PilotAssetKey, PilotAssetDefinition> = {
  desk: {
    filename: 'desk.glb',
    target: new THREE.Vector3(1.45, 0.98, 0.72),
  },
  chair: {
    filename: 'chairmoderncushion.glb',
    target: new THREE.Vector3(0.58, 0.95, 0.58),
  },
  screen: {
    filename: 'computerscreen.glb',
    target: new THREE.Vector3(0.72, 0.48, 0.22),
  },
  keyboard: {
    filename: 'computerkeyboard.glb',
    target: new THREE.Vector3(0.46, 0.08, 0.22),
  },
  mouse: {
    filename: 'computermouse.glb',
    target: new THREE.Vector3(0.14, 0.09, 0.18),
  },
}

const loader = new GLTFLoader()
const templateCache = new Map<PilotAssetKey, Promise<PilotAssetTemplate>>()

function cloneMaterial(
  material: THREE.Material | THREE.Material[],
): THREE.Material | THREE.Material[] {
  return Array.isArray(material)
    ? material.map((candidate) => candidate.clone())
    : material.clone()
}

function normalizeScale(
  size: THREE.Vector3,
  target: THREE.Vector3,
): number {
  const ratios = [
    size.x > 0 ? target.x / size.x : Number.POSITIVE_INFINITY,
    size.y > 0 ? target.y / size.y : Number.POSITIVE_INFINITY,
    size.z > 0 ? target.z / size.z : Number.POSITIVE_INFINITY,
  ].filter(Number.isFinite)

  if (ratios.length === 0) {
    throw new Error('Pilot GLB has no measurable bounds')
  }

  return Math.min(...ratios)
}

async function loadTemplate(key: PilotAssetKey): Promise<PilotAssetTemplate> {
  const existing = templateCache.get(key)
  if (existing) return existing

  const promise = (async () => {
    const definition = ASSETS[key]
    const gltf = await loader.loadAsync(`${ASSET_ROOT}/${definition.filename}`)
    gltf.scene.updateMatrixWorld(true)

    const bounds = new THREE.Box3().setFromObject(gltf.scene)
    if (bounds.isEmpty()) {
      throw new Error(`Pilot asset ${definition.filename} has empty bounds`)
    }

    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const scale = normalizeScale(size, definition.target)

    const normalize = new THREE.Matrix4()
      .makeScale(scale, scale, scale)
      .multiply(
        new THREE.Matrix4().makeTranslation(
          -center.x,
          -bounds.min.y,
          -center.z,
        ),
      )

    const parts: PilotAssetPart[] = []
    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return

      parts.push({
        geometry: object.geometry.clone(),
        material: cloneMaterial(object.material),
        matrix: normalize.clone().multiply(object.matrixWorld),
      })
    })

    if (parts.length === 0) {
      throw new Error(`Pilot asset ${definition.filename} contains no meshes`)
    }

    return { parts }
  })()

  templateCache.set(key, promise)
  return promise
}

function placementMatrix(placement: {
  position: THREE.Vector3
  yaw: number
}): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    placement.position,
    new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      placement.yaw,
    ),
    new THREE.Vector3(1, 1, 1),
  )
}

function addInstancedAsset(
  parent: THREE.Group,
  key: PilotAssetKey,
  template: PilotAssetTemplate,
  placements: Array<{ position: THREE.Vector3; yaw: number }>,
): number {
  let instances = 0

  template.parts.forEach((part, partIndex) => {
    const mesh = new THREE.InstancedMesh(
      part.geometry.clone(),
      cloneMaterial(part.material),
      placements.length,
    )
    mesh.name = `office-engineering-pod-kit-${key}-${partIndex}`
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)

    placements.forEach((placement, index) => {
      const matrix = placementMatrix(placement).multiply(part.matrix)
      mesh.setMatrixAt(index, matrix)
    })

    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
    parent.add(mesh)
    instances += placements.length
  })

  return instances
}

function placementsFor(
  entries: EngineeringPodPilotPlacement[],
  key: PilotAssetKey,
): Array<{ position: THREE.Vector3; yaw: number }> {
  return entries.map((entry) => {
    if (key === 'chair') return entry.chair
    if (key === 'screen') return entry.screen
    if (key === 'keyboard') return entry.keyboard
    if (key === 'mouse') return entry.mouse
    return entry.desk
  })
}

export async function mountEngineeringPodPilot(
  parent: THREE.Group,
): Promise<EngineeringPodPilotMount> {
  const group = new THREE.Group()
  group.name = 'office-engineering-pod-kit'

  const placements = engineeringPodPilotPlacements()
  const keys = Object.keys(ASSETS) as PilotAssetKey[]
  const templates = await Promise.all(keys.map((key) => loadTemplate(key)))

  let instanceCount = 0
  keys.forEach((key, index) => {
    instanceCount += addInstancedAsset(
      group,
      key,
      templates[index],
      placementsFor(placements, key),
    )
  })

  parent.add(group)
  return {
    group,
    sourceAssetCount: OFFICE_DIORAMA_PILOT_ASSET_COUNT,
    instanceCount,
  }
}
