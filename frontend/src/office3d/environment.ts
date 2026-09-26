import * as THREE from 'three'

import type { AgentRun, RunStage } from '../api'
import type { StationPlacement } from './character'

const OFFICE_WIDTH = 18
const OFFICE_DEPTH = 12

function officePoint(xPercent: number, yPercent: number): THREE.Vector3 {
  return new THREE.Vector3(
    ((xPercent - 50) / 100) * OFFICE_WIDTH,
    0,
    ((yPercent - 62) / 100) * OFFICE_DEPTH,
  )
}

export const ENTRANCE = new THREE.Vector3(3.15, 0, -5.0)
export const WAITING = officePoint(17, 71)
export const INCIDENT = officePoint(86, 66)
export const CORRIDOR_Z = 0.15

interface AgentSpot {
  id: string
  x: number
  y: number
  yaw: number
}

const AGENT_SPOTS: AgentSpot[] = [
  { id: 'spot-1', x: 25.8, y: 71.0, yaw: 0 },
  { id: 'spot-2', x: 37.9, y: 68.2, yaw: 0 },
  { id: 'spot-3', x: 26.9, y: 59.2, yaw: 0 },
  { id: 'spot-4', x: 38.5, y: 55.2, yaw: 0 },
  { id: 'spot-5', x: 48.9, y: 52.9, yaw: 0 },
  { id: 'spot-6', x: 38.8, y: 43.6, yaw: 0 },
  { id: 'spot-7', x: 52.7, y: 78.8, yaw: 0 },
  { id: 'spot-8', x: 65.9, y: 75.8, yaw: 0 },
  { id: 'spot-9', x: 55.2, y: 66.8, yaw: 0 },
  { id: 'spot-10', x: 68.7, y: 66.2, yaw: 0 },
]


const SPOT_ROUTES: Record<string, Array<[number, number]>> = {
  'spot-1': [
    [69.9, 50.8],
    [68.7, 66.2],
    [55.2, 66.8],
    [37.9, 68.2],
    [25.8, 71.0],
  ],
  'spot-2': [
    [69.9, 50.8],
    [57.5, 51.6],
    [47.4, 58.3],
    [37.9, 68.2],
  ],
  'spot-3': [
    [64.0, 46.6],
    [53.3, 46.6],
    [38.5, 55.2],
    [26.9, 59.2],
  ],
  'spot-4': [
    [64.0, 46.6],
    [53.3, 46.6],
    [48.9, 52.9],
    [38.5, 55.2],
  ],
  'spot-5': [
    [64.0, 46.6],
    [53.3, 46.6],
    [48.9, 52.9],
  ],
  'spot-6': [
    [64.0, 46.6],
    [53.3, 46.6],
    [38.8, 43.6],
  ],
  'spot-7': [
    [69.9, 50.8],
    [68.7, 66.2],
    [55.2, 66.8],
    [52.7, 78.8],
  ],
  'spot-8': [
    [69.9, 50.8],
    [68.7, 66.2],
    [65.9, 75.8],
  ],
  'spot-9': [
    [69.9, 50.8],
    [68.7, 66.2],
    [55.2, 66.8],
  ],
  'spot-10': [
    [69.9, 50.8],
    [68.7, 66.2],
  ],
}

function nearestSpot(target: THREE.Vector3): AgentSpot | null {
  let nearest: AgentSpot | null = null
  let best = Number.POSITIVE_INFINITY

  for (const spot of AGENT_SPOTS) {
    const distance = officePoint(spot.x, spot.y).distanceTo(target)
    if (distance < best) {
      nearest = spot
      best = distance
    }
  }

  return best < 0.75 ? nearest : null
}

export function buildOfficePath(
  from: THREE.Vector3,
  to: THREE.Vector3,
): THREE.Vector3[] {
  if (from.distanceTo(to) < 0.08) return []

  const spot = nearestSpot(to)
  if (spot && from.distanceTo(ENTRANCE) < 1.4) {
    const route = (SPOT_ROUTES[spot.id] ?? [])
      .map(([x, y]) => officePoint(x, y))
      .filter((point) => point.distanceTo(from) > 0.08)

    if (route.length === 0 || route[route.length - 1].distanceTo(to) > 0.08) {
      route.push(to.clone())
    }
    return route
  }

  const points = [
    new THREE.Vector3(from.x, 0, CORRIDOR_Z),
    new THREE.Vector3(to.x, 0, CORRIDOR_Z),
    to.clone(),
  ]

  return points.filter((point, index) => {
    const previous = index === 0 ? from : points[index - 1]
    return previous.distanceTo(point) > 0.08
  })
}

