import * as THREE from 'three'

import type { OfficeFloorKey } from './livingOffice'
import { PREMIUM_FLOOR_PALETTE } from './premiumSceneKit'

interface DetailSpec {
  position: [number, number, number]
  scale: [number, number, number]
  rotationY?: number
}

function detailMaterial(
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
    metalness: options.metalness ?? 0.16,
    roughness: options.roughness ?? 0.5,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  })
  result.envMapIntensity = 0.82
  return result
}

function matrixFor(spec: DetailSpec): THREE.Matrix4 {
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
  specs: readonly DetailSpec[],
  meshMaterial: THREE.Material,
  shadows: boolean,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    meshMaterial,
    specs.length,
  )
  mesh.name = name
  mesh.castShadow = shadows
  mesh.receiveShadow = shadows
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  specs.forEach((spec, index) => mesh.setMatrixAt(index, matrixFor(spec)))
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingBox()
  mesh.computeBoundingSphere()
  parent.add(mesh)
  return mesh
}

function commonsShell(): readonly DetailSpec[] {
  return [
    { position: [-3.8, 0.16, 3.55], scale: [6.8, 0.06, 3.55] },
    { position: [-8.72, 1.4, 2.7], scale: [0.3, 2.35, 2.4] },
    { position: [-8.72, 1.4, -0.35], scale: [0.3, 2.35, 2.4] },
    { position: [8.75, 1.2, 1.9], scale: [0.34, 1.95, 2.7] },
    { position: [4.95, 2.74, -4.75], scale: [3.2, 0.16, 0.32] },
    { position: [8.0, 2.74, -4.75], scale: [2.35, 0.16, 0.32] },
  ]
}

function commonsGlow(): readonly DetailSpec[] {
  return [
    { position: [-6.4, 0.195, 5.25], scale: [2.3, 0.025, 0.05] },
    { position: [-3.65, 0.195, 5.25], scale: [2.3, 0.025, 0.05] },
    { position: [-0.9, 0.195, 5.25], scale: [2.3, 0.025, 0.05] },
    { position: [4.95, 2.62, -4.56], scale: [2.7, 0.035, 0.045] },
    { position: [7.95, 2.62, -4.56], scale: [1.85, 0.035, 0.045] },
  ]
}

function buildShell(): readonly DetailSpec[] {
  return [
    { position: [-8.45, 1.22, -3.6], scale: [1.05, 2.25, 0.86] },
    { position: [-8.45, 1.22, -0.85], scale: [1.05, 2.25, 0.86] },
    { position: [8.45, 1.22, -3.6], scale: [1.05, 2.25, 0.86] },
    { position: [8.45, 1.22, -0.85], scale: [1.05, 2.25, 0.86] },
    { position: [-6.95, 2.78, -3.65], scale: [3.0, 0.16, 0.34] },
    { position: [6.95, 2.78, -3.65], scale: [3.0, 0.16, 0.34] },
    { position: [-6.95, 2.78, -0.85], scale: [3.0, 0.16, 0.34] },
    { position: [6.95, 2.78, -0.85], scale: [3.0, 0.16, 0.34] },
    { position: [6.1, 0.17, 4.75], scale: [6.0, 0.055, 2.1] },
  ]
}

function buildGlow(): readonly DetailSpec[] {
  const rackIndicators: DetailSpec[] = [-4.15, -3.55, -1.4, -0.8].flatMap(
    (z): DetailSpec[] => [
      { position: [-8.43, 1.55, z], scale: [0.035, 0.14, 0.38] },
      { position: [8.43, 1.55, z], scale: [0.035, 0.14, 0.38] },
    ],
  )

  return [
    ...rackIndicators,
    { position: [-6.95, 2.62, -3.45], scale: [2.5, 0.035, 0.045] },
    { position: [6.95, 2.62, -3.45], scale: [2.5, 0.035, 0.045] },
    { position: [-6.95, 2.62, -0.65], scale: [2.5, 0.035, 0.045] },
    { position: [6.95, 2.62, -0.65], scale: [2.5, 0.035, 0.045] },
    { position: [4.25, 0.205, 5.72], scale: [2.35, 0.024, 0.045] },
    { position: [7.05, 0.205, 5.72], scale: [2.35, 0.024, 0.045] },
  ]
}

function strategyShell(): readonly DetailSpec[] {
  return [
    { position: [0, 0.16, 0.62], scale: [7.4, 0.055, 3.15] },
    { position: [-8.55, 1.45, -2.9], scale: [0.32, 2.35, 2.35] },
    { position: [8.55, 1.45, -2.9], scale: [0.32, 2.35, 2.35] },
    { position: [-6.9, 2.76, -4.7], scale: [3.05, 0.16, 0.34] },
    { position: [0, 2.76, -4.7], scale: [3.05, 0.16, 0.34] },
    { position: [6.9, 2.76, -4.7], scale: [3.05, 0.16, 0.34] },
  ]
}

function strategyGlow(): readonly DetailSpec[] {
  return [
    { position: [-3.0, 0.205, -1.0], scale: [2.25, 0.024, 0.045] },
    { position: [0, 0.205, -1.0], scale: [2.25, 0.024, 0.045] },
    { position: [3.0, 0.205, -1.0], scale: [2.25, 0.024, 0.045] },
    { position: [-3.0, 0.205, 2.25], scale: [2.25, 0.024, 0.045] },
    { position: [0, 0.205, 2.25], scale: [2.25, 0.024, 0.045] },
    { position: [3.0, 0.205, 2.25], scale: [2.25, 0.024, 0.045] },
    { position: [-6.9, 2.6, -4.5], scale: [2.55, 0.035, 0.045] },
    { position: [0, 2.6, -4.5], scale: [2.55, 0.035, 0.045] },
    { position: [6.9, 2.6, -4.5], scale: [2.55, 0.035, 0.045] },
  ]
}

function floorSpecs(floor: OfficeFloorKey): {
  shell: readonly DetailSpec[]
  glow: readonly DetailSpec[]
} {
  if (floor === 'commons') return { shell: commonsShell(), glow: commonsGlow() }
  if (floor === 'build') return { shell: buildShell(), glow: buildGlow() }
  return { shell: strategyShell(), glow: strategyGlow() }
}

/**
 * Presentation-only localized composition details for RC1.
 *
 * The geometry intentionally hugs floor zones and perimeter bays instead of
 * spanning the entire room. It does not create navigation, occupancy, workflow,
 * KPI, activity, or agent state.
 */
export function mountPremiumCinematicDetails(
  parent: THREE.Group,
  floor: OfficeFloorKey,
): THREE.Group {
  const palette = PREMIUM_FLOOR_PALETTE[floor]
  const group = new THREE.Group()
  const specs = floorSpecs(floor)

  group.name = 'office-premium-cinematic-details'
  group.userData.presentationOnly = true
  group.userData.floor = floor
  group.userData.visualRevision = 'cinematic-composition-v1'
  group.userData.canonicalStateOwner = false

  addInstances(
    group,
    `office-premium-cinematic-${floor}-shell`,
    specs.shell,
    detailMaterial(palette.metal, {
      metalness: 0.34,
      roughness: 0.38,
    }),
    true,
  )
  addInstances(
    group,
    `office-premium-cinematic-${floor}-glow`,
    specs.glow,
    detailMaterial(palette.accentSoft, {
      emissive: palette.accent,
      emissiveIntensity: floor === 'build' ? 0.92 : 0.72,
      metalness: 0.04,
      roughness: 0.24,
    }),
    false,
  )

  parent.add(group)
  return group
}
