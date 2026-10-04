import * as THREE from 'three'

import type { OfficeFloorKey } from './livingOffice'

export interface PremiumPalette {
  accent: number
  accentSoft: number
  metal: number
  wall: number
  warm: number
  warmSoft: number
  wood: number
  floor: number
  floorAlt: number
  upholstery: number
  greenery: number
}

interface BoxSpec {
  size: [number, number, number]
  position: [number, number, number]
  rotationY?: number
}

interface CylinderSpec {
  radius: number
  height: number
  position: [number, number, number]
  rotationY?: number
}

interface SphereSpec {
  radius: number
  position: [number, number, number]
  scale?: [number, number, number]
}

export const PREMIUM_FLOOR_PALETTE: Record<OfficeFloorKey, PremiumPalette> = {
  commons: {
    accent: 0x5bc7e8,
    accentSoft: 0x1e5266,
    metal: 0x202a31,
    wall: 0x121b22,
    warm: 0xe1b46f,
    warmSoft: 0x6f4f2c,
    wood: 0x5b4435,
    floor: 0x263139,
    floorAlt: 0x303b42,
    upholstery: 0x334b5d,
    greenery: 0x35654c,
  },
  build: {
    accent: 0x55c7ee,
    accentSoft: 0x174a5d,
    metal: 0x1d2830,
    wall: 0x0f1920,
    warm: 0xd7a96b,
    warmSoft: 0x654726,
    wood: 0x514038,
    floor: 0x222e36,
    floorAlt: 0x2b3840,
    upholstery: 0x304959,
    greenery: 0x315f49,
  },
  strategy: {
    accent: 0x7ba7df,
    accentSoft: 0x293d60,
    metal: 0x202833,
    wall: 0x111820,
    warm: 0xd8ad72,
    warmSoft: 0x62482d,
    wood: 0x514139,
    floor: 0x252e36,
    floorAlt: 0x303942,
    upholstery: 0x3d4658,
    greenery: 0x315947,
  },
}

function standardMaterial(
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
  const meshMaterial = new THREE.MeshStandardMaterial({
    color,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    metalness: options.metalness ?? 0.18,
    roughness: options.roughness ?? 0.56,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
  })
  meshMaterial.envMapIntensity = 0.72
  return meshMaterial
}

function glassMaterial(color: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.02,
    roughness: 0.12,
    transmission: 0.18,
    thickness: 0.16,
    transparent: true,
    opacity: 0.28,
    clearcoat: 0.62,
    clearcoatRoughness: 0.18,
    envMapIntensity: 0.75,
  })
}

function transformMatrix(
  positionTuple: [number, number, number],
  scaleTuple: [number, number, number],
  rotationY = 0,
): THREE.Matrix4 {
  const position = new THREE.Vector3(...positionTuple)
  const scale = new THREE.Vector3(...scaleTuple)
  const quaternion = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    rotationY,
  )
  return new THREE.Matrix4().compose(position, quaternion, scale)
}

