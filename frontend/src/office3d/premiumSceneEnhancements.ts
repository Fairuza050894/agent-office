import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

import type { OfficeFloorKey } from './livingOffice'
import {
  officePracticalLights,
  type OfficeLightingKey,
} from './lighting'
import { PREMIUM_FLOOR_PALETTE } from './premiumSceneKit'

interface InstanceSpec {
  position: [number, number, number]
  scale: [number, number, number]
  rotationY?: number
}

function material(
  color: number,
  options: {
    metalness?: number
    roughness?: number
    emissive?: number
    emissiveIntensity?: number
  } = {},
): THREE.MeshStandardMaterial {
  const result = new THREE.MeshStandardMaterial({
    color,
    metalness: options.metalness ?? 0.08,
    roughness: options.roughness ?? 0.58,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  })
  result.envMapIntensity = 0.78
  return result
}

function matrixFor(spec: InstanceSpec): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...spec.position),
    new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      spec.rotationY ?? 0,
    ),
    new THREE.Vector3(...spec.scale),
  )
}

function addInstances(
  parent: THREE.Object3D,
  name: string,
  geometry: THREE.BufferGeometry,
  meshMaterial: THREE.Material,
  specs: InstanceSpec[],
  shadows = true,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, meshMaterial, specs.length)
  mesh.name = name
  mesh.castShadow = shadows
  mesh.receiveShadow = shadows
  specs.forEach((spec, index) => mesh.setMatrixAt(index, matrixFor(spec)))
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingBox()
  mesh.computeBoundingSphere()
  parent.add(mesh)
  return mesh
}

function roundedGeometry(radius = 0.14): RoundedBoxGeometry {
  return new RoundedBoxGeometry(1, 1, 1, 2, radius)
}

function addPerimeterSoffits(
  group: THREE.Group,
  floor: OfficeFloorKey,
): void {
  const palette = PREMIUM_FLOOR_PALETTE[floor]
  addInstances(
    group,
    'office-premium-refined-soffits',
    roundedGeometry(0.12),
    material(palette.metal, { metalness: 0.42, roughness: 0.34 }),
    [
      { position: [-7.3, 2.92, -6.45], scale: [4.2, 0.18, 0.34] },
      { position: [-2.5, 2.92, -6.45], scale: [4.0, 0.18, 0.34] },
      { position: [2.5, 2.92, -6.45], scale: [4.0, 0.18, 0.34] },
      { position: [7.3, 2.92, -6.45], scale: [4.2, 0.18, 0.34] },
      { position: [-9.35, 2.72, -3.9], scale: [0.3, 0.16, 3.3] },
      { position: [-9.35, 2.72, 0.0], scale: [0.3, 0.16, 3.3] },
      { position: [-9.35, 2.72, 3.9], scale: [0.3, 0.16, 3.3] },
      { position: [9.35, 2.72, -3.9], scale: [0.3, 0.16, 3.3] },
      { position: [9.35, 2.72, 0.0], scale: [0.3, 0.16, 3.3] },
      { position: [9.35, 2.72, 3.9], scale: [0.3, 0.16, 3.3] },
    ],
  )

  addInstances(
    group,
    'office-premium-refined-warm-cove',
    new THREE.BoxGeometry(1, 1, 1),
    material(palette.warmSoft, {
      emissive: palette.warm,
      emissiveIntensity: 1.15,
      metalness: 0.02,
      roughness: 0.28,
    }),
    [
      { position: [-7.3, 2.76, -6.22], scale: [3.7, 0.045, 0.05] },
      { position: [-2.5, 2.76, -6.22], scale: [3.5, 0.045, 0.05] },
      { position: [2.5, 2.76, -6.22], scale: [3.5, 0.045, 0.05] },
      { position: [7.3, 2.76, -6.22], scale: [3.7, 0.045, 0.05] },
    ],
    false,
  )
}

function addWallSlats(group: THREE.Group, floor: OfficeFloorKey): void {
  const palette = PREMIUM_FLOOR_PALETTE[floor]
  const specs: InstanceSpec[] = []
  for (let index = 0; index < 12; index += 1) {
    specs.push({
      position: [-8.55 + index * 0.18, 1.45, -6.2],
      scale: [0.08, 2.35, 0.16],
    })
  }
  addInstances(
    group,
    'office-premium-refined-wall-slats',
    roundedGeometry(0.14),
    material(palette.wood, { metalness: 0.02, roughness: 0.55 }),
    specs,
  )
}

