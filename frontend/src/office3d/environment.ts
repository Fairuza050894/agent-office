import * as THREE from 'three'

import type { AgentRun, RunStage } from '../api'
import type { StationPlacement } from './character'

export const ENTRANCE = new THREE.Vector3(8.8, 0, 5.15)
export const WAITING = new THREE.Vector3(-8.2, 0, 5.0)
export const INCIDENT = new THREE.Vector3(8.25, 0, -5.0)
export const CORRIDOR_Z = 0

const STAGE_CENTERS = [
  new THREE.Vector3(-5.7, 0, -2.75),
  new THREE.Vector3(0, 0, -3.15),
  new THREE.Vector3(5.55, 0, -2.7),
  new THREE.Vector3(-5.15, 0, 2.8),
  new THREE.Vector3(0.5, 0, 2.65),
  new THREE.Vector3(5.65, 0, 2.9),
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
      return 0x445d72
    case 'COMPLETED':
      return 0x3f5d50
    case 'WAITING':
      return 0x6b5d3d
    case 'BLOCKED':
    case 'FAILED':
      return 0x6d4644
    default:
      return 0x465462
  }
}

export function stageCenter(index: number): THREE.Vector3 {
  if (index < STAGE_CENTERS.length) return STAGE_CENTERS[index].clone()
  const row = Math.floor(index / 3)
  const column = index % 3
  return new THREE.Vector3((column - 1) * 5.5, 0, (row - 0.5) * 5.4)
}

function stationOffset(
  index: number,
  count: number,
  stageIndex: number,
): StationPlacement {
  const backRow = stageIndex < 3
  const yaw = backRow ? Math.PI : 0
  const deskSide = backRow ? 0.35 : -0.35

  if (count <= 1) {
    return {
      position: new THREE.Vector3(0, 0, deskSide),
      yaw,
    }
  }

  const xOffsets = count === 2 ? [-0.9, 0.9] : [-1.0, 0.95, 0]
  const x = xOffsets[index % xOffsets.length]
  const depth = index > 1 ? -deskSide * 0.85 : deskSide

  return {
    position: new THREE.Vector3(x, 0, depth),
    yaw,
  }
}

function makeFloorLabel(text: string): THREE.Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 160
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context is unavailable.')

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = 'rgba(13, 18, 24, 0.74)'
  context.roundRect(8, 8, 752, 144, 22)
  context.fill()
  context.fillStyle = '#dfe7ee'
  context.font = '700 52px system-ui, -apple-system, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, canvas.width / 2, canvas.height / 2, 690)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.5),
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

function createDesk(position: THREE.Vector3, yaw: number): THREE.Group {
  const desk = new THREE.Group()
  desk.position.copy(position)
  desk.rotation.y = yaw
  desk.scale.setScalar(0.86)

  addBox(desk, [1.5, 0.1, 0.72], [0, 0.68, -0.48], 0x8b6d4c)
  addBox(desk, [0.08, 0.62, 0.08], [-0.61, 0.33, -0.71], 0x3a4652)
  addBox(desk, [0.08, 0.62, 0.08], [0.61, 0.33, -0.71], 0x3a4652)
  addBox(desk, [0.08, 0.62, 0.08], [-0.61, 0.33, -0.25], 0x3a4652)
  addBox(desk, [0.08, 0.62, 0.08], [0.61, 0.33, -0.25], 0x3a4652)

  addBox(desk, [0.72, 0.43, 0.07], [0, 1.02, -0.58], 0x151c25)
  addBox(desk, [0.6, 0.31, 0.025], [0, 1.02, -0.62], 0x4c7697)
  addBox(desk, [0.05, 0.33, 0.05], [0, 0.84, -0.48], 0x3f4b58)
  addBox(desk, [0.45, 0.04, 0.24], [0, 0.74, -0.14], 0x687686)

  const chair = new THREE.Group()
  addBox(chair, [0.45, 0.09, 0.44], [0, 0.43, 0.31], 0x273341)
  addBox(chair, [0.45, 0.52, 0.08], [0, 0.7, 0.5], 0x273341)
  addCylinder(chair, 0.05, 0.38, [0, 0.2, 0.31], 0x596675)
  desk.add(chair)

  return desk
}

