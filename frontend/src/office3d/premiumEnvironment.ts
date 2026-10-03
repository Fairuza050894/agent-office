import * as THREE from 'three'

import type { OfficeFloorKey } from './livingOffice'

interface PremiumPalette {
  accent: number
  accentSoft: number
  metal: number
  wall: number
  warm: number
}

interface BoxSpec {
  size: [number, number, number]
  position: [number, number, number]
}

export interface PremiumOfficeIdentity {
  floor: OfficeFloorKey
  label: string
  signature: 'social-hub' | 'engineering-control-room' | 'decision-studio'
  architectureGroupName: string
}

const FLOOR_PALETTE: Record<OfficeFloorKey, PremiumPalette> = {
  commons: {
    accent: 0x66c9e8,
    accentSoft: 0x284f60,
    metal: 0x26333b,
    wall: 0x17242c,
    warm: 0xc49a68,
  },
  build: {
    accent: 0x58c6e8,
    accentSoft: 0x244c5e,
    metal: 0x22323b,
    wall: 0x14242c,
    warm: 0xd2ad73,
  },
  strategy: {
    accent: 0x9b8bd8,
    accentSoft: 0x443f68,
    metal: 0x292d3b,
    wall: 0x1b1f2d,
    warm: 0xc6a170,
  },
}

const FLOOR_IDENTITY: Record<OfficeFloorKey, PremiumOfficeIdentity> = {
  commons: {
    floor: 'commons',
    label: 'Commons / Arrival Hub',
    signature: 'social-hub',
    architectureGroupName: 'office-premium-identity-commons',
  },
  build: {
    floor: 'build',
    label: 'Build / Engineering Control Room',
    signature: 'engineering-control-room',
    architectureGroupName: 'office-premium-identity-build',
  },
  strategy: {
    floor: 'strategy',
    label: 'Strategy / Decision Studio',
    signature: 'decision-studio',
    architectureGroupName: 'office-premium-identity-strategy',
  },
}

export function premiumOfficeIdentity(
  floor: OfficeFloorKey,
): PremiumOfficeIdentity {
  return FLOOR_IDENTITY[floor]
}

function material(
  color: number,
  options: {
    emissive?: number
    emissiveIntensity?: number
    metalness?: number
    roughness?: number
    transparent?: boolean
    opacity?: number
  } = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    metalness: options.metalness ?? 0.18,
    roughness: options.roughness ?? 0.58,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
  })
}