function addBoxes(
  parent: THREE.Object3D,
  name: string,
  specs: BoxSpec[],
  meshMaterial: THREE.Material,
  shadow = true,
): THREE.InstancedMesh | null {
  if (specs.length === 0) return null

  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    meshMaterial,
    specs.length,
  )
  mesh.name = name
  mesh.castShadow = shadow
  mesh.receiveShadow = shadow
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)

  specs.forEach((spec, index) => {
    mesh.setMatrixAt(
      index,
      transformMatrix(spec.position, spec.size, spec.rotationY ?? 0),
    )
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingBox()
  mesh.computeBoundingSphere()
  parent.add(mesh)
  return mesh
}

function addCylinders(
  parent: THREE.Object3D,
  name: string,
  specs: CylinderSpec[],
  meshMaterial: THREE.Material,
  shadow = true,
): THREE.InstancedMesh | null {
  if (specs.length === 0) return null

  const mesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1, 16),
    meshMaterial,
    specs.length,
  )
  mesh.name = name
  mesh.castShadow = shadow
  mesh.receiveShadow = shadow
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)

  specs.forEach((spec, index) => {
    mesh.setMatrixAt(
      index,
      transformMatrix(
        spec.position,
        [spec.radius, spec.height, spec.radius],
        spec.rotationY ?? 0,
      ),
    )
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingBox()
  mesh.computeBoundingSphere()
  parent.add(mesh)
  return mesh
}

function addSpheres(
  parent: THREE.Object3D,
  name: string,
  specs: SphereSpec[],
  meshMaterial: THREE.Material,
): THREE.InstancedMesh | null {
  if (specs.length === 0) return null

  const mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 16, 12),
    meshMaterial,
    specs.length,
  )
  mesh.name = name
  mesh.castShadow = true
  mesh.receiveShadow = false
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)

  specs.forEach((spec, index) => {
    const scale = spec.scale ?? [spec.radius, spec.radius, spec.radius]
    mesh.setMatrixAt(index, transformMatrix(spec.position, scale))
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingBox()
  mesh.computeBoundingSphere()
  parent.add(mesh)
  return mesh
}

function floorTiles(): BoxSpec[] {
  const specs: BoxSpec[] = []
  for (const x of [-7.5, -2.5, 2.5, 7.5]) {
    for (const z of [-5.25, -1.75, 1.75, 5.25]) {
      specs.push({ size: [4.88, 0.07, 3.34], position: [x, 0.08, z] })
    }
  }
  return specs
}

function addFloorShell(
  group: THREE.Group,
  palette: PremiumPalette,
  floor: OfficeFloorKey,
): void {
  addBoxes(
    group,
    'office-premium-floor-tiles',
    floorTiles(),
    standardMaterial(palette.floor, {
      metalness: 0.12,
      roughness: 0.34,
    }),
  )

  const insets: BoxSpec[] =
    floor === 'commons'
      ? [
          { size: [6.8, 0.035, 4.35], position: [-2.3, 0.13, 2.35] },
          { size: [5.2, 0.035, 3.4], position: [5.8, 0.13, 2.85] },
        ]
      : floor === 'build'
        ? [
            { size: [8.4, 0.035, 5.6], position: [0, 0.13, 1.45] },
            { size: [4.6, 0.035, 2.5], position: [-6.4, 0.13, -3.65] },
          ]
        : [
            { size: [8.2, 0.035, 5.0], position: [0, 0.13, 0.65] },
            { size: [4.6, 0.035, 2.7], position: [6.2, 0.13, 3.9] },
          ]

  addBoxes(
    group,
    'office-premium-floor-insets',
    insets,
    standardMaterial(palette.floorAlt, {
      metalness: 0.08,
      roughness: 0.72,
    }),
  )
}

function addArchitecturalShell(
  group: THREE.Group,
  palette: PremiumPalette,
): void {
  addBoxes(
    group,
    'office-premium-structural-metal',
    [
      { size: [0.2, 3.0, 0.2], position: [-9.4, 1.55, -6.45] },
      { size: [0.2, 3.0, 0.2], position: [9.4, 1.55, -6.45] },
      { size: [0.2, 2.75, 0.2], position: [-9.4, 1.42, 6.15] },
      { size: [0.2, 2.75, 0.2], position: [9.4, 1.42, 6.15] },
      { size: [4.1, 0.14, 0.2], position: [-7.15, 2.95, -6.45] },
      { size: [4.1, 0.14, 0.2], position: [7.15, 2.95, -6.45] },
      { size: [0.2, 0.14, 3.2], position: [-9.4, 2.7, 4.55] },
      { size: [0.2, 0.14, 3.2], position: [9.4, 2.7, 4.55] },
    ],
    standardMaterial(palette.metal, {
      metalness: 0.5,
      roughness: 0.34,
    }),
  )

  addBoxes(
    group,
    'office-premium-wall-panels',
    [
      { size: [4.2, 2.25, 0.12], position: [-7.15, 1.33, -6.65] },
      { size: [4.2, 2.25, 0.12], position: [7.15, 1.33, -6.65] },
      { size: [0.12, 2.05, 3.2], position: [-9.52, 1.2, 4.55] },
      { size: [0.12, 2.05, 3.2], position: [9.52, 1.2, 4.55] },
    ],
    standardMaterial(palette.wall, {
      metalness: 0.22,
      roughness: 0.5,
    }),
  )

  addBoxes(
    group,
    'office-premium-architectural-warm-trim',
    [
      { size: [3.6, 0.055, 0.07], position: [-7.15, 2.55, -6.55] },
      { size: [3.6, 0.055, 0.07], position: [7.15, 2.55, -6.55] },
      { size: [0.07, 0.055, 2.45], position: [-9.42, 2.28, 4.55] },
      { size: [0.07, 0.055, 2.45], position: [9.42, 2.28, 4.55] },
    ],
    standardMaterial(palette.warmSoft, {
      emissive: palette.warm,
      emissiveIntensity: 0.7,
      metalness: 0.04,
      roughness: 0.34,
    }),
    false,
  )
}

function addCommandWall(
  group: THREE.Group,
  palette: PremiumPalette,
): void {
  addBoxes(
    group,
    'office-premium-command-wall-shell',
    [
      { size: [7.8, 1.72, 0.14], position: [0, 1.72, -6.62] },
      { size: [0.14, 1.72, 1.22], position: [-4.15, 1.72, -6.58] },
      { size: [0.14, 1.72, 1.22], position: [4.15, 1.72, -6.58] },
    ],
    standardMaterial(palette.wall, {
      metalness: 0.24,
      roughness: 0.42,
    }),
  )

  addBoxes(
    group,
    'office-premium-command-wall-display',
    [
      { size: [5.3, 1.2, 0.055], position: [-0.75, 1.78, -6.49] },
      { size: [1.65, 1.2, 0.055], position: [3.05, 1.78, -6.49] },
    ],
    standardMaterial(0x0c1d2a, {
      emissive: palette.accentSoft,
      emissiveIntensity: 0.34,
      metalness: 0.08,
      roughness: 0.24,
    }),
  )

  const displayLines: BoxSpec[] = []
  for (const x of [-2.35, -1.25, -0.15, 0.95]) {
    displayLines.push(
      { size: [0.78, 0.035, 0.025], position: [x, 2.05, -6.45] },
      { size: [0.58, 0.028, 0.025], position: [x, 1.72, -6.45] },
      { size: [0.42, 0.024, 0.025], position: [x, 1.4, -6.45] },
    )
  }
  displayLines.push(
    { size: [1.05, 0.035, 0.025], position: [3.05, 2.05, -6.45] },
    { size: [0.72, 0.028, 0.025], position: [3.05, 1.7, -6.45] },
    { size: [0.9, 0.024, 0.025], position: [3.05, 1.38, -6.45] },
  )

  addBoxes(
    group,
    'office-premium-command-wall-graphics',
    displayLines,
    standardMaterial(palette.accentSoft, {
      emissive: palette.accent,
      emissiveIntensity: 0.82,
      metalness: 0.04,
      roughness: 0.24,
    }),
    false,
  )
}

function addPlanters(
  group: THREE.Group,
  palette: PremiumPalette,
  positions: Array<[number, number]>,
  namePrefix: string,
): void {
  const planterBoxes = positions.map(([x, z]) => ({
    size: [0.6, 0.46, 0.6] as [number, number, number],
    position: [x, 0.26, z] as [number, number, number],
  }))
  addBoxes(
    group,
    `${namePrefix}-planters`,
    planterBoxes,
    standardMaterial(0x30373b, {
      metalness: 0.18,
      roughness: 0.6,
    }),
  )

  const foliage: SphereSpec[] = []
  positions.forEach(([x, z], index) => {
    const spread = index % 2 === 0 ? 0.15 : -0.15
    foliage.push(
      { radius: 0.4, position: [x, 0.82, z], scale: [0.42, 0.57, 0.42] },
      { radius: 0.28, position: [x + spread, 0.9, z + 0.08], scale: [0.28, 0.4, 0.28] },
      { radius: 0.25, position: [x - spread, 0.77, z - 0.12], scale: [0.25, 0.37, 0.25] },
    )
  })
  addSpheres(
    group,
    `${namePrefix}-greenery`,
    foliage,
    standardMaterial(palette.greenery, {
      metalness: 0.01,
      roughness: 0.88,
    }),
  )
}

function addGlassRoom(
  group: THREE.Group,
  palette: PremiumPalette,
  center: [number, number],
  width: number,
  depth: number,
  name: string,
): void {
  const [x, z] = center
  addBoxes(
    group,
    `${name}-glass`,
    [
      { size: [width, 2.45, 0.07], position: [x, 1.28, z - depth / 2] },
      { size: [0.07, 2.45, depth], position: [x - width / 2, 1.28, z] },
      { size: [0.07, 2.45, depth], position: [x + width / 2, 1.28, z] },
      { size: [width * 0.32, 2.45, 0.07], position: [x - width * 0.34, 1.28, z + depth / 2] },
      { size: [width * 0.32, 2.45, 0.07], position: [x + width * 0.34, 1.28, z + depth / 2] },
    ],
    glassMaterial(0x8db8c9),
    false,
  )

  addBoxes(
    group,
    `${name}-frame`,
    [
      { size: [width, 0.1, 0.1], position: [x, 2.53, z - depth / 2] },
      { size: [width, 0.1, 0.1], position: [x, 2.53, z + depth / 2] },
      { size: [0.1, 0.1, depth], position: [x - width / 2, 2.53, z] },
      { size: [0.1, 0.1, depth], position: [x + width / 2, 2.53, z] },
    ],
    standardMaterial(palette.metal, {
      metalness: 0.48,
      roughness: 0.3,
    }),
  )
}

function addCommons(
  identity: THREE.Group,
  palette: PremiumPalette,
): void {
  addBoxes(
    identity,
    'office-premium-commons-zones',
    [
      { size: [5.7, 0.58, 0.72], position: [5.55, 0.42, -4.75] },
      { size: [5.3, 0.1, 0.9], position: [5.55, 0.76, -4.75] },
      { size: [2.75, 0.42, 0.84], position: [-4.55, 0.34, 3.2] },
      { size: [2.75, 0.78, 0.18], position: [-4.55, 0.69, 3.56] },
      { size: [2.35, 0.42, 0.84], position: [-1.0, 0.34, 4.2] },
      { size: [2.35, 0.78, 0.18], position: [-1.0, 0.69, 4.56] },
      { size: [4.7, 0.13, 1.15], position: [4.15, 0.78, 3.35] },
    ],
    standardMaterial(palette.wood, {
      metalness: 0.04,
      roughness: 0.5,
    }),
  )

  addBoxes(
    identity,
    'office-premium-commons-upholstery',
    [
      { size: [2.65, 0.42, 0.78], position: [-4.55, 0.55, 3.18] },
      { size: [2.25, 0.42, 0.78], position: [-1.0, 0.55, 4.18] },
      { size: [0.85, 0.62, 0.75], position: [-2.55, 0.42, 2.35], rotationY: 0.3 },
      { size: [0.85, 0.62, 0.75], position: [-0.95, 0.42, 2.2], rotationY: -0.35 },
    ],
    standardMaterial(palette.upholstery, {
      metalness: 0.01,
      roughness: 0.9,
    }),
  )

  addGlassRoom(identity, palette, [-5.6, -3.45], 4.5, 3.4, 'office-premium-commons-collab-pod')

  addCylinders(
    identity,
    'office-premium-commons-round-furniture',
    [
      { radius: 0.55, height: 0.12, position: [-3.1, 0.58, 1.95] },
      { radius: 0.55, height: 0.12, position: [-0.6, 0.58, 1.65] },
      { radius: 0.38, height: 0.46, position: [3.0, 0.32, 4.45] },
      { radius: 0.38, height: 0.46, position: [4.15, 0.32, 4.45] },
      { radius: 0.38, height: 0.46, position: [5.3, 0.32, 4.45] },
    ],
    standardMaterial(0x4b4037, {
      metalness: 0.05,
      roughness: 0.62,
    }),
  )

  addBoxes(
    identity,
    'office-premium-commons-practical-glow',
    [
      { size: [4.8, 0.045, 0.05], position: [5.55, 0.98, -4.36] },
      { size: [2.15, 0.04, 0.05], position: [-4.55, 0.18, 2.78] },
      { size: [2.0, 0.04, 0.05], position: [-1.0, 0.18, 3.78] },
      { size: [3.8, 0.04, 0.05], position: [4.15, 0.18, 2.78] },
    ],
    standardMaterial(palette.warmSoft, {
      emissive: palette.warm,
      emissiveIntensity: 1.0,
      metalness: 0.02,
      roughness: 0.32,
    }),
    false,
  )

  addPlanters(
    identity,
    palette,
    [
      [-8.35, 4.95],
      [-7.3, 4.95],
      [6.8, -5.7],
      [7.95, -5.7],
      [6.55, 1.1],
      [7.7, 1.1],
    ],
    'office-premium-commons',
  )
}

function addBuild(
  identity: THREE.Group,
  palette: PremiumPalette,
): void {
  addBoxes(
    identity,
    'office-premium-build-ops-bays',
    [
      { size: [2.35, 2.1, 0.78], position: [-8.0, 1.08, -3.85] },
      { size: [2.35, 2.1, 0.78], position: [-8.0, 1.08, -1.4] },
      { size: [2.35, 2.1, 0.78], position: [8.0, 1.08, -3.85] },
      { size: [2.35, 2.1, 0.78], position: [8.0, 1.08, -1.4] },
      { size: [5.2, 0.75, 0.9], position: [5.4, 0.48, 4.9] },
      { size: [5.2, 0.1, 1.02], position: [5.4, 0.9, 4.9] },
    ],
    standardMaterial(palette.metal, {
      metalness: 0.42,
      roughness: 0.36,
    }),
  )

  const rackPanels: BoxSpec[] = []
  for (const x of [-8.55, -7.45, 7.45, 8.55]) {
    for (const z of [-4.25, -3.45, -1.8, -1.0]) {
      rackPanels.push({ size: [0.58, 0.12, 0.06], position: [x, 1.1, z] })
    }
  }
  addBoxes(
    identity,
    'office-premium-build-device-panels',
    rackPanels,
    standardMaterial(0x123143, {
      emissive: palette.accentSoft,
      emissiveIntensity: 0.58,
      metalness: 0.08,
      roughness: 0.24,
    }),
    false,
  )

  addGlassRoom(identity, palette, [-5.8, 3.85], 5.2, 3.1, 'office-premium-build-project-room')

  addBoxes(
    identity,
    'office-premium-build-project-room-furniture',
    [
      { size: [3.6, 0.13, 1.15], position: [-5.8, 0.78, 3.85] },
      { size: [2.0, 1.2, 0.08], position: [-5.8, 1.6, 2.37] },
      { size: [1.65, 0.88, 0.035], position: [-5.8, 1.6, 2.42] },
      { size: [1.8, 0.08, 0.72], position: [5.4, 1.25, 4.9] },
    ],
    standardMaterial(palette.wood, {
      metalness: 0.05,
      roughness: 0.52,
    }),
  )

  addBoxes(
    identity,
    'office-premium-build-screen-surfaces',
    [
      { size: [1.55, 0.78, 0.035], position: [-5.8, 1.6, 2.46] },
      { size: [1.5, 0.62, 0.035], position: [5.4, 1.42, 4.48] },
      { size: [1.2, 0.62, 0.035], position: [3.45, 1.42, 4.48] },
      { size: [1.2, 0.62, 0.035], position: [7.35, 1.42, 4.48] },
    ],
    standardMaterial(0x0b2230, {
      emissive: palette.accent,
      emissiveIntensity: 0.42,
      metalness: 0.06,
      roughness: 0.22,
    }),
    false,
  )

  addBoxes(
    identity,
    'office-premium-build-practical-glow',
    [
      { size: [4.35, 0.045, 0.055], position: [5.4, 1.02, 4.36] },
      { size: [3.8, 0.04, 0.05], position: [-5.8, 0.16, 2.28] },
      { size: [2.0, 0.04, 0.05], position: [-8.0, 2.18, -3.85] },
      { size: [2.0, 0.04, 0.05], position: [8.0, 2.18, -3.85] },
    ],
    standardMaterial(palette.warmSoft, {
      emissive: palette.warm,
      emissiveIntensity: 0.82,
      metalness: 0.02,
      roughness: 0.3,
    }),
    false,
  )

  addPlanters(
    identity,
    palette,
    [
      [-4.4, 5.6],
      [-3.25, 5.6],
      [3.25, 5.6],
      [4.4, 5.6],
      [-8.8, 0.6],
      [8.8, 0.6],
    ],
    'office-premium-build',
  )
}

function addStrategy(
  identity: THREE.Group,
  palette: PremiumPalette,
): void {
  addBoxes(
    identity,
    'office-premium-strategy-forum',
    [
      { size: [6.4, 0.16, 1.5], position: [0, 0.8, 0.55] },
      { size: [6.0, 0.07, 1.25], position: [0, 0.9, 0.55] },
      { size: [4.9, 0.58, 0.85], position: [5.9, 0.4, 4.55] },
      { size: [4.9, 0.09, 0.95], position: [5.9, 0.72, 4.55] },
    ],
    standardMaterial(palette.wood, {
      metalness: 0.06,
      roughness: 0.48,
    }),
  )

  const chairSeats: BoxSpec[] = []
  for (const x of [-2.35, -1.15, 0, 1.15, 2.35]) {
    chairSeats.push(
      { size: [0.62, 0.18, 0.62], position: [x, 0.5, -0.75] },
      { size: [0.62, 0.18, 0.62], position: [x, 0.5, 1.85] },
      { size: [0.62, 0.72, 0.12], position: [x, 0.85, -1.02] },
      { size: [0.62, 0.72, 0.12], position: [x, 0.85, 2.12] },
    )
  }
  addBoxes(
    identity,
    'office-premium-strategy-seating',
    chairSeats,
    standardMaterial(palette.upholstery, {
      metalness: 0.02,
      roughness: 0.84,
    }),
  )

  addGlassRoom(identity, palette, [-6.5, -3.65], 4.65, 3.75, 'office-premium-strategy-briefing-room')

  addBoxes(
    identity,
    'office-premium-strategy-briefing-furniture',
    [
      { size: [3.1, 0.13, 1.05], position: [-6.5, 0.78, -3.65] },
      { size: [2.3, 1.15, 0.08], position: [-6.5, 1.62, -5.43] },
      { size: [2.0, 0.82, 0.035], position: [-6.5, 1.62, -5.38] },
      { size: [1.7, 0.08, 0.72], position: [5.9, 1.08, 4.55] },
    ],
    standardMaterial(palette.metal, {
      metalness: 0.3,
      roughness: 0.42,
    }),
  )

  addBoxes(
    identity,
    'office-premium-strategy-display-surfaces',
    [
      { size: [1.9, 0.72, 0.035], position: [-6.5, 1.62, -5.32] },
      { size: [1.45, 0.62, 0.035], position: [5.9, 1.25, 4.16] },
      { size: [1.25, 0.62, 0.035], position: [4.0, 1.25, 4.16] },
      { size: [1.25, 0.62, 0.035], position: [7.8, 1.25, 4.16] },
    ],
    standardMaterial(0x0d2031, {
      emissive: palette.accentSoft,
      emissiveIntensity: 0.45,
      metalness: 0.06,
      roughness: 0.24,
    }),
    false,
  )

  addBoxes(
    identity,
    'office-premium-strategy-practical-glow',
    [
      { size: [5.8, 0.04, 0.055], position: [0, 0.17, -0.25] },
      { size: [4.1, 0.04, 0.05], position: [5.9, 0.16, 4.0] },
      { size: [2.7, 0.04, 0.05], position: [-6.5, 0.16, -5.2] },
    ],
    standardMaterial(palette.warmSoft, {
      emissive: palette.warm,
      emissiveIntensity: 0.85,
      metalness: 0.02,
      roughness: 0.3,
    }),
    false,
  )

  addPlanters(
    identity,
    palette,
    [
      [-4.4, -0.9],
      [-4.4, 1.9],
      [4.4, -0.9],
      [4.4, 1.9],
      [2.9, 5.6],
      [7.8, 5.6],
    ],
    'office-premium-strategy',
  )
}

export function mountPremiumSceneKit(
  parent: THREE.Group,
  floor: OfficeFloorKey,
): THREE.Group {
  const palette = PREMIUM_FLOOR_PALETTE[floor]
  const group = new THREE.Group()
  group.name = 'office-premium-scene-kit'
  group.userData.presentationOnly = true
  group.userData.floor = floor
  group.userData.visualRevision = 'spatial-overhaul-v1'

  addFloorShell(group, palette, floor)
  addArchitecturalShell(group, palette)
  addCommandWall(group, palette)

  const identity = new THREE.Group()
  identity.name = `office-premium-identity-${floor}`
  if (floor === 'commons') addCommons(identity, palette)
  else if (floor === 'strategy') addStrategy(identity, palette)
  else addBuild(identity, palette)
  group.add(identity)

  parent.add(group)
  return group
}
