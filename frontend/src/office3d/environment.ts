import * as THREE from 'three'

import type { AgentRun, RunStage } from '../api'
import type { StationPlacement } from './character'

export const ENTRANCE = new THREE.Vector3(4.75, 0, -2.45)
export const WAITING = new THREE.Vector3(-7.0, 0, 4.15)
export const INCIDENT = new THREE.Vector3(6.8, 0, 3.75)
export const CORRIDOR_Z = 0.15

interface StageLayout {
  center: THREE.Vector3
  yaw: number
}

const STAGE_LAYOUT: StageLayout[] = [
  { center: new THREE.Vector3(-6.25, 0, 2.35), yaw: -0.22 },
  { center: new THREE.Vector3(-3.25, 0, 1.8), yaw: 0.22 },
  { center: new THREE.Vector3(-3.05, 0, -1.15), yaw: -0.18 },
  { center: new THREE.Vector3(-0.25, 0, -1.55), yaw: 0.18 },
  { center: new THREE.Vector3(0.8, 0, 4.0), yaw: Math.PI - 0.2 },
  { center: new THREE.Vector3(4.15, 0, 3.35), yaw: Math.PI + 0.2 },
]

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

function stageColor(status: string): number {
  switch (status.toUpperCase()) {
    case 'RUNNING':
      return 0x334f65
    case 'COMPLETED':
      return 0x355447
    case 'WAITING':
      return 0x665534
    case 'BLOCKED':
    case 'FAILED':
      return 0x643f3d
    default:
      return 0x3f4d5b
  }
}

export function stageCenter(index: number): THREE.Vector3 {
  if (index < STAGE_LAYOUT.length) {
    return STAGE_LAYOUT[index].center.clone()
  }
  const row = Math.floor(index / 3)
  const column = index % 3
  return new THREE.Vector3((column - 1) * 3.2, 0, (row - 1) * 2.6)
}

function stageYaw(index: number): number {
  return STAGE_LAYOUT[index]?.yaw ?? 0
}

function localStationOffset(index: number, count: number): THREE.Vector3 {
  if (count <= 1) return new THREE.Vector3()
  const side = index % 2 === 0 ? -0.68 : 0.68
  const row = Math.floor(index / 2)
  return new THREE.Vector3(side, 0, row * -0.8)
}

function rotateLocal(
  offset: THREE.Vector3,
  yaw: number,
): THREE.Vector3 {
  return offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
}

function makeFloorLabel(text: string): THREE.Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context is unavailable.')

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = 'rgba(9, 15, 22, 0.78)'
  context.roundRect(8, 8, 624, 112, 18)
  context.fill()
  context.fillStyle = '#dfe8ef'
  context.font = '700 42px system-ui, -apple-system, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, canvas.width / 2, canvas.height / 2, 560)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 0.36),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      toneMapped: false,
      depthWrite: false,
    }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.055
  mesh.userData.disposableTexture = texture
  return mesh
}

function createStandingDesk(
  position: THREE.Vector3,
  yaw: number,
): THREE.Group {
  const desk = new THREE.Group()
  desk.position.copy(position)
  desk.rotation.y = yaw

  const topZ = 0.72
  addBox(desk, [1.35, 0.1, 0.62], [0, 1.01, topZ], 0x8b6948)
  addBox(desk, [0.07, 0.97, 0.07], [-0.52, 0.49, topZ - 0.2], 0x2b3643)
  addBox(desk, [0.07, 0.97, 0.07], [0.52, 0.49, topZ - 0.2], 0x2b3643)
  addBox(desk, [0.07, 0.97, 0.07], [-0.52, 0.49, topZ + 0.2], 0x2b3643)
  addBox(desk, [0.07, 0.97, 0.07], [0.52, 0.49, topZ + 0.2], 0x2b3643)

  addBox(desk, [0.66, 0.4, 0.055], [0, 1.34, topZ + 0.12], 0x111821)
  addBox(desk, [0.56, 0.3, 0.02], [0, 1.34, topZ + 0.085], 0x436d8d)
  addBox(desk, [0.05, 0.3, 0.05], [0, 1.17, topZ + 0.05], 0x3e4b59)
  addBox(desk, [0.48, 0.035, 0.19], [0, 1.075, topZ - 0.13], 0x5c6875)

  return desk
}

