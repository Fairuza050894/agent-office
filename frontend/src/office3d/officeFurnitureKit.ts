import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import {
  engineeringPodPilotPlacements,
  type EngineeringPodPilotPlacement,
} from './environment'

export const OFFICE_FURNITURE_KIT_ASSET_COUNT = 5
export const OFFICE_FURNITURE_ASSET_ROOT =
  '/assets/office/furniture/kenney-v1'

export type OfficeFurnitureAssetKey =
  | 'desk'
  | 'chair'
  | 'screen'
  | 'keyboard'
  | 'mouse'

interface FurnitureAssetDefinition {
  filename: string
  target: THREE.Vector3
}

interface FurnitureAssetPart {
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
}

interface FurnitureAssetTemplate {
  parts: FurnitureAssetPart[]
}

export interface EngineeringPodFurnitureBounds {
  min: [number, number, number]
  max: [number, number, number]
  size: [number, number, number]
}

export interface EngineeringPodFurnitureMount {
  group: THREE.Group
  sourceAssetCount: number
  instanceCount: number
  bounds: EngineeringPodFurnitureBounds
}

const ASSETS: Record<OfficeFurnitureAssetKey, FurnitureAssetDefinition> = {
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
const templateCache = new Map<
  OfficeFurnitureAssetKey,
  Promise<FurnitureAssetTemplate>
>()

// Phase 14 keeps the low-poly readability of the existing asset kit while
// moving away from flat game-prototype colors. The palette intentionally
// matches the dark control-room shell rather than introducing a new theme.
const BUILD_PALETTE = {
  wood: 0x654936,
  woodEmissive: 0x120b07,
  metal: 0x465963,
  chairFrame: 0x293942,
  chairCushion: 0x344f60,
  deviceDark: 0x101d25,
  deviceMid: 0x455f6b,
  screen: 0x3d91ad,
  screenEmissive: 0x14506a,
} as const

export function styleOfficeFurnitureMaterial(
  key: OfficeFurnitureAssetKey,
  material: THREE.Material,
): THREE.Material {
  const styled = material.clone()
  if (!(styled instanceof THREE.MeshStandardMaterial)) return styled

  const materialName = styled.name.toLowerCase()
  styled.roughness = 0.72
  styled.metalness = 0.06
  styled.envMapIntensity = 0.55

  if (key === 'desk') {
    const wood = materialName.includes('wood')
    styled.color.setHex(wood ? BUILD_PALETTE.wood : BUILD_PALETTE.metal)
    styled.roughness = wood ? 0.66 : 0.52
    styled.metalness = wood ? 0.02 : 0.26
    if (wood) {
      styled.emissive.setHex(BUILD_PALETTE.woodEmissive)
      styled.emissiveIntensity = 0.08
    }
  } else if (key === 'chair') {
    const cushion = materialName.includes('carpet')
    styled.color.setHex(
      cushion
        ? BUILD_PALETTE.chairCushion
        : BUILD_PALETTE.chairFrame,
    )
    styled.roughness = cushion ? 0.88 : 0.58
    styled.metalness = cushion ? 0.01 : 0.18
  } else if (key === 'screen') {
    const isDisplaySurface =
      materialName === 'metal' || materialName.includes('medium')
    styled.color.setHex(
      isDisplaySurface ? BUILD_PALETTE.screen : BUILD_PALETTE.deviceDark,
    )
    if (isDisplaySurface) {
      styled.emissive.setHex(BUILD_PALETTE.screenEmissive)
      styled.emissiveIntensity = 0.58
      styled.roughness = 0.24
      styled.metalness = 0.1
    } else {
      styled.roughness = 0.46
      styled.metalness = 0.2
    }
  } else if (key === 'keyboard') {
    styled.color.setHex(
      materialName.includes('medium')
        ? BUILD_PALETTE.deviceMid
        : BUILD_PALETTE.deviceDark,
    )
    styled.roughness = 0.54
    styled.metalness = 0.12
  } else {
    styled.color.setHex(BUILD_PALETTE.deviceDark)
    styled.roughness = 0.5
    styled.metalness = 0.14
  }

  styled.needsUpdate = true
  return styled
}

function cloneStyledMaterial(
  key: OfficeFurnitureAssetKey,
  material: THREE.Material | THREE.Material[],
): THREE.Material | THREE.Material[] {
  return Array.isArray(material)
    ? material.map((candidate) =>
        styleOfficeFurnitureMaterial(key, candidate),
      )
    : styleOfficeFurnitureMaterial(key, material)
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
    throw new Error('Office furniture GLB has no measurable bounds')
  }

  return Math.min(...ratios)
}

