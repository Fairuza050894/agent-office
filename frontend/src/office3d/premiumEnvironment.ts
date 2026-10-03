import * as THREE from 'three'

import type { OfficeFloorKey } from './livingOffice'

interface PremiumPalette {
  accent: number
  accentSoft: number
  metal: number
  wall: number
  warm: number
}

export interface PremiumOfficeIdentity {
  floor: OfficeFloorKey
  label: string
  signature: 'social-hub' | 'engineering-control-room' | 'decision-studio'
  architectureGroupName: string
}

const FLOOR_PALETTE: Record<OfficeFloorKey, PremiumPalette> = {
  commons: {
    accent: 0x62d7f5,
    accentSoft: 0x2d758a,
    metal: 0x263742,
    wall: 0x172832,
    warm: 0xd7aa72,
  },
  build: {
    accent: 0x4fd2ff,
    accentSoft: 0x245f78,
    metal: 0x223540,
    wall: 0x132832,
    warm: 0xf2c982,
  },
  strategy: {
    accent: 0xa58cff,
    accentSoft: 0x51477f,
    metal: 0x2c3044,
    wall: 0x1c2033,
    warm: 0xe1ba82,
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

function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  meshMaterial: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), meshMaterial)
  mesh.position.set(...position)
  mesh.castShadow = false
  mesh.receiveShadow = false
  parent.add(mesh)
  return mesh
}

function addPerimeterArchitecture(
  group: THREE.Group,
  palette: PremiumPalette,
): void {
  const frameMaterial = material(palette.metal, {
    metalness: 0.48,
    roughness: 0.34,
  })
  const stripMaterial = material(palette.accentSoft, {
    emissive: palette.accent,
    emissiveIntensity: 1.05,
    metalness: 0.12,
    roughness: 0.26,
  })

  // Structural framing stays above or outside the walkable envelope. It is
  // visual architecture only and never participates in path/collision truth.
  for (const x of [-9.25, 9.25]) {
    box(group, [0.12, 2.84, 0.18], [x, 1.52, -6.35], frameMaterial.clone())
    box(group, [0.12, 2.84, 0.18], [x, 1.52, 6.2], frameMaterial.clone())
    box(group, [0.08, 2.05, 0.06], [x * 0.995, 1.56, -2.15], stripMaterial.clone())
    box(group, [0.08, 2.05, 0.06], [x * 0.995, 1.56, 2.15], stripMaterial.clone())
  }

  for (const x of [-6.2, -2.05, 2.05, 6.2]) {
    box(group, [0.055, 0.055, 12.2], [x, 3.02, -0.1], frameMaterial.clone())
    box(group, [0.035, 0.025, 8.8], [x, 2.96, -0.15], stripMaterial.clone())
  }

  for (const z of [-4.55, 0, 4.55]) {
    box(group, [17.6, 0.05, 0.05], [0, 3.02, z], frameMaterial.clone())
  }
}

function addRearCommandWall(
  group: THREE.Group,
  palette: PremiumPalette,
  floor: OfficeFloorKey,
): void {
  const backing = material(palette.wall, {
    metalness: 0.26,
    roughness: 0.46,
  })
  const glass = material(0x10242f, {
    emissive: palette.accentSoft,
    emissiveIntensity: 0.46,
    metalness: 0.08,
    roughness: 0.22,
    transparent: true,
    opacity: 0.82,
  })
  const accent = material(palette.accentSoft, {
    emissive: palette.accent,
    emissiveIntensity: 1.25,
    metalness: 0.18,
    roughness: 0.2,
  })

  box(group, [7.8, 1.72, 0.12], [0, 1.68, -6.78], backing)
  box(group, [7.22, 1.28, 0.035], [0, 1.68, -6.69], glass)

  // These are deliberately abstract signal bars. They do not encode task
  // progress, KPI values, dialogue, test state, or any other operational fact.
  for (const x of [-2.45, -0.82, 0.82, 2.45]) {
    box(group, [1.18, 0.045, 0.026], [x, 2.08, -6.64], accent.clone())
    box(group, [0.78, 0.025, 0.026], [x, 1.74, -6.64], accent.clone())
    box(group, [0.48, 0.025, 0.026], [x, 1.42, -6.64], accent.clone())
  }

  const floorIndex = floor === 'commons' ? 0 : floor === 'build' ? 1 : 2
  for (let index = 0; index < 3; index += 1) {
    box(
      group,
      [0.58, 0.07, 0.035],
      [-0.72 + index * 0.72, 0.63, -6.64],
      index === floorIndex ? accent.clone() : backing.clone(),
    )
  }
}

function addSuspendedCommandBeacon(
  group: THREE.Group,
  palette: PremiumPalette,
): void {
  const haloMaterial = material(palette.accentSoft, {
    emissive: palette.accent,
    emissiveIntensity: 1.35,
    metalness: 0.24,
    roughness: 0.18,
    transparent: true,
    opacity: 0.86,
  })
  const coreMaterial = material(0x18303b, {
    emissive: palette.accentSoft,
    emissiveIntensity: 0.72,
    metalness: 0.05,
    roughness: 0.2,
    transparent: true,
    opacity: 0.48,
  })

  const beacon = new THREE.Group()
  beacon.name = 'office-premium-command-beacon'
  beacon.position.set(0, 2.43, 0.05)

  const outer = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.025, 10, 48),
    haloMaterial,
  )
  outer.rotation.x = Math.PI / 2
  beacon.add(outer)

  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.018, 10, 40),
    haloMaterial.clone(),
  )
  inner.rotation.x = Math.PI / 2
  inner.rotation.z = Math.PI / 7
  beacon.add(inner)

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 14), coreMaterial)
  beacon.add(core)

  const stemMaterial = material(palette.metal, {
    metalness: 0.5,
    roughness: 0.3,
  })
  box(beacon, [0.035, 0.62, 0.035], [0, 0.62, 0], stemMaterial)

  group.add(beacon)
}