function createPlant(position: THREE.Vector3): THREE.Group {
  const plant = new THREE.Group()
  plant.position.copy(position)
  plant.scale.setScalar(0.8)

  addCylinder(plant, 0.28, 0.4, [0, 0.2, 0], 0x785c46)
  const green = standardMaterial(0x4d765d, 0.9)

  for (const [x, y, z, scale] of [
    [0, 0.7, 0, 0.4],
    [-0.22, 0.66, 0.04, 0.27],
    [0.21, 0.71, -0.03, 0.29],
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
  shelf.scale.setScalar(0.86)

  addBox(shelf, [1.45, 1.45, 0.3], [0, 0.72, 0], 0x313f4d)
  for (const y of [0.28, 0.68, 1.08]) {
    addBox(shelf, [1.31, 0.045, 0.26], [0, y, 0], 0x6e7d8c)
  }

  const colors = [0x8b6755, 0x4f746d, 0x626d8e, 0x967451]
  for (let index = 0; index < 8; index += 1) {
    const row = Math.floor(index / 4)
    const column = index % 4
    addBox(
      shelf,
      [0.16, 0.24, 0.19],
      [-0.5 + column * 0.31, 0.44 + row * 0.4, -0.02],
      colors[index % colors.length],
    )
  }

  return shelf
}

function createLounge(parent: THREE.Group): void {
  addBox(parent, [3.0, 0.045, 1.25], [-0.2, 0.03, 5.15], 0x4a5968)
  addBox(parent, [1.85, 0.37, 0.56], [-0.65, 0.29, 5.2], 0x495f7b)
  addBox(parent, [1.85, 0.56, 0.18], [-0.65, 0.55, 5.46], 0x495f7b)
  addBox(parent, [0.9, 0.1, 0.55], [0.92, 0.34, 5.12], 0x8c745c)
  addCylinder(parent, 0.06, 0.48, [0.92, 0.13, 5.12], 0x5d554e)
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

  const slab = addBox(environment, [20.4, 0.32, 13.4], [0, -0.2, 0], 0x171f29)
  slab.receiveShadow = true

  const floor = addBox(environment, [20, 0.16, 13], [0, -0.04, 0], 0x2d3945)
  floor.receiveShadow = true

  const grid = new THREE.GridHelper(20, 20, 0x566573, 0x3d4b58)
  grid.position.y = 0.045
  grid.scale.z = 13 / 20
  environment.add(grid)

  const corridor = addBox(environment, [18.7, 0.035, 0.95], [0, 0.04, 0], 0x52606e)
  corridor.receiveShadow = true

  addBox(environment, [20, 0.66, 0.14], [0, 0.3, -6.43], 0x202a35)
  addBox(environment, [0.14, 0.66, 8.6], [-9.93, 0.3, -2.1], 0x202a35)
  addBox(environment, [0.14, 0.66, 8.6], [9.93, 0.3, -2.1], 0x202a35)

  const stations = new Map<string, StationPlacement>()
  const sortedStages = stages
    .slice()
    .sort((left, right) => left.order_hint - right.order_hint)

  sortedStages.forEach((stage, stageIndex) => {
    const center = stageCenter(stageIndex)
    const rug = addBox(
      environment,
      [4.15, 0.045, 3.15],
      [center.x, 0.035, center.z],
      stageColor(stage.status),
    )
    rug.receiveShadow = true

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(rug.geometry),
      new THREE.LineBasicMaterial({ color: 0x667684 }),
    )
    edge.position.copy(rug.position)
    environment.add(edge)

    const label = makeFloorLabel(stage.stage_key)
    label.position.x = center.x
    label.position.z = center.z + (stageIndex < 3 ? 1.25 : -1.25)
    label.rotation.z = stageIndex < 3 ? 0 : Math.PI
    environment.add(label)

    const stageAgents = agents.filter(
      (agent) => agent.stage_key === stage.stage_key,
    )

    stageAgents.forEach((agent, agentIndex) => {
      const local = stationOffset(
        agentIndex,
        stageAgents.length,
        stageIndex,
      )
      const placement: StationPlacement = {
        position: center.clone().add(local.position),
        yaw: local.yaw,
      }
      stations.set(agent.id, placement)
      environment.add(createDesk(placement.position, placement.yaw))
    })
  })

  const zoneData = [
    { name: 'ENTRANCE', point: ENTRANCE, color: 0x40566a },
    { name: 'WAITING', point: WAITING, color: 0x6d5d3d },
    { name: 'INCIDENT', point: INCIDENT, color: 0x704643 },
  ]

  zoneData.forEach((zone) => {
    addBox(
      environment,
      [1.95, 0.05, 1.2],
      [zone.point.x, 0.04, zone.point.z],
      zone.color,
    )
    const label = makeFloorLabel(zone.name)
    label.scale.set(0.62, 0.62, 0.62)
    label.position.x = zone.point.x
    label.position.z = zone.point.z
    environment.add(label)
  })

  environment.add(createPlant(new THREE.Vector3(-8.75, 0, -5.3)))
  environment.add(createPlant(new THREE.Vector3(8.65, 0, 4.9)))
  environment.add(createPlant(new THREE.Vector3(-8.55, 0, 4.7)))
  environment.add(createShelf(new THREE.Vector3(-7.9, 0, -6.15), 0))
  environment.add(createShelf(new THREE.Vector3(7.9, 0, -6.15), 0))
  createLounge(environment)

  return stations
}