function createPlant(position: THREE.Vector3): THREE.Group {
  const plant = new THREE.Group()
  plant.position.copy(position)

  addCylinder(plant, 0.24, 0.36, [0, 0.18, 0], 0x765941)
  const leaf = standardMaterial(0x426f54, 0.92)

  for (const [x, y, z, scale] of [
    [0, 0.68, 0, 0.36],
    [-0.18, 0.62, 0.03, 0.24],
    [0.18, 0.67, -0.03, 0.26],
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

function createFiling(position: THREE.Vector3): THREE.Group {
  const group = new THREE.Group()
  group.position.copy(position)
  addBox(group, [0.9, 1.3, 0.55], [0, 0.65, 0], 0x303b47)
  for (const y of [0.36, 0.72, 1.08]) {
    addBox(group, [0.76, 0.03, 0.02], [0, y, 0.285], 0x667483)
  }
  return group
}

function createPrinterStation(position: THREE.Vector3): THREE.Group {
  const group = new THREE.Group()
  group.position.copy(position)
  addBox(group, [1.2, 0.78, 0.62], [0, 0.39, 0], 0x384552)
  addBox(group, [0.82, 0.42, 0.64], [0, 0.94, 0], 0x9da8b2)
  addBox(group, [0.54, 0.08, 0.42], [0, 1.18, -0.03], 0xd5dce2)
  return group
}

function createCoffeeCounter(position: THREE.Vector3): THREE.Group {
  const group = new THREE.Group()
  group.position.copy(position)
  addBox(group, [2.4, 0.84, 0.72], [0, 0.42, 0], 0x535e67)
  addBox(group, [2.48, 0.08, 0.78], [0, 0.87, 0], 0x8a6b4b)
  addBox(group, [0.5, 0.62, 0.42], [-0.55, 1.2, 0], 0x202832)
  addCylinder(group, 0.09, 0.2, [0.3, 1.04, 0], 0xd1d5d7)
  addCylinder(group, 0.09, 0.2, [0.6, 1.04, 0], 0xd1d5d7)
  return group
}

function createLounge(parent: THREE.Group): void {
  addBox(parent, [2.75, 0.05, 2.15], [-6.75, 0.03, 4.05], 0x394a50)
  addBox(parent, [1.65, 0.36, 0.58], [-7.15, 0.29, 4.35], 0x465d79)
  addBox(parent, [1.65, 0.58, 0.18], [-7.15, 0.58, 4.62], 0x465d79)
  addBox(parent, [0.8, 0.1, 0.58], [-5.85, 0.35, 4.0], 0x8a704f)
  addCylinder(parent, 0.05, 0.48, [-5.85, 0.14, 4.0], 0x4b535b)
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const disposableTexture = object.userData.disposableTexture as
      | THREE.Texture
      | undefined
    disposableTexture?.dispose()

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

export function createOfficeEnvironment(
  environment: THREE.Group,
  stages: RunStage[],
  agents: AgentRun[],
): Map<string, StationPlacement> {
  clearGroup(environment)

  const slab = addBox(environment, [18.4, 0.32, 12.4], [0, -0.2, 0], 0x111821)
  slab.receiveShadow = true

  const floor = addBox(environment, [18, 0.14, 12], [0, -0.04, 0], 0x2b3742)
  floor.receiveShadow = true

  const grid = new THREE.GridHelper(18, 24, 0x455563, 0x36434f)
  grid.position.y = 0.04
  grid.scale.z = 12 / 18
  environment.add(grid)

  // Claude-Office inspired open-plan shell: three workstation clusters,
  // a central aisle, and utility anchors instead of six boxed rooms.
  addBox(environment, [18, 1.5, 0.16], [0, 0.7, -5.92], 0x1c2630)
  addBox(environment, [0.16, 1.5, 12], [-8.92, 0.7, 0], 0x1c2630)
  addBox(environment, [0.16, 1.5, 3.1], [8.92, 0.7, -4.42], 0x1c2630)
  addBox(environment, [0.16, 1.5, 6.7], [8.92, 0.7, 2.65], 0x1c2630)

  const aisle = addBox(environment, [13.3, 0.025, 0.82], [0.65, 0.035, CORRIDOR_Z], 0x566674)
  aisle.receiveShadow = true

  addBox(environment, [0.78, 0.025, 7.5], [4.75, 0.035, 1.75], 0x4a5966)

  // Three compact cluster carpets approximate Claude-Office's back,
  // front-left, and right standing-desk groups.
  addBox(environment, [5.5, 0.035, 3.25], [-4.7, 0.025, 2.05], 0x314840)
  addBox(environment, [5.8, 0.035, 3.05], [-1.65, 0.025, -1.45], 0x34444d)
  addBox(environment, [6.1, 0.035, 3.2], [2.65, 0.025, 3.55], 0x354b43)

  const stations = new Map<string, StationPlacement>()
  const sortedStages = stages
    .slice()
    .sort((left, right) => left.order_hint - right.order_hint)

  sortedStages.forEach((stage, stageIndex) => {
    const center = stageCenter(stageIndex)
    const yaw = stageYaw(stageIndex)
    const stageAgents = agents.filter(
      (agent) => agent.stage_key === stage.stage_key,
    )

    const accent = addBox(
      environment,
      [2.0, 0.025, 1.65],
      [center.x, 0.055, center.z],
      stageColor(stage.status),
    )
    accent.receiveShadow = true

    const label = makeFloorLabel(stage.stage_key)
    const labelOffset = rotateLocal(new THREE.Vector3(0, 0, -0.72), yaw)
    label.position.x = center.x + labelOffset.x
    label.position.z = center.z + labelOffset.z
    label.rotation.z = -yaw
    label.scale.setScalar(0.72)
    environment.add(label)

    stageAgents.forEach((agent, agentIndex) => {
      const local = rotateLocal(
        localStationOffset(agentIndex, stageAgents.length),
        yaw,
      )
      const placement: StationPlacement = {
        position: center.clone().add(local),
        yaw,
      }
      stations.set(agent.id, placement)
      environment.add(createStandingDesk(placement.position, placement.yaw))
    })
  })

  createLounge(environment)
  environment.add(createCoffeeCounter(new THREE.Vector3(6.95, 0, -1.45)))
  environment.add(createFiling(new THREE.Vector3(0.2, 0, 0.95)))
  environment.add(createPrinterStation(new THREE.Vector3(7.0, 0, 1.55)))

  for (const point of [
    new THREE.Vector3(-7.8, 0, -4.75),
    new THREE.Vector3(-6.55, 0, 3.2),
    new THREE.Vector3(6.85, 0, 4.7),
    new THREE.Vector3(1.25, 0, -4.6),
  ]) {
    environment.add(createPlant(point))
  }

  const waitingLabel = makeFloorLabel('WAITING')
  waitingLabel.position.set(WAITING.x, 0.06, WAITING.z - 0.75)
  waitingLabel.scale.setScalar(0.58)
  environment.add(waitingLabel)

  const incidentPad = addBox(
    environment,
    [1.8, 0.035, 1.45],
    [INCIDENT.x, 0.04, INCIDENT.z],
    0x68413f,
  )
  incidentPad.receiveShadow = true
  const incidentLabel = makeFloorLabel('INCIDENT')
  incidentLabel.position.set(INCIDENT.x, 0.06, INCIDENT.z)
  incidentLabel.scale.setScalar(0.56)
  environment.add(incidentLabel)

  const entryPad = addBox(
    environment,
    [1.35, 0.035, 1.2],
    [ENTRANCE.x, 0.04, ENTRANCE.z],
    0x3e5265,
  )
  entryPad.receiveShadow = true

  return stations
}