function addFloorEdgeLighting(
  group: THREE.Group,
  palette: PremiumPalette,
): void {
  const edge = material(palette.accentSoft, {
    emissive: palette.accent,
    emissiveIntensity: 0.9,
    metalness: 0.08,
    roughness: 0.3,
  })

  for (const z of [-6.32, 6.32]) {
    box(group, [16.9, 0.025, 0.035], [0, 0.045, z], edge.clone())
  }
  for (const x of [-9.42, 9.42]) {
    box(group, [0.035, 0.025, 11.85], [x, 0.045, 0], edge.clone())
  }
}

function addCommonsIdentity(
  group: THREE.Group,
  palette: PremiumPalette,
): void {
  const identity = new THREE.Group()
  identity.name = FLOOR_IDENTITY.commons.architectureGroupName
  const metal = material(palette.metal, { metalness: 0.38, roughness: 0.36 })
  const warm = material(0x6f573f, {
    emissive: palette.warm,
    emissiveIntensity: 0.38,
    metalness: 0.12,
    roughness: 0.32,
  })

  // Hospitality portal and ceiling ribbons make Commons read as arrival/social
  // space without inserting people, conversations, or schedule claims.
  for (const x of [-7.9, 7.9]) {
    box(identity, [0.14, 2.35, 0.14], [x, 1.22, -5.75], metal.clone())
    box(identity, [1.9, 0.07, 0.14], [x > 0 ? 7.0 : -7.0, 2.38, -5.75], warm.clone())
  }
  for (const z of [-2.7, 2.7]) {
    box(identity, [5.2, 0.045, 0.09], [0, 2.82, z], warm.clone())
  }

  group.add(identity)
}

function addBuildIdentity(
  group: THREE.Group,
  palette: PremiumPalette,
): void {
  const identity = new THREE.Group()
  identity.name = FLOOR_IDENTITY.build.architectureGroupName
  const rack = material(palette.metal, { metalness: 0.56, roughness: 0.28 })
  const signal = material(palette.accentSoft, {
    emissive: palette.accent,
    emissiveIntensity: 1.15,
    metalness: 0.16,
    roughness: 0.2,
  })

  // Engineering bus/telemetry rails are abstract spatial identity only. They
  // intentionally carry no numbers, health state, or implied live telemetry.
  for (const x of [-8.95, 8.95]) {
    for (const y of [0.7, 1.2, 1.7, 2.2]) {
      box(identity, [0.08, 0.04, 3.8], [x, y, 1.45], rack.clone())
      box(identity, [0.045, 0.025, 2.8], [x * 0.994, y, 1.45], signal.clone())
    }
  }
  for (const x of [-4.2, 0, 4.2]) {
    box(identity, [0.08, 0.08, 4.8], [x, 2.76, 1.2], rack.clone())
    box(identity, [0.04, 0.035, 3.2], [x, 2.7, 1.2], signal.clone())
  }

  group.add(identity)
}

function addStrategyIdentity(
  group: THREE.Group,
  palette: PremiumPalette,
): void {
  const identity = new THREE.Group()
  identity.name = FLOOR_IDENTITY.strategy.architectureGroupName
  const frame = material(palette.metal, { metalness: 0.42, roughness: 0.34 })
  const accent = material(palette.accentSoft, {
    emissive: palette.accent,
    emissiveIntensity: 1.05,
    metalness: 0.18,
    roughness: 0.24,
  })
  const warm = material(0x6c513a, {
    emissive: palette.warm,
    emissiveIntensity: 0.32,
    metalness: 0.08,
    roughness: 0.38,
  })

  // A symmetrical briefing frame differentiates Strategy from the engineering
  // floor while remaining outside the canonical planning/decision state model.
  for (const x of [-7.7, 7.7]) {
    box(identity, [0.12, 2.45, 0.12], [x, 1.28, -5.9], frame.clone())
    box(identity, [1.5, 0.06, 0.12], [x > 0 ? 7.0 : -7.0, 2.48, -5.9], accent.clone())
  }
  for (const x of [-3.4, 3.4]) {
    box(identity, [0.055, 2.15, 0.08], [x, 1.46, 6.18], accent.clone())
  }
  box(identity, [6.9, 0.05, 0.08], [0, 2.78, 5.95], warm)

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
 * Presentation-only architecture layer for RC1.
 *
 * The group intentionally stays outside the walkable volume. It never creates
 * Office presence, Run state, progress, agent activity, KPI, dialogue, or
 * collision truth. It also adds no THREE.Light objects; cinematic light budget
 * remains owned by the normal Office lighting/environment policies.
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

  const palette = FLOOR_PALETTE[floor]
  addPerimeterArchitecture(group, palette)
  addRearCommandWall(group, palette, floor)
  addSuspendedCommandBeacon(group, palette)
  addFloorEdgeLighting(group, palette)
  addFloorIdentity(group, palette, floor)

  parent.add(group)
  return group
}
