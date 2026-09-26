import * as THREE from 'three'

import type { AgentRun, RunStage } from '../api'
import type { StationPlacement } from './character'

export const ENTRANCE = new THREE.Vector3(-10.1, 0, 6.6)
export const WAITING = new THREE.Vector3(-9.6, 0, -6.3)
export const INCIDENT = new THREE.Vector3(9.6, 0, -6.3)
export const CORRIDOR_Z = 0

const STAGE_CENTERS = [
  new THREE.Vector3(-6.3, 0, -3.6),
  new THREE.Vector3(0, 0, -3.6),
  new THREE.Vector3(6.3, 0, -3.6),
  new THREE.Vector3(-6.3, 0, 3.6),
  new THREE.Vector3(0, 0, 3.6),
  new THREE.Vector3(6.3, 0, 3.6),
]

function standardMaterial(color: number, roughness = 0.76): THREE.MeshStandardMaterial {
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
      return 0xabc3db
    case 'COMPLETED':
      return 0xb9d4c3
    case 'WAITING':
      return 0xe0cea7
    case 'BLOCKED':
    case 'FAILED':
      return 0xd9b1ad
    default:
      return 0xcbd5e0
  }
}

export function stageCenter(index: number): THREE.Vector3 {
  if (index < STAGE_CENTERS.length) return STAGE_CENTERS[index].clone()
  const row = Math.floor(index / 3)
  const column = index % 3
  return new THREE.Vector3((column - 1) * 6.3, 0, (row - 0.5) * 7.2)
}

function stationOffset(
  index: number,
  count: number,
  stageIndex: number,
): StationPlacement {
  const isTopRow = Math.floor(stageIndex / 3) === 0
  const z = isTopRow ? 0.55 : -0.55
  const yaw = isTopRow ? Math.PI : 0

  if (count <= 1) {
    return {
      position: new THREE.Vector3(0, 0, z),
      yaw,
    }
  }

  const x = count === 2 ? (index === 0 ? -1.2 : 1.2) : (index % 2 === 0 ? -1.15 : 1.15)
  const depth = count > 2 && index > 1 ? -z * 0.9 : z

  return {
    position: new THREE.Vector3(x, 0, depth),
    yaw,
  }
}

function makeFloorLabel(text: string, secondary?: string): THREE.Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context is unavailable.')

  context.fillStyle = '#edf2f7'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#273347'
  context.font = '700 70px system-ui, -apple-system, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, canvas.width / 2, 96, 920)

  if (secondary) {
    context.fillStyle = '#617086'
    context.font = '600 34px ui-monospace, SFMono-Regular, monospace'
    context.fillText(secondary, canvas.width / 2, 176, 920)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.086
  mesh.userData.disposableTexture = texture
  return mesh
}

function createDesk(position: THREE.Vector3, yaw: number): THREE.Group {
  const desk = new THREE.Group()
  desk.position.copy(position)
  desk.rotation.y = yaw

  addBox(desk, [1.72, 0.12, 0.82], [0, 0.72, -0.54], 0xa8b2bf)
  addBox(desk, [0.09, 0.68, 0.09], [-0.73, 0.36, -0.84], 0x667384)
  addBox(desk, [0.09, 0.68, 0.09], [0.73, 0.36, -0.84], 0x667384)
  addBox(desk, [0.09, 0.68, 0.09], [-0.73, 0.36, -0.24], 0x667384)
  addBox(desk, [0.09, 0.68, 0.09], [0.73, 0.36, -0.24], 0x667384)

  addBox(desk, [0.84, 0.5, 0.08], [0, 1.1, -0.66], 0x253244)
  addBox(desk, [0.7, 0.36, 0.025], [0, 1.1, -0.705], 0x6f8faa)
  addBox(desk, [0.06, 0.38, 0.06], [0, 0.9, -0.54], 0x566273)
  addBox(desk, [0.46, 0.05, 0.28], [0, 0.78, -0.18], 0x8894a3)

  const chair = new THREE.Group()
  addBox(chair, [0.52, 0.11, 0.5], [0, 0.48, 0.35], 0x48586b)
  addBox(chair, [0.52, 0.62, 0.1], [0, 0.79, 0.58], 0x48586b)
  addCylinder(chair, 0.055, 0.44, [0, 0.23, 0.35], 0x5e6c7c)
  desk.add(chair)

  return desk
}

function createPlant(position: THREE.Vector3): THREE.Group {
  const plant = new THREE.Group()
  plant.position.copy(position)

  addCylinder(plant, 0.28, 0.42, [0, 0.21, 0], 0x8b6e55)

  const green = standardMaterial(0x4f8064, 0.9)
  for (const [x, y, z, scale] of [
    [0, 0.72, 0, 0.42],
    [-0.24, 0.68, 0.04, 0.28],
    [0.23, 0.73, -0.04, 0.31],
  ] as Array<[number, number, number, number]>) {
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(scale, 14, 10),
      green.clone(),
    )
    crown.position.set(x, y, z)
    crown.castShadow = true
    plant.add(crown)
  }

  return plant
}