function addCommonsFurniture(group: THREE.Group): void {
  const palette = PREMIUM_FLOOR_PALETTE.commons
  addInstances(
    group,
    'office-premium-refined-commons-seating',
    roundedGeometry(0.16),
    material(palette.upholstery, { roughness: 0.92, metalness: 0.01 }),
    [
      { position: [-5.4, 0.48, 3.45], scale: [2.45, 0.6, 0.95] },
      { position: [-3.2, 0.48, 4.45], scale: [2.0, 0.6, 0.9], rotationY: Math.PI / 2 },
      { position: [-1.0, 0.48, 3.7], scale: [1.75, 0.6, 0.9] },
      { position: [1.15, 0.48, 4.1], scale: [0.9, 0.78, 0.86], rotationY: -0.35 },
      { position: [2.45, 0.48, 3.55], scale: [0.9, 0.78, 0.86], rotationY: 0.35 },
    ],
  )
  addInstances(
    group,
    'office-premium-refined-commons-cushions',
    roundedGeometry(0.2),
    material(palette.accentSoft, { roughness: 0.96, metalness: 0 }),
    [
      { position: [-6.0, 0.88, 3.43], scale: [0.52, 0.42, 0.18] },
      { position: [-4.8, 0.88, 3.43], scale: [0.52, 0.42, 0.18] },
      { position: [-3.2, 0.88, 3.95], scale: [0.52, 0.42, 0.18], rotationY: Math.PI / 2 },
      { position: [-1.45, 0.88, 3.68], scale: [0.48, 0.4, 0.18] },
    ],
  )
  addInstances(
    group,
    'office-premium-refined-commons-bar-front',
    roundedGeometry(0.12),
    material(palette.wood, { roughness: 0.48, metalness: 0.04 }),
    [
      { position: [5.6, 0.58, -4.7], scale: [5.25, 1.0, 0.92] },
      { position: [7.95, 1.45, -5.55], scale: [0.95, 1.7, 0.58] },
      { position: [3.25, 1.45, -5.55], scale: [0.95, 1.7, 0.58] },
    ],
  )
}

function addBuildFurniture(group: THREE.Group): void {
  const palette = PREMIUM_FLOOR_PALETTE.build
  addInstances(
    group,
    'office-premium-refined-build-consoles',
    roundedGeometry(0.1),
    material(0xd8d3c8, { metalness: 0.12, roughness: 0.52 }),
    [
      { position: [-7.85, 0.7, -4.25], scale: [2.25, 1.2, 0.78] },
      { position: [-7.85, 0.7, -1.5], scale: [2.25, 1.2, 0.78] },
      { position: [7.85, 0.7, -4.25], scale: [2.25, 1.2, 0.78] },
      { position: [7.85, 0.7, -1.5], scale: [2.25, 1.2, 0.78] },
      { position: [6.15, 0.72, 4.65], scale: [5.3, 1.1, 0.82] },
    ],
  )
  addInstances(
    group,
    'office-premium-refined-build-screen-glow',
    roundedGeometry(0.08),
    material(0xdcebf3, {
      emissive: palette.accentSoft,
      emissiveIntensity: 0.35,
      roughness: 0.3,
    }),
    [
      { position: [-7.85, 1.22, -4.7], scale: [1.75, 0.78, 0.045] },
      { position: [-7.85, 1.22, -1.95], scale: [1.75, 0.78, 0.045] },
      { position: [7.85, 1.22, -4.7], scale: [1.75, 0.78, 0.045] },
      { position: [7.85, 1.22, -1.95], scale: [1.75, 0.78, 0.045] },
      { position: [6.15, 1.35, 4.2], scale: [4.45, 0.68, 0.045] },
    ],
    false,
  )
}

function addStrategyFurniture(group: THREE.Group): void {
  const palette = PREMIUM_FLOOR_PALETTE.strategy
  addInstances(
    group,
    'office-premium-refined-strategy-table',
    roundedGeometry(0.16),
    material(palette.wood, { roughness: 0.44, metalness: 0.06 }),
    [
      { position: [0, 0.78, 0.6], scale: [6.5, 0.2, 1.55] },
      { position: [5.9, 0.7, 4.55], scale: [4.8, 0.16, 1.15] },
    ],
  )
  addInstances(
    group,
    'office-premium-refined-strategy-chairs',
    roundedGeometry(0.18),
    material(palette.upholstery, { roughness: 0.84, metalness: 0.02 }),
    [
      ...[-2.4, -1.2, 0, 1.2, 2.4].map((x) => ({
        position: [x, 0.58, -0.78] as [number, number, number],
        scale: [0.64, 0.72, 0.68] as [number, number, number],
      })),
      ...[-2.4, -1.2, 0, 1.2, 2.4].map((x) => ({
        position: [x, 0.58, 1.98] as [number, number, number],
        scale: [0.64, 0.72, 0.68] as [number, number, number],
        rotationY: Math.PI,
      })),
    ],
  )
}

function addPracticalLights(
  group: THREE.Group,
  floor: OfficeFloorKey,
  lightingKey: OfficeLightingKey,
): void {
  officePracticalLights(floor, lightingKey).forEach((profile, index) => {
    const light = new THREE.PointLight(
      profile.color,
      profile.intensity,
      profile.distance,
      profile.decay,
    )
    light.name = `office-premium-practical-light-${index + 1}`
    light.position.set(...profile.position)
    light.castShadow = false
    group.add(light)
  })
}

export function mountPremiumSceneEnhancements(
  parent: THREE.Group,
  floor: OfficeFloorKey,
  lightingKey: OfficeLightingKey,
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'office-premium-scene-enhancements'
  group.userData.presentationOnly = true
  group.userData.floor = floor
  group.userData.visualRevision = 'spatial-overhaul-v2'

  addPerimeterSoffits(group, floor)
  addWallSlats(group, floor)
  if (floor === 'commons') addCommonsFurniture(group)
  else if (floor === 'build') addBuildFurniture(group)
  else addStrategyFurniture(group)
  addPracticalLights(group, floor, lightingKey)

  parent.add(group)
  return group
}