function batchedBoxes(
  parent: THREE.Object3D,
  name: string,
  specs: BoxSpec[],
  meshMaterial: THREE.Material,
): THREE.InstancedMesh | null {
  if (specs.length === 0) return null

  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const mesh = new THREE.InstancedMesh(geometry, meshMaterial, specs.length)
  mesh.name = name
  mesh.castShadow = false
  mesh.receiveShadow = false

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()

  specs.forEach((spec, index) => {
    position.set(...spec.position)
    scale.set(...spec.size)
    matrix.compose(position, quaternion, scale)
    mesh.setMatrixAt(index, matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
  parent.add(mesh)
  return mesh
}

/**
 * Subtle architectural anchors only. RC1 previously used room-spanning overhead
 * beams here, which read as a debug cage from the production isometric camera.
 * These posts/caps intentionally stay on the perimeter and never cross the
 * occupied room volume.
 */
function addPerimeterArchitecture(
  group: THREE.Group,
  palette: PremiumPalette,
): void {
  batchedBoxes(
    group,
    'office-premium-perimeter-posts',
    [
      { size: [0.12, 2.45, 0.12], position: [-9.28, 1.25, -6.18] },
      { size: [0.12, 2.45, 0.12], position: [9.28, 1.25, -6.18] },
      { size: [0.12, 2.2, 0.12], position: [-9.28, 1.12, 6.02] },
      { size: [0.12, 2.2, 0.12], position: [9.28, 1.12, 6.02] },
      { size: [0.1, 2.1, 0.1], position: [-9.28, 1.08, 0] },
      { size: [0.1, 2.1, 0.1], position: [9.28, 1.08, 0] },
    ],
    material(palette.metal, { metalness: 0.42, roughness: 0.42 }),
  )

  batchedBoxes(
    group,
    'office-premium-perimeter-caps',
    [
      { size: [3.8, 0.08, 0.12], position: [-6.65, 2.52, -6.18] },
      { size: [3.8, 0.08, 0.12], position: [6.65, 2.52, -6.18] },
      { size: [0.12, 0.08, 3.2], position: [-9.28, 2.22, 4.25] },
      { size: [0.12, 0.08, 3.2], position: [9.28, 2.22, 4.25] },
    ],
    material(palette.metal, { metalness: 0.38, roughness: 0.46 }),
  )
}

function addRearCommandWall(
  group: THREE.Group,
  palette: PremiumPalette,
  floor: OfficeFloorKey,
): void {
  batchedBoxes(
    group,
    'office-premium-command-wall-shell',
    [
      { size: [7.65, 1.62, 0.11], position: [0, 1.66, -6.78] },
      { size: [8.2, 0.08, 0.16], position: [0, 2.55, -6.79] },
      { size: [8.2, 0.08, 0.16], position: [0, 0.77, -6.79] },
    ],
    material(palette.wall, { metalness: 0.22, roughness: 0.54 }),
  )

  batchedBoxes(
    group,
    'office-premium-command-wall-glass',
    [
      { size: [7.05, 1.2, 0.03], position: [0, 1.67, -6.69] },
      { size: [1.0, 0.94, 0.025], position: [-4.55, 1.63, -6.64] },
      { size: [1.0, 0.94, 0.025], position: [4.55, 1.63, -6.64] },
    ],
    material(0x112631, {
      emissive: palette.accentSoft,
      emissiveIntensity: 0.18,
      metalness: 0.06,
      roughness: 0.3,
      transparent: true,
      opacity: 0.76,
    }),
  )

  const floorIndex = floor === 'commons' ? 0 : floor === 'build' ? 1 : 2
  const signals: BoxSpec[] = [
    { size: [1.0, 0.035, 0.02], position: [-2.3, 2.02, -6.64] },
    { size: [0.72, 0.025, 0.02], position: [-2.3, 1.7, -6.64] },
    { size: [1.0, 0.035, 0.02], position: [-0.76, 2.02, -6.64] },
    { size: [0.72, 0.025, 0.02], position: [-0.76, 1.7, -6.64] },
    { size: [1.0, 0.035, 0.02], position: [0.76, 2.02, -6.64] },
    { size: [0.72, 0.025, 0.02], position: [0.76, 1.7, -6.64] },
    { size: [1.0, 0.035, 0.02], position: [2.3, 2.02, -6.64] },
    { size: [0.72, 0.025, 0.02], position: [2.3, 1.7, -6.64] },
    {
      size: [0.48, 0.055, 0.025],
      position: [-0.6 + floorIndex * 0.6, 0.92, -6.64],
    },
  ]

  batchedBoxes(
    group,
    'office-premium-command-wall-signals',
    signals,
    material(palette.accentSoft, {
      emissive: palette.accent,
      emissiveIntensity: 0.48,
      metalness: 0.1,
      roughness: 0.34,
    }),
  )
}

/**
 * Short orientation accents replace the previous full-room neon perimeter.
 * They remain deliberately dim and wall-adjacent.
 */
function addFloorEdgeLighting(
  group: THREE.Group,
  palette: PremiumPalette,
): void {
  batchedBoxes(
    group,
    'office-premium-floor-edge-signals',
    [
      { size: [3.0, 0.018, 0.025], position: [-7.4, 0.04, -6.25] },
      { size: [3.0, 0.018, 0.025], position: [7.4, 0.04, -6.25] },
      { size: [3.0, 0.018, 0.025], position: [-7.4, 0.04, 6.12] },
      { size: [3.0, 0.018, 0.025], position: [7.4, 0.04, 6.12] },
      { size: [0.025, 0.018, 2.6], position: [-9.35, 0.04, -4.75] },
      { size: [0.025, 0.018, 2.6], position: [9.35, 0.04, -4.75] },
    ],
    material(palette.accentSoft, {
      emissive: palette.accent,
      emissiveIntensity: 0.32,
      metalness: 0.05,
      roughness: 0.42,
    }),
  )
}

function addCommonsIdentity(
  group: THREE.Group,
  palette: PremiumPalette,
): void {
  const identity = new THREE.Group()
  identity.name = FLOOR_IDENTITY.commons.architectureGroupName

  batchedBoxes(
    identity,
    'office-premium-commons-frame',
    [
      { size: [0.12, 2.05, 0.12], position: [-8.6, 1.06, 5.85] },
      { size: [0.12, 2.05, 0.12], position: [8.6, 1.06, 5.85] },
      { size: [2.7, 0.08, 0.12], position: [-7.25, 2.05, 5.85] },
      { size: [2.7, 0.08, 0.12], position: [7.25, 2.05, 5.85] },
    ],
    material(palette.metal, { metalness: 0.26, roughness: 0.52 }),
  )

  batchedBoxes(
    identity,
    'office-premium-commons-panels',
    [
      { size: [2.45, 1.1, 0.06], position: [-7.2, 1.28, 5.9] },
      { size: [2.45, 1.1, 0.06], position: [7.2, 1.28, 5.9] },
      { size: [0.06, 1.35, 1.8], position: [-9.18, 1.18, 3.75] },
      { size: [0.06, 1.35, 1.8], position: [9.18, 1.18, 3.75] },
    ],
    material(0x20343d, { metalness: 0.12, roughness: 0.68 }),
  )

  batchedBoxes(
    identity,
    'office-premium-commons-zones',
    [
      { size: [1.8, 0.035, 0.08], position: [-7.2, 1.72, 5.84] },
      { size: [1.8, 0.035, 0.08], position: [7.2, 1.72, 5.84] },
      { size: [0.08, 0.035, 1.1], position: [-9.13, 1.62, 3.75] },
      { size: [0.08, 0.035, 1.1], position: [9.13, 1.62, 3.75] },
    ],
    material(0x69543e, {
      emissive: palette.warm,
      emissiveIntensity: 0.16,
      metalness: 0.08,
      roughness: 0.5,
    }),
  )

  group.add(identity)
}

function addBuildIdentity(
  group: THREE.Group,
  palette: PremiumPalette,
): void {
  const identity = new THREE.Group()
  identity.name = FLOOR_IDENTITY.build.architectureGroupName

  batchedBoxes(
    identity,
    'office-premium-build-control-frame',
    [
      { size: [0.1, 2.15, 0.1], position: [-9.02, 1.1, -2.6] },
      { size: [0.1, 2.15, 0.1], position: [-9.02, 1.1, 2.6] },
      { size: [0.1, 2.15, 0.1], position: [9.02, 1.1, -2.6] },
      { size: [0.1, 2.15, 0.1], position: [9.02, 1.1, 2.6] },
    ],
    material(palette.metal, { metalness: 0.42, roughness: 0.4 }),
  )

  batchedBoxes(
    identity,
    'office-premium-build-ops-bays',
    [
      { size: [0.07, 1.45, 2.15], position: [-9.12, 1.18, -1.35] },
      { size: [0.07, 1.45, 2.15], position: [-9.12, 1.18, 1.35] },
      { size: [0.07, 1.45, 2.15], position: [9.12, 1.18, -1.35] },
      { size: [0.07, 1.45, 2.15], position: [9.12, 1.18, 1.35] },
    ],
    material(0x172b34, {
      emissive: palette.accentSoft,
      emissiveIntensity: 0.08,
      metalness: 0.28,
      roughness: 0.5,
    }),
  )

  const signals: BoxSpec[] = []
  for (const x of [-9.08, 9.08]) {
    for (const z of [-1.7, -1.15, 1.15, 1.7]) {
      signals.push({ size: [0.035, 0.045, 0.62], position: [x, 1.55, z] })
    }
  }
  batchedBoxes(
    identity,
    'office-premium-build-control-signals',
    signals,
    material(palette.accentSoft, {
      emissive: palette.accent,
      emissiveIntensity: 0.42,
      metalness: 0.1,
      roughness: 0.34,
    }),
  )

  group.add(identity)
}

function addStrategyIdentity(
  group: THREE.Group,
  palette: PremiumPalette,
): void {
  const identity = new THREE.Group()
  identity.name = FLOOR_IDENTITY.strategy.architectureGroupName

  batchedBoxes(
    identity,
    'office-premium-strategy-frame',
    [
      { size: [0.12, 2.15, 0.12], position: [-8.45, 1.1, 5.82] },
      { size: [0.12, 2.15, 0.12], position: [8.45, 1.1, 5.82] },
      { size: [2.9, 0.08, 0.12], position: [-6.95, 2.1, 5.82] },
      { size: [2.9, 0.08, 0.12], position: [6.95, 2.1, 5.82] },
    ],
    material(palette.metal, { metalness: 0.34, roughness: 0.46 }),
  )

  batchedBoxes(
    identity,
    'office-premium-strategy-forum',
    [
      { size: [2.55, 1.25, 0.06], position: [-6.9, 1.3, 5.88] },
      { size: [2.55, 1.25, 0.06], position: [6.9, 1.3, 5.88] },
      { size: [0.06, 1.4, 1.85], position: [-9.12, 1.2, 3.55] },
      { size: [0.06, 1.4, 1.85], position: [9.12, 1.2, 3.55] },
    ],
    material(0x26293b, {
      emissive: 0x332f4e,
      emissiveIntensity: 0.08,
      metalness: 0.2,
      roughness: 0.56,
    }),
  )

  batchedBoxes(
    identity,
    'office-premium-strategy-signals',
    [
      { size: [1.75, 0.04, 0.075], position: [-6.9, 1.75, 5.82] },
      { size: [1.75, 0.04, 0.075], position: [6.9, 1.75, 5.82] },
      { size: [0.075, 0.04, 1.0], position: [-9.08, 1.62, 3.55] },
      { size: [0.075, 0.04, 1.0], position: [9.08, 1.62, 3.55] },
    ],
    material(palette.accentSoft, {
      emissive: palette.accent,
      emissiveIntensity: 0.36,
      metalness: 0.08,
      roughness: 0.38,
    }),
  )

  group.add(identity)
}

function addFloorIdentity(
  group: THREE.Group,
  palette: PremiumPalette,
  floor: OfficeFloorKey,
): void {
  if (floor === 'commons') addCommonsIdentity(group, palette)
  else if (floor === 'strategy') addStrategyIdentity(group, palette)
  else addBuildIdentity(group, palette)
}

/**
 * Presentation-only RC1 architecture layer.
 *
 * The composition-reset revision deliberately avoids any room-spanning overhead
 * frame. Repeated wall-adjacent geometry remains batched with InstancedMesh and
 * stays outside canonical Task/Run/AgentRun/Event/Evidence/ResultReview truth.
 * It adds no THREE.Light objects, collision truth, occupancy truth, KPI,
 * telemetry, dialogue, or fabricated agent activity.
 */
export function mountPremiumOfficeArchitecture(
  parent: THREE.Group,
  floor: OfficeFloorKey,
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'office-premium-architecture'
  group.userData.presentationOnly = true
  group.userData.floor = floor
  group.userData.identity = FLOOR_IDENTITY[floor].signature
  group.userData.visualRevision = 'composition-reset-v1'
  group.userData.roomSpanningOverheadFrame = false

  const palette = FLOOR_PALETTE[floor]
  addPerimeterArchitecture(group, palette)
  addRearCommandWall(group, palette, floor)
  addFloorEdgeLighting(group, palette)
  addFloorIdentity(group, palette, floor)

  parent.add(group)
  return group
}