function createShelf(position: THREE.Vector3, yaw: number): THREE.Group {
  const shelf = new THREE.Group()
  shelf.position.copy(position)
  shelf.rotation.y = yaw

  addBox(shelf, [1.6, 1.65, 0.35], [0, 0.82, 0], 0x526173)
  for (const y of [0.32, 0.78, 1.24]) {
    addBox(shelf, [1.45, 0.05, 0.3], [0, y, 0], 0x8793a1)
  }

  const colors = [0x8a675a, 0x557d78, 0x6e7392, 0xa8845f]
  for (let index = 0; index < 8; index += 1) {
    const row = Math.floor(index / 4)
    const column = index % 4
    addBox(
      shelf,
      [0.18, 0.28, 0.22],
      [-0.54 + column * 0.34, 0.51 + row * 0.46, -0.02],
      colors[index % colors.length],
    )
  }

  return shelf
}

function createLounge(parent: THREE.Group): void {
  const center = new THREE.Vector3(0, 0, 6.5)
  const rug = addBox(parent, [4.2, 0.05, 1.6], [center.x, 0.035, center.z], 0x9babbc)
  rug.receiveShadow = true

  addBox(parent, [2.3, 0.45, 0.65], [-0.65, 0.34, 6.55], 0x566f8e)
  addBox(parent, [2.3, 0.72, 0.22], [-0.65, 0.65, 6.87], 0x566f8e)
  addBox(parent, [1.1, 0.12, 0.65], [1.4, 0.42, 6.45], 0xa68d74)
  addCylinder(parent, 0.07, 0.55, [1.4, 0.16, 6.45], 0x6f655c)
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

  const slab = addBox(environment, [22.6, 0.48, 16.6], [0, -0.34, 0], 0x596878)
  slab.receiveShadow = true

  const floor = addBox(environment, [22, 0.22, 16], [0, -0.08, 0], 0xb7c3ce)
  floor.receiveShadow = true

  const grid = new THREE.GridHelper(22, 22, 0x8795a4, 0xa8b4c0)
  grid.position.y = 0.038
  grid.scale.z = 16 / 22
  environment.add(grid)

  const corridor = addBox(environment, [20.4, 0.07, 1.2], [0, 0.045, 0], 0x8798a9)
  corridor.receiveShadow = true

  addBox(environment, [22, 1.15, 0.22], [0, 0.48, -7.9], 0x6d7b8b)
  addBox(environment, [0.22, 1.15, 16], [-10.9, 0.48, 0], 0x6d7b8b)
  addBox(environment, [0.22, 1.15, 16], [10.9, 0.48, 0], 0x6d7b8b)

  const stations = new Map<string, StationPlacement>()
  const sortedStages = stages.slice().sort((left, right) => left.order_hint - right.order_hint)

  sortedStages.forEach((stage, stageIndex) => {
    const center = stageCenter(stageIndex)
    const tile = addBox(
      environment,
      [5.5, 0.1, 4.95],
      [center.x, 0.03, center.z],
      stageColor(stage.status),
    )
    tile.receiveShadow = true

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(tile.geometry),
      new THREE.LineBasicMaterial({ color: 0x8391a0 }),
    )
    edge.position.copy(tile.position)
    environment.add(edge)

    const row = Math.floor(stageIndex / 3)
    const partitionZ = row === 0 ? center.z - 2.33 : center.z + 2.33
    addBox(environment, [5.28, 0.72, 0.08], [center.x, 0.39, partitionZ], 0x7d8c9d)

    const label = makeFloorLabel(
      stage.stage_key,
      `Stage ${stage.order_hint} · ${stage.status}`,
    )
    label.position.x = center.x
    label.position.z = row === 0 ? center.z + 2.05 : center.z - 2.05
    label.rotation.z = row === 0 ? 0 : Math.PI
    environment.add(label)

    const stageAgents = agents.filter((agent) => agent.stage_key === stage.stage_key)
    stageAgents.forEach((agent, agentIndex) => {
      const local = stationOffset(agentIndex, stageAgents.length, stageIndex)
      const placement: StationPlacement = {
        position: center.clone().add(local.position),
        yaw: local.yaw,
      }
      stations.set(agent.id, placement)
      environment.add(createDesk(placement.position, placement.yaw))
    })
  })

  const zones = [
    { name: 'ENTRANCE', point: ENTRANCE, color: 0xaebfd1 },
    { name: 'WAITING', point: WAITING, color: 0xd4c18f },
    { name: 'INCIDENT', point: INCIDENT, color: 0xd09c98 },
  ]

  zones.forEach((zone) => {
    addBox(environment, [2.55, 0.1, 1.65], [zone.point.x, 0.035, zone.point.z], zone.color)
    const label = makeFloorLabel(zone.name)
    label.scale.set(0.72, 0.72, 0.72)
    label.position.x = zone.point.x
    label.position.z = zone.point.z
    label.position.y = 0.094
    environment.add(label)
  })

  environment.add(createPlant(new THREE.Vector3(-10, 0, -2.1)))
  environment.add(createPlant(new THREE.Vector3(10, 0, 2.1)))
  environment.add(createPlant(new THREE.Vector3(-9.7, 0, 4.2)))
  environment.add(createPlant(new THREE.Vector3(9.7, 0, -4.2)))

  environment.add(createShelf(new THREE.Vector3(-8.6, 0, -7.55), 0))
  environment.add(createShelf(new THREE.Vector3(8.6, 0, -7.55), 0))

  createLounge(environment)

  return stations
}
