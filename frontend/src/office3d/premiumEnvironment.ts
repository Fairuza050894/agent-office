import * as THREE from 'three'

import type { OfficeFloorKey } from './livingOffice'

interface PremiumPalette {
  accent: number
  accentSoft: number
  metal: number
  wall: number
}

const FLOOR_PALETTE: Record<OfficeFloorKey, PremiumPalette> = {
  commons: {
    accent: 0x62d7f5,
    accentSoft: 0x2d758a,
    metal: 0x263742,
    wall: 0x172832,
  },
  build: {
    accent: 0x4fd2ff,
    accentSoft: 0x245f78,
    metal: 0x223540,
    wall: 0x132832,
  },
  strategy: {
    accent: 0xa58cff,
    accentSoft: 0x51477f,
    metal: 0x2c3044,
    wall: 0x1c2033,
  },
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

  // Slim structural frame and indirect strips live above head height, so they do
  // not alter navigation, collision, or canonical station placement.
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

  for (const x of [-2.45, -0.82, 0.82, 2.45]) {
    box(group, [1.18, 0.045, 0.026], [x, 2.08, -6.64], accent.clone())
    box(group, [0.78, 0.025, 0.026], [x, 1.74, -6.64], accent.clone())
    box(group, [0.48, 0.025, 0.026], [x, 1.42, -6.64], accent.clone())
  }

  // Three small identity bars communicate floor context without introducing
  // text sprites or a second source of product state.
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

/**
 * Presentation-only architecture layer for RC1.
 *
 * The group intentionally stays outside the walkable volume. It never creates
 * Office presence, Run state, progress, agent activity, or collision truth.
 */
export function mountPremiumOfficeArchitecture(
  parent: THREE.Group,
  floor: OfficeFloorKey,
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'office-premium-architecture'
  const palette = FLOOR_PALETTE[floor]

  addPerimeterArchitecture(group, palette)
  addRearCommandWall(group, palette, floor)
  addSuspendedCommandBeacon(group, palette)
  addFloorEdgeLighting(group, palette)

  parent.add(group)
  return group
}