const ROLE_SPOTS: Record<string, string> = {
  architect: 'spot-5',
  explorer: 'spot-4',
  'backend-developer': 'spot-2',
  'frontend-developer': 'spot-1',
  'qa-reviewer': 'spot-7',
  'security-reviewer': 'spot-8',
  'ux-reviewer': 'spot-3',
  verifier: 'spot-9',
  'documentation-writer': 'spot-10',
}

const DESK_POINTS = [
  [42.4, 50.4],
  [46.7, 53.0],
  [39.9, 55.2],
  [31.4, 64.8],
  [35.4, 67.5],
  [27.9, 70.0],
  [59.0, 73.7],
  [62.6, 76.0],
  [55.4, 78.7],
  [66.6, 71.1],
] as const

const PLANT_POINTS = [
  [91.9, 64.7],
  [43.2, 37.9],
  [32.0, 71.2],
  [89.2, 65.7],
  [60.2, 80.4],
] as const

function standardMaterial(
  color: number,
  roughness = 0.78,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.02,
  })
}

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  color: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    standardMaterial(color),
  )
  mesh.position.set(...position)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function addCylinder(
  parent: THREE.Object3D,
  radius: number,
  height: number,
  position: [number, number, number],
  color: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 16),
    standardMaterial(color),
  )
  mesh.position.set(...position)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function createStandingDesk(
  position: THREE.Vector3,
  yaw = 0,
): THREE.Group {
  const desk = new THREE.Group()
  desk.position.copy(position)
  desk.rotation.y = yaw
  desk.scale.setScalar(0.88)

  addBox(desk, [1.45, 0.09, 0.72], [0, 0.98, 0], 0x8b6748)
  addBox(desk, [0.06, 0.94, 0.06], [-0.57, 0.49, -0.23], 0x303b46)
  addBox(desk, [0.06, 0.94, 0.06], [0.57, 0.49, -0.23], 0x303b46)
  addBox(desk, [0.06, 0.94, 0.06], [-0.57, 0.49, 0.23], 0x303b46)
  addBox(desk, [0.06, 0.94, 0.06], [0.57, 0.49, 0.23], 0x303b46)

  addBox(desk, [0.72, 0.43, 0.055], [0, 1.32, 0.09], 0x141b24)
  addBox(desk, [0.62, 0.33, 0.018], [0, 1.32, 0.055], 0x4a789b)
  addBox(desk, [0.045, 0.3, 0.045], [0, 1.14, 0.03], 0x485562)
  addBox(desk, [0.48, 0.035, 0.2], [0, 1.04, -0.2], 0x65727d)

  addBox(desk, [0.18, 0.42, 0.42], [0.55, 0.72, 0.02], 0x293541)
  return desk
}

function createPlant(position: THREE.Vector3): THREE.Group {
  const plant = new THREE.Group()
  plant.position.copy(position)

  addCylinder(plant, 0.22, 0.34, [0, 0.17, 0], 0xa37b5b)
  const leaf = standardMaterial(0x3f7657, 0.92)

  for (const [x, y, z, scale] of [
    [0, 0.72, 0, 0.38],
    [-0.19, 0.63, 0.02, 0.25],
    [0.19, 0.69, -0.02, 0.27],
  ] as Array<[number, number, number, number]>) {
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(scale, 14, 10),
      leaf.clone(),
    )
    crown.position.set(x, y, z)
    crown.castShadow = true
    plant.add(crown)
  }

  return plant
}

function createWaterCooler(position: THREE.Vector3): THREE.Group {
  const group = new THREE.Group()
  group.position.copy(position)
  addBox(group, [0.48, 0.9, 0.4], [0, 0.45, 0], 0xc5ced6)
  addCylinder(group, 0.2, 0.55, [0, 1.12, 0], 0x6ba8c8)
  addBox(group, [0.06, 0.1, 0.08], [-0.1, 0.67, 0.22], 0x477ba3)
  addBox(group, [0.06, 0.1, 0.08], [0.1, 0.67, 0.22], 0xb85c54)
  return group
}