async function loadTemplate(
  key: OfficeFurnitureAssetKey,
): Promise<FurnitureAssetTemplate> {
  const existing = templateCache.get(key)
  if (existing) return existing

  const promise = (async () => {
    const definition = ASSETS[key]
    const gltf = await loader.loadAsync(
      `${OFFICE_FURNITURE_ASSET_ROOT}/${definition.filename}`,
    )
    gltf.scene.updateMatrixWorld(true)

    const bounds = new THREE.Box3().setFromObject(gltf.scene)
    if (bounds.isEmpty()) {
      throw new Error(
        `Office furniture asset ${definition.filename} has empty bounds`,
      )
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

    const parts: FurnitureAssetPart[] = []
    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return

      const geometry = object.geometry.clone()
      geometry.applyMatrix4(
        normalize.clone().multiply(object.matrixWorld),
      )
      geometry.computeBoundingBox()
      geometry.computeBoundingSphere()

      parts.push({
        geometry,
        material: cloneStyledMaterial(key, object.material),
      })
    })

    if (parts.length === 0) {
      throw new Error(
        `Office furniture asset ${definition.filename} contains no meshes`,
      )
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
  key: OfficeFurnitureAssetKey,
  template: FurnitureAssetTemplate,
  placements: Array<{ position: THREE.Vector3; yaw: number }>,
): number {
  let instances = 0

  template.parts.forEach((part, partIndex) => {
    const mesh = new THREE.InstancedMesh(
      part.geometry.clone(),
      cloneStyledMaterial(key, part.material),
      placements.length,
    )
    mesh.name = `office-engineering-pod-furniture-${key}-${partIndex}`
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)

    placements.forEach((placement, index) => {
      mesh.setMatrixAt(index, placementMatrix(placement))
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
  key: OfficeFurnitureAssetKey,
): Array<{ position: THREE.Vector3; yaw: number }> {
  return entries.map((entry) => {
    if (key === 'chair') return entry.chair
    if (key === 'screen') return entry.screen
    if (key === 'keyboard') return entry.keyboard
    if (key === 'mouse') return entry.mouse
    return entry.desk
  })
}

export async function mountEngineeringPodFurnitureKit(
  parent: THREE.Group,
): Promise<EngineeringPodFurnitureMount> {
  const group = new THREE.Group()
  group.name = 'office-engineering-pod-furniture-kit'

  const placements = engineeringPodPilotPlacements()
  const keys = Object.keys(ASSETS) as OfficeFurnitureAssetKey[]
  const templates = await Promise.all(
    keys.map((key) => loadTemplate(key)),
  )

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
  group.updateMatrixWorld(true)

  const bounds = new THREE.Box3().setFromObject(group)
  if (bounds.isEmpty()) {
    parent.remove(group)
    disposeFurnitureGroup(group)
    throw new Error('Engineering pod furniture kit has empty mounted bounds')
  }

  const size = bounds.getSize(new THREE.Vector3())
  const min = bounds.min
  const max = bounds.max
  const plausible =
    min.x >= -5 &&
    max.x <= 5 &&
    min.z >= -1.5 &&
    max.z <= 4.4 &&
    min.y >= -0.15 &&
    max.y <= 2.4 &&
    size.x >= 5 &&
    size.z >= 2 &&
    size.y >= 0.4

  if (!plausible) {
    parent.remove(group)
    disposeFurnitureGroup(group)
    throw new Error(
      `Engineering pod furniture mounted outside expected bounds: min=${min.toArray().join(',')} max=${max.toArray().join(',')}`,
    )
  }

  return {
    group,
    sourceAssetCount: OFFICE_FURNITURE_KIT_ASSET_COUNT,
    instanceCount,
    bounds: {
      min: min.toArray() as [number, number, number],
      max: max.toArray() as [number, number, number],
      size: size.toArray() as [number, number, number],
    },
  }
}

function disposeFurnitureGroup(group: THREE.Object3D): void {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    materials.forEach((material) => material.dispose())
  })
}