function createPrinterStation(position: THREE.Vector3): THREE.Group {
  const group = new THREE.Group()
  group.position.copy(position)
  addBox(group, [1.45, 0.84, 0.64], [0, 0.42, 0], 0x58636d)
  addBox(group, [0.9, 0.4, 0.62], [0, 0.98, 0], 0xd2d8dd)
  addBox(group, [0.6, 0.08, 0.4], [0, 1.23, -0.03], 0xf4f4f0)
  return group
}

function createCoffeeCounter(position: THREE.Vector3): THREE.Group {
  const group = new THREE.Group()
  group.position.copy(position)
  addBox(group, [2.3, 0.82, 0.7], [0, 0.41, 0], 0x58616a)
  addBox(group, [2.4, 0.08, 0.76], [0, 0.86, 0], 0x855f42)
  addBox(group, [0.54, 0.62, 0.4], [-0.55, 1.19, 0], 0x202933)
  addCylinder(group, 0.08, 0.18, [0.25, 1.02, 0], 0xf0ebe4)
  addCylinder(group, 0.08, 0.18, [0.5, 1.02, 0], 0xf0ebe4)
  return group
}

function createFiling(position: THREE.Vector3): THREE.Group {
  const group = new THREE.Group()
  group.position.copy(position)
  addBox(group, [0.82, 1.22, 0.5], [0, 0.61, 0], 0x59636d)
  for (const y of [0.32, 0.62, 0.92]) {
    addBox(group, [0.66, 0.025, 0.02], [0, y, 0.26], 0x9ca8b2)
  }
  return group
}

function createWhiteboard(position: THREE.Vector3): THREE.Group {
  const board = new THREE.Group()
  board.position.copy(position)

  addBox(board, [3.1, 1.65, 0.08], [0, 1.85, 0], 0xb8c2ca)
  addBox(board, [2.92, 1.48, 0.025], [0, 1.85, 0.055], 0xe7eceb)

  const notes = [
    [-0.85, 2.1, 0xdea653],
    [-0.36, 1.72, 0x6f9dc4],
    [0.18, 2.18, 0xd77a6d],
    [0.7, 1.74, 0x7daa70],
    [0.92, 2.2, 0xd5b65f],
  ] as const

  for (const [x, y, color] of notes) {
    addBox(board, [0.28, 0.22, 0.018], [x, y, 0.09], color)
  }

  return board
}

function createWindowWall(parent: THREE.Group): void {
  const glass = new THREE.MeshStandardMaterial({
    color: 0x244561,
    emissive: 0x10253a,
    emissiveIntensity: 0.8,
    roughness: 0.28,
    metalness: 0.08,
    transparent: true,
    opacity: 0.72,
  })

  for (let index = 0; index < 4; index += 1) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 3.0, 0.08),
      glass.clone(),
    )
    panel.position.set(-6.4 + index * 1.95, 1.55, -5.91)
    panel.receiveShadow = true
    parent.add(panel)

    addBox(
      parent,
      [0.07, 3.15, 0.12],
      [-7.38 + index * 1.95, 1.55, -5.88],
      0x26323f,
    )
  }

  addBox(parent, [0.07, 3.15, 0.12], [0.42, 1.55, -5.88], 0x26323f)

  for (const [x, height] of [
    [-7.1, 1.4],
    [-5.7, 2.1],
    [-4.5, 1.2],
    [-3.2, 2.45],
    [-1.8, 1.75],
  ] as Array<[number, number]>) {
    addBox(
      parent,
      [0.8, height, 0.3],
      [x, height / 2 - 0.15, -6.45],
      0x0d1825,
    )
  }
}

function createDoor(position: THREE.Vector3): THREE.Group {
  const group = new THREE.Group()
  group.position.copy(position)
  addBox(group, [1.2, 2.55, 0.14], [0, 1.27, 0], 0x5b4639)
  addBox(group, [0.95, 2.3, 0.03], [0, 1.24, 0.085], 0x6d5141)
  addCylinder(group, 0.04, 0.12, [0.37, 1.18, 0.13], 0xc9a768)
  return group
}

function createLounge(parent: THREE.Group): void {
  const rug = addBox(parent, [3.4, 0.035, 2.4], [-6.8, 0.025, 3.6], 0x46535d)
  rug.receiveShadow = true
  addBox(parent, [1.8, 0.38, 0.62], [-7.3, 0.3, 3.85], 0x385a7a)
  addBox(parent, [1.8, 0.64, 0.18], [-7.3, 0.6, 4.13], 0x385a7a)
  addBox(parent, [0.92, 0.1, 0.58], [-5.8, 0.34, 3.55], 0xa27b54)
  addCylinder(parent, 0.055, 0.48, [-5.8, 0.14, 3.55], 0x4b535b)
}

function createCeilingLights(parent: THREE.Group): void {
  const material = new THREE.MeshStandardMaterial({
    color: 0xf4dfb4,
    emissive: 0xffd991,
    emissiveIntensity: 2.2,
    roughness: 0.38,
  })

  for (const x of [-3.6, 2.2]) {
    const fixture = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.13, 0.38),
      material.clone(),
    )
    fixture.position.set(x, 3.45, -1.0)
    fixture.castShadow = false
    parent.add(fixture)

    addBox(parent, [0.045, 0.8, 0.045], [x - 1.2, 3.85, -1.0], 0x313b45)
    addBox(parent, [0.045, 0.8, 0.045], [x + 1.2, 3.85, -1.0], 0x313b45)
  }
}

function createWoodFloor(parent: THREE.Group): void {
  const floor = addBox(parent, [18, 0.16, 12], [0, -0.04, 0], 0x6b4f3c)
  floor.receiveShadow = true

  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x4d382d,
    transparent: true,
    opacity: 0.42,
  })

  const vertices: number[] = []
  for (let z = -5.7; z <= 5.7; z += 0.48) {
    vertices.push(-8.9, 0.055, z, 8.9, 0.055, z)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  )
  parent.add(new THREE.LineSegments(geometry, lineMaterial))
}

function roleSpot(
  profileKey: string,
  used: Set<string>,
): AgentSpot {
  const preferred = ROLE_SPOTS[profileKey]
  const preferredSpot = AGENT_SPOTS.find(
    (spot) => spot.id === preferred && !used.has(spot.id),
  )
  if (preferredSpot) return preferredSpot

  const available = AGENT_SPOTS.find((spot) => !used.has(spot.id))
  return available ?? AGENT_SPOTS[used.size % AGENT_SPOTS.length]
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose()
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material]
      materials.forEach((material) => material.dispose())
    }
  })
}

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    disposeObject(child)
    group.remove(child)
  }
}

export function stageCenter(index: number): THREE.Vector3 {
  const fallback = AGENT_SPOTS[index % AGENT_SPOTS.length]
  return officePoint(fallback.x, fallback.y)
}

export function createOfficeEnvironment(
  environment: THREE.Group,
  _stages: RunStage[],
  agents: AgentRun[],
): Map<string, StationPlacement> {
  clearGroup(environment)

  addBox(environment, [18.5, 0.34, 12.5], [0, -0.22, 0], 0x111821)
  createWoodFloor(environment)

  addBox(environment, [18, 3.1, 0.16], [0, 1.52, -5.94], 0x51616f)
  addBox(environment, [0.16, 3.1, 12], [-8.92, 1.52, 0], 0x4a5967)
  addBox(environment, [0.16, 3.1, 12], [8.92, 1.52, 0], 0x4a5967)

  createWindowWall(environment)
  environment.add(createDoor(new THREE.Vector3(3.15, 0, -5.82)))
  environment.add(createWhiteboard(new THREE.Vector3(6.1, 0, -5.79)))
  environment.add(createWaterCooler(officePoint(53, 45)))
  environment.add(createCoffeeCounter(officePoint(78.5, 50.2)))
  environment.add(createFiling(officePoint(45, 56.5)))
  environment.add(createPrinterStation(officePoint(85.4, 56.8)))

  DESK_POINTS.forEach(([x, y], index) => {
    const desk = createStandingDesk(officePoint(x, y))
    if (index === 1 || index === 4 || index === 7) {
      addBox(desk, [0.05, 0.9, 1.35], [0.75, 1.18, 0], 0x546b78)
    }
    environment.add(desk)
  })

  PLANT_POINTS.forEach(([x, y]) => {
    environment.add(createPlant(officePoint(x, y)))
  })

  createLounge(environment)
  createCeilingLights(environment)

  const stations = new Map<string, StationPlacement>()
  const used = new Set<string>()

  agents.forEach((agent) => {
    const spot = roleSpot(agent.agent_profile_key, used)
    used.add(spot.id)
    stations.set(agent.id, {
      position: officePoint(spot.x, spot.y),
      yaw: spot.yaw,
    })
  })

  return stations
}
