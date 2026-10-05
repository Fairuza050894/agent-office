import * as THREE from 'three'

import type { RunStage } from '../api'
import type { StationPlacement } from './character'
import type { OfficeFloorKey, OfficeZoneKey } from './livingOffice'
import type { OfficeModeKey } from './officeWorld'

const OFFICE_WIDTH = 20
const OFFICE_DEPTH = 14
const HUB = new THREE.Vector3(0, 0, -1.55)
const DESK_CLEARANCE = 0.34
const LIFT_CORE_X = 7.85
const LIFT_FRAME_Z = -6.77
const LIFT_LANDING_Z = -5.85

export const ENTRANCE = new THREE.Vector3(0, 0, -6.28)
export const WAITING = new THREE.Vector3(-4.95, 0, 0.9)
export const INCIDENT = new THREE.Vector3(4.85, 0, 0.8)

interface Workstation {
  id: string
  desk: THREE.Vector3
  station: THREE.Vector3
  yaw: number
  route: THREE.Vector3[]
}

export type EngineeringPodPresentation = 'primitive' | 'kit'

export interface EngineeringPodPilotPlacement {
  index: number
  desk: StationPlacement
  chair: StationPlacement
  screen: StationPlacement
  keyboard: StationPlacement
  mouse: StationPlacement
}

export interface OfficeEnvironmentMember {
  id: string
  agent_profile_key: string
  zone?: OfficeZoneKey
  placementIndex?: number
  status?: string
}

interface Obstacle {
  center: THREE.Vector3
  halfX: number
  halfZ: number
}

function point(x: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, 0, z)
}

const WORKSTATIONS: Workstation[] = [
  {
    id: 'desk-a1',
    desk: point(-3, 0.18),
    station: point(-3, -0.78),
    yaw: 0,
    route: [HUB, point(-3, -1.55), point(-3, -0.78)],
  },
  {
    id: 'desk-a2',
    desk: point(-1, 0.18),
    station: point(-1, -0.78),
    yaw: 0,
    route: [HUB, point(-1, -1.55), point(-1, -0.78)],
  },
  {
    id: 'desk-a3',
    desk: point(1, 0.18),
    station: point(1, -0.78),
    yaw: 0,
    route: [HUB, point(1, -1.55), point(1, -0.78)],
  },
  {
    id: 'desk-a4',
    desk: point(3, 0.18),
    station: point(3, -0.78),
    yaw: 0,
    route: [HUB, point(3, -1.55), point(3, -0.78)],
  },
  {
    id: 'desk-b1',
    desk: point(-3, 2.68),
    station: point(-3, 3.64),
    yaw: Math.PI,
    route: [
      HUB,
      point(-4.45, -1.55),
      point(-4.45, 3.64),
      point(-3, 3.64),
    ],
  },
  {
    id: 'desk-b2',
    desk: point(-1, 2.68),
    station: point(-1, 3.64),
    yaw: Math.PI,
    route: [
      HUB,
      point(-4.45, -1.55),
      point(-4.45, 3.64),
      point(-1, 3.64),
    ],
  },
  {
    id: 'desk-b3',
    desk: point(1, 2.68),
    station: point(1, 3.64),
    yaw: Math.PI,
    route: [
      HUB,
      point(4.45, -1.55),
      point(4.45, 3.64),
      point(1, 3.64),
    ],
  },
  {
    id: 'desk-b4',
    desk: point(3, 2.68),
    station: point(3, 3.64),
    yaw: Math.PI,
    route: [
      HUB,
      point(4.45, -1.55),
      point(4.45, 3.64),
      point(3, 3.64),
    ],
  },
]

const ROLE_STATIONS: Record<string, string> = {
  architect: 'desk-a1',
  'backend-developer': 'desk-a2',
  'frontend-developer': 'desk-a3',
  explorer: 'desk-a4',
  'qa-reviewer': 'desk-b1',
  'security-reviewer': 'desk-b2',
  verifier: 'desk-b3',
  'documentation-writer': 'desk-b4',
  'ux-reviewer': 'desk-b4',
  'product-manager': 'desk-a1',
  'system-analyst': 'desk-a4',
  'principal-engineer': 'desk-a1',
  'product-designer': 'desk-b4',
  'backend-engineer': 'desk-a2',
  'frontend-engineer': 'desk-a3',
  'qa-engineer': 'desk-b1',
  'technical-writer': 'desk-b3',
}

const ZONE_PLACEMENTS: Record<OfficeZoneKey, StationPlacement[]> = {
  entrance: [
    { position: point(-0.8, -5.75), yaw: 0 },
    { position: point(0, -5.75), yaw: 0 },
    { position: point(0.8, -5.75), yaw: 0 },
  ],
  'coffee-bar': [
    { position: point(5.55, -3.35), yaw: Math.PI * 0.5 },
    { position: point(5.55, -2.45), yaw: Math.PI * 0.5 },
  ],
  pantry: [
    { position: point(6.1, -1.55), yaw: Math.PI },
    { position: point(7.2, -1.55), yaw: Math.PI },
  ],
  lounge: [
    { position: point(-6.0, 3.65), yaw: Math.PI * 0.35 },
    { position: point(-7.35, 3.55), yaw: -Math.PI * 0.35 },
  ],
  'game-corner': [
    { position: point(5.55, 4.25), yaw: Math.PI * 0.5 },
    { position: point(6.25, 5.75), yaw: -Math.PI * 0.5 },
  ],
  'quiet-room': [
    { position: point(-4.15, -2.0), yaw: 0 },
    { position: point(-3.1, -2.0), yaw: 0 },
  ],
  'engineering-pod': WORKSTATIONS.map((workstation) => ({
    position: workstation.station.clone(),
    yaw: workstation.yaw,
  })),
  'qa-bench': [
    { position: point(-7.55, -2.8), yaw: Math.PI },
    { position: point(-5.95, -2.8), yaw: Math.PI },
  ],
  'review-wall': [
    { position: point(5.1, 0.25), yaw: Math.PI * 0.5 },
    { position: point(5.1, 1.35), yaw: Math.PI * 0.5 },
  ],
  'docs-desk': [
    { position: point(6.25, -3.05), yaw: Math.PI },
    { position: point(7.45, -3.05), yaw: Math.PI },
  ],
  'planning-table': [
    { position: point(-1.75, -1.05), yaw: 0 },
    { position: point(0, 2.02), yaw: Math.PI },
    { position: point(1.75, -1.05), yaw: 0 },
    { position: point(-1.75, 1.9), yaw: Math.PI },
    { position: point(0, -1.18), yaw: 0 },
    { position: point(1.75, 1.9), yaw: Math.PI },
  ],
  'architecture-wall': [
    { position: point(3.15, -4.65), yaw: 0 },
    { position: point(4.25, -4.65), yaw: 0 },
    { position: point(5.35, -4.65), yaw: 0 },
  ],
  'decision-room': [
    { position: point(5.6, 3.55), yaw: 0 },
    { position: point(7.5, 3.55), yaw: 0 },
  ],
}

export function officeZonePlacement(
  zone: OfficeZoneKey,
  index: number,
): StationPlacement {
  const placements = ZONE_PLACEMENTS[zone]
  const placement = placements[index % placements.length]
  return {
    position: placement.position.clone(),
    yaw: placement.yaw,
  }
}

export function officeZoneCapacity(zone: OfficeZoneKey): number {
  return ZONE_PLACEMENTS[zone].length
}

function reserveZonePlacement(
  zone: OfficeZoneKey,
  preferredIndex: number,
  occupied: Map<OfficeZoneKey, Set<number>>,
): number {
  const capacity = officeZoneCapacity(zone)
  const slots = occupied.get(zone) ?? new Set<number>()
  occupied.set(zone, slots)

  for (let offset = 0; offset < capacity; offset += 1) {
    const candidate = (preferredIndex + offset) % capacity
    if (slots.has(candidate)) continue
    slots.add(candidate)
    return candidate
  }

  return preferredIndex % capacity
}

const WAITING_BAYS = [
  point(-5.1, 0.35),
  point(-5.1, 1.15),
  point(-5.1, 1.95),
  point(-4.35, 0.35),
  point(-4.35, 1.15),
  point(-4.35, 1.95),
]

const INCIDENT_BAYS = [
  point(4.85, 0.2),
  point(4.85, 0.95),
  point(4.85, 1.7),
  point(5.55, 0.2),
  point(5.55, 0.95),
  point(5.55, 1.7),
]

const ENTRANCE_BAYS = [
  point(-0.75, -6.18),
  point(0, -6.18),
  point(0.75, -6.18),
  point(-0.38, -5.72),
  point(0.38, -5.72),
]

const DESK_OBSTACLES: Obstacle[] = WORKSTATIONS.map((station) => ({
  center: station.desk,
  halfX: 0.7,
  halfZ: 0.39,
}))

const WORKSPACE_NAVIGATION_CLEARANCE = 0.3
const WORKSPACE_NAVIGATION_GRID = 0.5
const WORKSPACE_NAVIGATION_BOUNDS = {
  minX: -9.35,
  maxX: 9.35,
  minZ: -6.35,
  maxZ: 6.35,
}

function obstacle(
  x: number,
  z: number,
  width: number,
  depth: number,
): Obstacle {
  return {
    center: point(x, z),
    halfX: width / 2,
    halfZ: depth / 2,
  }
}

const WORKSPACE_NAVIGATION_OBSTACLES: Record<OfficeFloorKey, Obstacle[]> = {
  commons: [
    obstacle(-1.9, 1.95, 2.2, 0.78),
    obstacle(1.9, 0.55, 2.2, 0.78),
    obstacle(0, 1.25, 1.38, 0.8),
    obstacle(7.15, -4.1, 4.1, 0.82),
    obstacle(7.15, -2.4, 2.45, 0.86),
    obstacle(7.45, 4.5, 2.25, 1.2),
    obstacle(-7.75, 5.2, 2.2, 0.82),
    obstacle(-6.2, 4.9, 1.3, 0.82),
    obstacle(2.6, -5.35, 2.5, 0.78),
  ],
  build: [
    ...DESK_OBSTACLES,
    obstacle(-4.05, 1.43, 0.18, 4.35),
    obstacle(4.05, 1.43, 0.18, 4.35),
    obstacle(-6.75, -3.85, 3.55, 0.88),
    obstacle(-6.35, 4.6, 2.8, 1.15),
    obstacle(6.85, -4.25, 2.55, 0.86),
    obstacle(6.93, 3.7, 0.95, 0.82),
    obstacle(8.17, 3.7, 0.95, 0.82),
    obstacle(6.7, 0.25, 0.92, 1.28),
    obstacle(6.7, 1.45, 0.92, 1.28),
  ],
  strategy: [
    obstacle(-7.25, -3.65, 2.95, 1.3),
    obstacle(0, 0.4, 4.75, 1.5),
    obstacle(-7.75, 5.2, 2.2, 0.82),
    obstacle(-6.2, 4.9, 1.3, 0.82),
    obstacle(5.6, 4.55, 1.2, 1.2),
    obstacle(7.5, 4.55, 1.2, 1.2),
    obstacle(6.7, 0.25, 0.92, 1.28),
    obstacle(6.7, 1.45, 0.92, 1.28),
  ],
}

function navigationPointBlocked(
  candidate: THREE.Vector3,
  floor: OfficeFloorKey,
  padding = WORKSPACE_NAVIGATION_CLEARANCE,
): boolean {
  if (
    candidate.x < WORKSPACE_NAVIGATION_BOUNDS.minX ||
    candidate.x > WORKSPACE_NAVIGATION_BOUNDS.maxX ||
    candidate.z < WORKSPACE_NAVIGATION_BOUNDS.minZ ||
    candidate.z > WORKSPACE_NAVIGATION_BOUNDS.maxZ
  ) {
    return true
  }

  return WORKSPACE_NAVIGATION_OBSTACLES[floor].some((item) => {
    return (
      candidate.x >= item.center.x - item.halfX - padding &&
      candidate.x <= item.center.x + item.halfX + padding &&
      candidate.z >= item.center.z - item.halfZ - padding &&
      candidate.z <= item.center.z + item.halfZ + padding
    )
  })
}

function navigationSegmentClear(
  start: THREE.Vector3,
  end: THREE.Vector3,
  floor: OfficeFloorKey,
  padding = WORKSPACE_NAVIGATION_CLEARANCE,
): boolean {
  return !WORKSPACE_NAVIGATION_OBSTACLES[floor].some((item) =>
    segmentIntersectsObstacle(start, end, item, padding),
  )
}

function navigationKey(x: number, z: number): string {
  return `${x.toFixed(2)}:${z.toFixed(2)}`
}

function navigationGridPoint(x: number, z: number): THREE.Vector3 {
  return point(
    Math.round(x / WORKSPACE_NAVIGATION_GRID) * WORKSPACE_NAVIGATION_GRID,
    Math.round(z / WORKSPACE_NAVIGATION_GRID) * WORKSPACE_NAVIGATION_GRID,
  )
}

function navigationNeighbors(
  current: THREE.Vector3,
  floor: OfficeFloorKey,
): THREE.Vector3[] {
  const result: THREE.Vector3[] = []

  for (const dx of [-1, 0, 1]) {
    for (const dz of [-1, 0, 1]) {
      if (dx === 0 && dz === 0) continue

      const candidate = point(
        current.x + dx * WORKSPACE_NAVIGATION_GRID,
        current.z + dz * WORKSPACE_NAVIGATION_GRID,
      )
      if (navigationPointBlocked(candidate, floor)) continue
      if (!navigationSegmentClear(current, candidate, floor)) continue
      result.push(candidate)
    }
  }

  return result
}

function nearestNavigationPoint(
  source: THREE.Vector3,
  floor: OfficeFloorKey,
): THREE.Vector3 | null {
  const snapped = navigationGridPoint(source.x, source.z)
  if (!navigationPointBlocked(snapped, floor)) return snapped

  for (let ring = 1; ring <= 5; ring += 1) {
    for (let dx = -ring; dx <= ring; dx += 1) {
      for (let dz = -ring; dz <= ring; dz += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue
        const candidate = point(
          snapped.x + dx * WORKSPACE_NAVIGATION_GRID,
          snapped.z + dz * WORKSPACE_NAVIGATION_GRID,
        )
        if (!navigationPointBlocked(candidate, floor)) return candidate
      }
    }
  }

  return null
}

function reconstructNavigationPath(
  endKey: string,
  cameFrom: Map<string, string>,
  nodes: Map<string, THREE.Vector3>,
): THREE.Vector3[] {
  const result: THREE.Vector3[] = []
  let currentKey: string | undefined = endKey

  while (currentKey) {
    const node = nodes.get(currentKey)
    if (node) result.push(node.clone())
    currentKey = cameFrom.get(currentKey)
  }

  return result.reverse()
}

function smoothNavigationPath(
  from: THREE.Vector3,
  points: THREE.Vector3[],
  floor: OfficeFloorKey,
): THREE.Vector3[] {
  if (points.length <= 1) return points.map((item) => item.clone())

  const result: THREE.Vector3[] = []
  let anchor = from.clone()
  let index = 0

  while (index < points.length) {
    let furthest = -1
    for (let candidate = points.length - 1; candidate >= index; candidate -= 1) {
      if (navigationSegmentClear(anchor, points[candidate], floor)) {
        furthest = candidate
        break
      }
    }

    if (furthest < 0) return []

    const waypoint = points[furthest].clone()
    result.push(waypoint)
    anchor = waypoint
    index = furthest + 1
  }

  return result
}

function applyWorkspaceRightHandLane(
  from: THREE.Vector3,
  points: THREE.Vector3[],
  floor: OfficeFloorKey,
): THREE.Vector3[] {
  if (points.length === 0) return []

  const laneOffset = 0.3

  if (points.length === 1) {
    const target = points[0]
    if (from.distanceTo(target) < 1.2) return [target.clone()]

    const direction = target.clone().sub(from)
    direction.y = 0
    if (direction.lengthSq() < 1e-6) return [target.clone()]
    direction.normalize()

    const right = new THREE.Vector3(direction.z, 0, -direction.x)
    const midpoint = from
      .clone()
      .lerp(target, 0.5)
      .addScaledVector(right, laneOffset)

    if (
      !navigationPointBlocked(midpoint, floor) &&
      navigationSegmentClear(from, midpoint, floor) &&
      navigationSegmentClear(midpoint, target, floor)
    ) {
      return [midpoint, target.clone()]
    }

    return [target.clone()]
  }

  const shifted = points.map((item) => item.clone())

  for (let index = 0; index < shifted.length - 1; index += 1) {
    const previous = index === 0 ? from : shifted[index - 1]
    const next = shifted[index + 1]
    const direction = next.clone().sub(previous)
    direction.y = 0
    if (direction.lengthSq() < 1e-6) continue
    direction.normalize()

    const right = new THREE.Vector3(direction.z, 0, -direction.x)
    const candidate = shifted[index].clone().addScaledVector(right, laneOffset)

    const previousSafe = navigationSegmentClear(previous, candidate, floor)
    const nextSafe = navigationSegmentClear(candidate, next, floor)
    if (
      !navigationPointBlocked(candidate, floor) &&
      previousSafe &&
      nextSafe
    ) {
      shifted[index].copy(candidate)
    }
  }

  return shifted
}

export function buildWorkspaceOfficePath(
  from: THREE.Vector3,
  to: THREE.Vector3,
  floor: OfficeFloorKey,
): THREE.Vector3[] {
  if (from.distanceTo(to) < 0.08) return []

  if (navigationSegmentClear(from, to, floor)) {
    return applyWorkspaceRightHandLane(from, [to.clone()], floor)
  }

  const start = nearestNavigationPoint(from, floor)
  const goal = nearestNavigationPoint(to, floor)
  if (!start || !goal) return []

  const startKey = navigationKey(start.x, start.z)
  const goalKey = navigationKey(goal.x, goal.z)
  const open = new Set<string>([startKey])
  const nodes = new Map<string, THREE.Vector3>([
    [startKey, start],
    [goalKey, goal],
  ])
  const cameFrom = new Map<string, string>()
  const gScore = new Map<string, number>([[startKey, 0]])
  const fScore = new Map<string, number>([
    [startKey, start.distanceTo(goal)],
  ])

  while (open.size > 0) {
    let currentKey = ''
    let currentScore = Number.POSITIVE_INFINITY
    open.forEach((key) => {
      const score = fScore.get(key) ?? Number.POSITIVE_INFINITY
      if (score < currentScore) {
        currentKey = key
        currentScore = score
      }
    })
    if (!currentKey) break
    if (currentKey === goalKey) {
      const raw = reconstructNavigationPath(goalKey, cameFrom, nodes)
      const withTarget = [
        ...raw,
        ...(raw.at(-1)?.distanceTo(to) && raw.at(-1)!.distanceTo(to) > 0.08
          ? [to.clone()]
          : []),
      ]
      const smoothed = smoothNavigationPath(from, withTarget, floor)
      if (smoothed.length === 0) return []
      return applyWorkspaceRightHandLane(from, smoothed, floor)
    }

    open.delete(currentKey)
    const current = nodes.get(currentKey)
    if (!current) continue

    navigationNeighbors(current, floor).forEach((neighbor) => {
      const key = navigationKey(neighbor.x, neighbor.z)
      nodes.set(key, neighbor)
      const tentative =
        (gScore.get(currentKey) ?? Number.POSITIVE_INFINITY) +
        current.distanceTo(neighbor)

      if (tentative >= (gScore.get(key) ?? Number.POSITIVE_INFINITY)) return

      cameFrom.set(key, currentKey)
      gScore.set(key, tentative)
      fScore.set(key, tentative + neighbor.distanceTo(goal))
      open.add(key)
    })
  }

  // Fail closed: remaining stationary is preferable to crossing furniture.
  return []
}

export function officeWorkspacePathHasFurnitureClearance(
  path: THREE.Vector3[],
  floor: OfficeFloorKey,
  padding = WORKSPACE_NAVIGATION_CLEARANCE,
): boolean {
  if (path.length < 2) return true

  for (let index = 1; index < path.length; index += 1) {
    if (!navigationSegmentClear(path[index - 1], path[index], floor, padding)) {
      return false
    }
  }

  return true
}

function destinationRoute(target: THREE.Vector3): THREE.Vector3[] | null {
  const workstation = nearestWorkstation(target)
  if (workstation) return workstation.route.map((waypoint) => waypoint.clone())

  const waitingIndex = nearestBay(target, WAITING_BAYS)
  if (waitingIndex !== null) {
    const bay = WAITING_BAYS[waitingIndex]
    return [
      HUB.clone(),
      point(-4.15, -1.55),
      point(-4.15, bay.z),
      bay.clone(),
    ]
  }

  const incidentIndex = nearestBay(target, INCIDENT_BAYS)
  if (incidentIndex !== null) {
    const bay = INCIDENT_BAYS[incidentIndex]
    return [
      HUB.clone(),
      point(4.15, -1.55),
      point(4.15, bay.z),
      bay.clone(),
    ]
  }

  return null
}

function nearestBay(target: THREE.Vector3, bays: THREE.Vector3[]): number | null {
  let best = Number.POSITIVE_INFINITY
  let bestIndex: number | null = null

  bays.forEach((bay, index) => {
    const distance = bay.distanceTo(target)
    if (distance < best) {
      best = distance
      bestIndex = index
    }
  })

  return best < 0.7 ? bestIndex : null
}

function nearestWorkstation(target: THREE.Vector3): Workstation | null {
  let nearest: Workstation | null = null
  let best = Number.POSITIVE_INFINITY

  for (const workstation of WORKSTATIONS) {
    const distance = workstation.station.distanceTo(target)
    if (distance < best) {
      nearest = workstation
      best = distance
    }
  }

  return best < 0.72 ? nearest : null
}

function routeFromCurrentPosition(from: THREE.Vector3): THREE.Vector3[] {
  const workstation = nearestWorkstation(from)
  if (workstation) {
    return workstation.route
      .slice()
      .reverse()
      .map((waypoint) => waypoint.clone())
  }

  const waitingIndex = nearestBay(from, WAITING_BAYS)
  if (waitingIndex !== null) {
    const bay = WAITING_BAYS[waitingIndex]
    return [
      bay.clone(),
      point(-4.15, bay.z),
      point(-4.15, -1.55),
      HUB.clone(),
    ]
  }

  const incidentIndex = nearestBay(from, INCIDENT_BAYS)
  if (incidentIndex !== null) {
    const bay = INCIDENT_BAYS[incidentIndex]
    return [
      bay.clone(),
      point(4.15, bay.z),
      point(4.15, -1.55),
      HUB.clone(),
    ]
  }

  if (from.distanceTo(ENTRANCE) < 1.4) {
    return [from.clone(), point(0, -4.75), HUB.clone()]
  }

  return [
    from.clone(),
    point(Math.max(-4.15, Math.min(4.15, from.x)), -1.55),
    HUB.clone(),
  ]
}

function dedupePath(
  from: THREE.Vector3,
  points: THREE.Vector3[],
): THREE.Vector3[] {
  const result: THREE.Vector3[] = []
  let previous = from

  for (const point of points) {
    if (previous.distanceTo(point) <= 0.08) continue
    result.push(point.clone())
    previous = point
  }

  return result
}

export function buildOfficePath(
  from: THREE.Vector3,
  to: THREE.Vector3,
): THREE.Vector3[] {
  if (from.distanceTo(to) < 0.08) return []

  const sourceRoute = routeFromCurrentPosition(from)
  const targetRoute = destinationRoute(to)

  if (!targetRoute) {
    return dedupePath(from, [
      ...sourceRoute,
      HUB,
      point(to.x, -1.55),
      to,
    ])
  }

  const viaHub = [
    ...sourceRoute,
    HUB,
    ...targetRoute,
  ]

  if (viaHub[viaHub.length - 1]?.distanceTo(to) > 0.08) {
    viaHub.push(to.clone())
  }

  return dedupePath(from, viaHub)
}

export function waitingPosition(index: number): THREE.Vector3 {
  return WAITING_BAYS[index % WAITING_BAYS.length].clone()
}

export function incidentPosition(index: number): THREE.Vector3 {
  return INCIDENT_BAYS[index % INCIDENT_BAYS.length].clone()
}

export function entrancePosition(index: number): THREE.Vector3 {
  return ENTRANCE_BAYS[index % ENTRANCE_BAYS.length].clone()
}

export function officeRoleStation(profileKey: string): StationPlacement {
  const preferredId = ROLE_STATIONS[profileKey]
  const preferred = WORKSTATIONS.find(
    (workstation) => workstation.id === preferredId,
  )
  const fallback =
    preferred ??
    WORKSTATIONS[
      Math.abs(
        [...profileKey].reduce(
          (hash, character) => hash * 31 + character.charCodeAt(0),
          7,
        ),
      ) % WORKSTATIONS.length
    ]

  return {
    position: fallback.station.clone(),
    yaw: fallback.yaw,
  }
}

function segmentIntersectsObstacle(
  start: THREE.Vector3,
  end: THREE.Vector3,
  obstacle: Obstacle,
  padding: number,
): boolean {
  const minX = obstacle.center.x - obstacle.halfX - padding
  const maxX = obstacle.center.x + obstacle.halfX + padding
  const minZ = obstacle.center.z - obstacle.halfZ - padding
  const maxZ = obstacle.center.z + obstacle.halfZ + padding
  const dx = end.x - start.x
  const dz = end.z - start.z

  let tMin = 0
  let tMax = 1

  for (const [origin, delta, min, max] of [
    [start.x, dx, minX, maxX],
    [start.z, dz, minZ, maxZ],
  ] as Array<[number, number, number, number]>) {
    if (Math.abs(delta) < 1e-8) {
      if (origin < min || origin > max) return false
      continue
    }

    const first = (min - origin) / delta
    const second = (max - origin) / delta
    const near = Math.min(first, second)
    const far = Math.max(first, second)
    tMin = Math.max(tMin, near)
    tMax = Math.min(tMax, far)
    if (tMin > tMax) return false
  }

  return tMin <= tMax && tMax >= 0 && tMin <= 1
}

export function officePathHasFurnitureClearance(
  path: THREE.Vector3[],
  padding = DESK_CLEARANCE,
): boolean {
  if (path.length < 2) return true

  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1]
    const end = path[index]
    if (
      DESK_OBSTACLES.some((obstacle) =>
        segmentIntersectsObstacle(start, end, obstacle, padding),
      )
    ) {
      return false
    }
  }

  return true
}

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

function addSphere(
  parent: THREE.Object3D,
  radius: number,
  position: [number, number, number],
  color: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 12),
    standardMaterial(color, 0.9),
  )
  mesh.position.set(...position)
  mesh.castShadow = true
  parent.add(mesh)
  return mesh
}

/**
 * Screen glow follows canonical AgentRun status only. No animation, no
 * progress, no invented activity: RUNNING reads green, WAITING amber,
 * BLOCKED/FAILED red, everything else keeps the neutral display tone.
 * ponytail: zone-level wall displays follow this too when a caller owns the
 * floor status feed; per-desk tint here keys off the desk occupant only.
 */
export type OfficeScreenStatusKind =
  | 'RUNNING'
  | 'WAITING'
  | 'BLOCKED'
  | 'FAILED'
  | 'NEUTRAL'

export function officeScreenStatusKind(
  status: string | null | undefined,
): OfficeScreenStatusKind {
  switch ((status ?? '').toUpperCase()) {
    case 'RUNNING':
    case 'WORKING':
    case 'STARTING':
      return 'RUNNING'
    case 'WAITING':
    case 'WAITING_WORK':
    case 'WAITING_USER':
    case 'PENDING':
      return 'WAITING'
    case 'BLOCKED':
      return 'BLOCKED'
    case 'FAILED':
      return 'FAILED'
    default:
      return 'NEUTRAL'
  }
}

const OFFICE_SCREEN_EMISSIVE: Record<OfficeScreenStatusKind, number> = {
  RUNNING: 0x2f9e6e,
  WAITING: 0xc78a3a,
  BLOCKED: 0xc04a3e,
  FAILED: 0xc04a3e,
  NEUTRAL: 0x183c52,
}

const OFFICE_SCREEN_EMISSIVE_INTENSITY: Record<
  OfficeScreenStatusKind,
  number
> = {
  RUNNING: 0.85,
  WAITING: 0.7,
  BLOCKED: 0.8,
  FAILED: 0.8,
  NEUTRAL: 0.65,
}

export function officeScreenEmissive(status: string | null | undefined): {
  color: number
  intensity: number
} {
  const kind = officeScreenStatusKind(status)
  return {
    color: OFFICE_SCREEN_EMISSIVE[kind],
    intensity: OFFICE_SCREEN_EMISSIVE_INTENSITY[kind],
  }
}

function applyDeskScreenStatus(
  screen: THREE.Mesh,
  status: string | null | undefined,
): void {
  const material = screen.material as THREE.MeshStandardMaterial
  // Every desk screen owns its material via addBox, so per-desk tinting is
  // a safe local mutation. Status comes from canonical AgentRun state only.
  const { color, intensity } = officeScreenEmissive(status)
  material.emissive.setHex(color)
  material.emissiveIntensity = intensity
}

function createStandingDesk(
  position: THREE.Vector3,
  yaw: number,
  occupantStatus: string | null = null,
): THREE.Group {
  const desk = new THREE.Group()
  desk.position.copy(position)
  desk.rotation.y = yaw
  desk.scale.setScalar(0.88)

  addBox(desk, [1.45, 0.09, 0.72], [0, 0.98, 0], 0x8b6748)
  for (const x of [-0.57, 0.57]) {
    for (const z of [-0.23, 0.23]) {
      addBox(desk, [0.06, 0.94, 0.06], [x, 0.49, z], 0x303b46)
    }
  }

  addBox(desk, [0.72, 0.43, 0.055], [0, 1.32, 0.09], 0x141b24)
  const screen = addBox(desk, [0.62, 0.33, 0.018], [0, 1.32, 0.055], 0x477ca4)
  applyDeskScreenStatus(screen, occupantStatus)
  addBox(desk, [0.045, 0.3, 0.045], [0, 1.14, 0.03], 0x485562)
  addBox(desk, [0.48, 0.035, 0.2], [0, 1.04, -0.2], 0x65727d)
  addBox(desk, [0.34, 0.018, 0.13], [-0.08, 1.055, -0.31], 0x252e38)
  addBox(desk, [0.18, 0.012, 0.15], [0.31, 1.06, -0.29], 0x3e4b57)
  addCylinder(desk, 0.065, 0.12, [-0.47, 1.07, -0.22], 0xc7cbd0)

  return desk
}

function createDeskChair(
  position: THREE.Vector3,
  yaw: number,
): THREE.Group {
  const chair = new THREE.Group()
  chair.position.copy(position)
  chair.rotation.y = yaw

  addBox(chair, [0.52, 0.08, 0.52], [0, 0.5, 0], 0x34404c)
  addBox(chair, [0.52, 0.66, 0.08], [0, 0.79, 0.22], 0x3f4d5a)
  addCylinder(chair, 0.045, 0.42, [0, 0.25, 0], 0x242d35)
  addBox(chair, [0.52, 0.035, 0.05], [0, 0.06, 0], 0x242d35)
  return chair
}

function createPlant(position: THREE.Vector3, scale = 1): THREE.Group {
  const plant = new THREE.Group()
  plant.position.copy(position)
  plant.scale.setScalar(scale * 0.72)

  addCylinder(plant, 0.22, 0.34, [0, 0.17, 0], 0xa37b5b)
  addSphere(plant, 0.38, [0, 0.72, 0], 0x3f7657)
  addSphere(plant, 0.25, [-0.19, 0.63, 0.02], 0x4b8360)
  addSphere(plant, 0.27, [0.19, 0.69, -0.02], 0x376b4e)

  return plant
}

function addGlassPanel(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
): void {
  const material = new THREE.MeshStandardMaterial({
    color: 0x9fc4d8,
    emissive: 0x152c38,
    emissiveIntensity: 0.28,
    roughness: 0.18,
    metalness: 0.06,
    transparent: true,
    opacity: 0.38,
  })
  const panel = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  panel.position.set(...position)
  panel.receiveShadow = true
  parent.add(panel)
}

function createMeetingRoom(parent: THREE.Group): void {
  const x = -7.25
  const z = -3.65

  addBox(parent, [4.7, 0.035, 4.25], [x, 0.04, z], 0x4f5961)
  addGlassPanel(parent, [4.7, 2.75, 0.06], [x, 1.38, z - 2.08])
  addGlassPanel(parent, [0.06, 2.75, 4.25], [x - 2.32, 1.38, z])
  addGlassPanel(parent, [0.06, 2.75, 2.75], [x + 2.32, 1.38, z - 0.72])
  addGlassPanel(parent, [1.45, 2.75, 0.06], [x + 1.6, 1.38, z + 2.08])

  addBox(parent, [2.8, 0.12, 1.15], [x, 0.78, z], 0x805c42)
  addBox(parent, [0.08, 0.7, 0.08], [x - 1.05, 0.38, z - 0.38], 0x303943)
  addBox(parent, [0.08, 0.7, 0.08], [x + 1.05, 0.38, z - 0.38], 0x303943)
  addBox(parent, [0.08, 0.7, 0.08], [x - 1.05, 0.38, z + 0.38], 0x303943)
  addBox(parent, [0.08, 0.7, 0.08], [x + 1.05, 0.38, z + 0.38], 0x303943)

  for (const [dx, dz, yaw] of [
    [-1.15, -0.95, Math.PI],
    [0, -0.95, Math.PI],
    [1.15, -0.95, Math.PI],
    [-1.15, 0.95, 0],
    [0, 0.95, 0],
    [1.15, 0.95, 0],
  ] as Array<[number, number, number]>) {
    parent.add(createDeskChair(point(x + dx, z + dz), yaw))
  }

  addBox(parent, [2.4, 1.15, 0.08], [x, 1.65, z - 2.01], 0xe6e9e8)
  addBox(parent, [1.2, 0.62, 0.035], [x, 1.65, z - 1.95], 0x27445d)
}

function createPantry(parent: THREE.Group): void {
  const pantry = new THREE.Group()
  pantry.name = 'office-pantry'
  pantry.position.set(7.15, 0, -2.75)

  addBox(pantry, [4.5, 0.035, 3.7], [0, 0.04, 0], 0x6f5a49)
  addBox(pantry, [4.0, 0.86, 0.68], [0, 0.43, -1.35], 0x52606a)
  addBox(pantry, [4.1, 0.08, 0.76], [0, 0.9, -1.35], 0x8a6246)
  addBox(pantry, [0.86, 1.55, 0.72], [1.45, 0.78, -1.25], 0xcbd3d8)
  addBox(pantry, [0.56, 0.68, 0.46], [-1.35, 1.23, -1.28], 0x1f2933)
  addCylinder(pantry, 0.08, 0.18, [-0.55, 1.03, -1.15], 0xf0ebe4)
  addCylinder(pantry, 0.08, 0.18, [-0.28, 1.03, -1.15], 0xf0ebe4)

  addBox(pantry, [2.35, 0.12, 0.75], [0, 0.82, 0.35], 0x8b6748)
  for (const dx of [-0.78, 0.78]) {
    addBox(pantry, [0.08, 0.76, 0.08], [dx, 0.4, 0.35], 0x303943)
  }

  for (const dx of [-0.78, 0, 0.78]) {
    addCylinder(pantry, 0.28, 0.08, [dx, 0.58, 1.05], 0x40505e)
    addCylinder(pantry, 0.045, 0.58, [dx, 0.29, 1.05], 0x303943)
  }

  for (const dx of [-1.25, 0, 1.25]) {
    const shade = addCylinder(pantry, 0.2, 0.22, [dx, 3.12, 0.2], 0xd9b36c)
    ;(shade.material as THREE.MeshStandardMaterial).emissive.setHex(0x7a5322)
    ;(shade.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.85
  }

  parent.add(pantry)
}

function createGameRoom(parent: THREE.Group): void {
  const x = 7.2
  const z = 4.25

  addBox(parent, [4.7, 0.04, 4.15], [x, 0.045, z], 0x3e505c)
  addGlassPanel(parent, [0.06, 2.6, 4.15], [x - 2.34, 1.3, z])
  addGlassPanel(parent, [2.9, 2.6, 0.06], [x - 0.88, 1.3, z - 2.05])

  const gameTable = new THREE.Group()
  gameTable.position.set(x + 0.25, 0, z + 0.25)
  addBox(gameTable, [2.1, 0.18, 1.05], [0, 0.77, 0], 0x334758)
  addBox(gameTable, [1.78, 0.05, 0.78], [0, 0.88, 0], 0x5b7f6b)
  for (const dx of [-0.82, 0.82]) {
    for (const dz of [-0.34, 0.34]) {
      addBox(gameTable, [0.08, 0.72, 0.08], [dx, 0.36, dz], 0x252d35)
    }
  }
  for (const zRod of [-0.27, 0, 0.27]) {
    addBox(gameTable, [2.45, 0.035, 0.035], [0, 1.02, zRod], 0xc7ccd1)
  }
  parent.add(gameTable)

  addBox(parent, [2.1, 1.25, 0.12], [x + 1.05, 1.72, z - 1.82], 0x18232e)
  const screen = addBox(
    parent,
    [1.82, 0.98, 0.035],
    [x + 1.05, 1.72, z - 1.74],
    0x315f78,
  )
  ;(screen.material as THREE.MeshStandardMaterial).emissive.setHex(0x183c52)
  ;(screen.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.65

  addSphere(parent, 0.44, [x - 1.25, 0.42, z + 1.15], 0x865a55)
  addSphere(parent, 0.42, [x - 0.35, 0.4, z + 1.25], 0x536c86)
  addBox(parent, [1.2, 0.42, 0.6], [x - 1.3, 0.3, z - 0.85], 0x425a6d)
}

function createLoungeAndFocus(parent: THREE.Group): void {
  const x = -7.2
  const z = 4.35

  addBox(parent, [4.55, 0.04, 4.05], [x, 0.045, z], 0x5a514b)
  addBox(parent, [2.1, 0.42, 0.72], [x - 0.55, 0.32, z + 0.85], 0x3f6079)
  addBox(parent, [2.1, 0.72, 0.18], [x - 0.55, 0.64, z + 1.13], 0x3f6079)
  addBox(parent, [1.15, 0.11, 0.72], [x + 1.0, 0.34, z + 0.55], 0x9a714d)
  addCylinder(parent, 0.055, 0.5, [x + 1.0, 0.15, z + 0.55], 0x343d46)

  for (const boothX of [x - 1.25, x + 0.25]) {
    addBox(parent, [1.18, 2.25, 0.08], [boothX, 1.13, z - 1.5], 0x465560)
    addBox(parent, [0.08, 2.25, 1.25], [boothX - 0.55, 1.13, z - 0.92], 0x465560)
    addBox(parent, [0.08, 2.25, 1.25], [boothX + 0.55, 1.13, z - 0.92], 0x465560)
    addBox(parent, [1.02, 0.08, 0.55], [boothX, 0.88, z - 0.95], 0x805f48)
  }

  parent.add(createPlant(point(x + 1.65, z + 1.35), 1.15))
}

function createQuietRoom(parent: THREE.Group): void {
  const x = -3.6
  const z = -2.15

  addBox(parent, [4.2, 0.04, 3.3], [x, 0.045, z], 0x40505a)
  addGlassPanel(parent, [4.2, 2.35, 0.06], [x, 1.18, z - 1.62])
  addGlassPanel(parent, [0.06, 2.35, 3.3], [x - 2.08, 1.18, z])
  addBox(parent, [2.65, 0.025, 1.75], [x, 0.075, z + 0.2], 0x416b5c)
  addBox(parent, [2.5, 1.05, 0.08], [x, 1.45, z - 1.52], 0x5f6f78)
  parent.add(createPlant(point(x + 1.45, z + 1.05), 0.72))
}

function createCommonsHub(parent: THREE.Group): void {
  const rug = addBox(parent, [6.6, 0.025, 4.3], [0, 0.055, 1.2], 0x4e5754)
  rug.receiveShadow = true

  addBox(parent, [2.15, 0.42, 0.72], [-1.9, 0.32, 1.95], 0x405f72)
  addBox(parent, [2.15, 0.72, 0.18], [-1.9, 0.64, 2.23], 0x405f72)
  addBox(parent, [2.15, 0.42, 0.72], [1.9, 0.32, 0.55], 0x5c526c)
  addBox(parent, [2.15, 0.72, 0.18], [1.9, 0.64, 0.27], 0x5c526c)

  addBox(parent, [1.3, 0.1, 0.72], [0, 0.34, 1.25], 0x946d4e)
  addCylinder(parent, 0.055, 0.5, [-0.45, 0.16, 1.25], 0x303943)
  addCylinder(parent, 0.055, 0.5, [0.45, 0.16, 1.25], 0x303943)

  for (const [x, z] of [
    [-0.85, 0.15],
    [0.9, 2.35],
  ] as Array<[number, number]>) {
    const table = addCylinder(parent, 0.46, 0.08, [x, 0.63, z], 0x876247)
    table.rotation.y = Math.PI * 0.25
    addCylinder(parent, 0.055, 0.58, [x, 0.31, z], 0x303943)
  }
}

function createStrategyHub(parent: THREE.Group): void {
  const rug = addBox(parent, [7.4, 0.025, 4.7], [0, 0.055, 0.45], 0x4d5558)
  rug.receiveShadow = true

  addBox(parent, [4.6, 0.13, 1.35], [0, 0.78, 0.4], 0x825d43)
  for (const x of [-1.75, 1.75]) {
    for (const z of [0.0, 0.8]) {
      addBox(parent, [0.08, 0.72, 0.08], [x, 0.39, z], 0x303943)
    }
  }

  addBox(parent, [3.4, 1.45, 0.1], [4.15, 1.72, -5.98], 0x334c5d)
  const board = addBox(parent, [2.95, 1.08, 0.035], [4.15, 1.72, -5.9], 0x1d3c50)
  ;(board.material as THREE.MeshStandardMaterial).emissive.setHex(0x102c3d)
  ;(board.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.42

  addBox(parent, [1.45, 0.9, 0.12], [3.75, 1.18, 3.95], 0x53616b)
  addBox(parent, [1.05, 0.62, 0.035], [3.68, 1.28, 3.95], 0x29475a)

  parent.add(createPlant(point(-3.2, 2.65), 0.72))
  parent.add(createPlant(point(3.15, -1.9), 0.66))
}

function createReceptionCorner(parent: THREE.Group): void {
  const x = 2.6
  const z = -5.35

  addBox(parent, [3.25, 0.035, 1.85], [x, 0.04, z], 0x4b555d)
  addBox(parent, [2.25, 0.82, 0.62], [x, 0.43, z], 0x7f5b42)
  addBox(parent, [2.42, 0.08, 0.72], [x, 0.88, z], 0x9a704e)
  addBox(parent, [0.72, 0.46, 0.05], [x - 0.48, 1.2, z + 0.12], 0x19232e)
  addBox(parent, [0.62, 0.35, 0.018], [x - 0.48, 1.2, z + 0.08], 0x3d789b)
  addCylinder(parent, 0.065, 0.12, [x + 0.68, 1.0, z + 0.02], 0xc7cbd0)
}

function createCommunityWall(parent: THREE.Group): void {
  addBox(parent, [0.08, 2.45, 3.15], [-9.66, 1.24, -0.35], 0x3f4c56)
  const board = addBox(
    parent,
    [0.035, 1.42, 2.5],
    [-9.58, 1.45, -0.35],
    0x223746,
  )
  ;(board.material as THREE.MeshStandardMaterial).emissive.setHex(0x102837)
  ;(board.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.32

  for (const [z, color] of [
    [-1.15, 0x6c8c78],
    [-0.55, 0x8d6a52],
    [0.05, 0x526f89],
    [0.65, 0x7b5d7e],
  ] as Array<[number, number]>) {
    addBox(parent, [0.025, 0.28, 0.42], [-9.53, 1.55, z], color)
  }

  addBox(parent, [1.55, 0.12, 0.72], [-8.75, 0.86, 1.3], 0x875f42)
  addCylinder(parent, 0.05, 0.78, [-9.25, 0.42, 1.3], 0x313b45)
  addCylinder(parent, 0.05, 0.78, [-8.25, 0.42, 1.3], 0x313b45)
}

function createQaLab(parent: THREE.Group): void {
  const x = -6.75
  const z = -3.85

  addBox(parent, [4.35, 0.035, 2.75], [x, 0.04, z], 0x48515a)
  addBox(parent, [3.45, 0.1, 0.78], [x, 0.82, z], 0x876144)
  for (const dx of [-1.15, 0, 1.15]) {
    addBox(parent, [0.68, 0.4, 0.05], [x + dx, 1.16, z + 0.06], 0x151e28)
    const screen = addBox(
      parent,
      [0.58, 0.31, 0.018],
      [x + dx, 1.16, z + 0.03],
      0x3b7191,
    )
    ;(screen.material as THREE.MeshStandardMaterial).emissive.setHex(0x173d54)
    ;(screen.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.52
  }
  addBox(parent, [0.78, 1.45, 0.7], [x + 1.55, 0.73, z + 0.88], 0x535e67)
}

function createPairingIsland(parent: THREE.Group): void {
  const x = -6.35
  const z = 4.6

  addBox(parent, [3.6, 0.035, 2.5], [x, 0.04, z], 0x5b514b)
  addBox(parent, [2.7, 0.12, 1.05], [x, 0.82, z], 0x8c6648)
  for (const dx of [-0.92, 0.92]) {
    addBox(parent, [0.07, 0.76, 0.07], [x + dx, 0.4, z - 0.34], 0x303943)
    addBox(parent, [0.07, 0.76, 0.07], [x + dx, 0.4, z + 0.34], 0x303943)
  }
  addBox(parent, [1.0, 0.56, 0.05], [x, 1.23, z], 0x17212b)
  addBox(parent, [0.88, 0.45, 0.018], [x, 1.23, z - 0.03], 0x476f87)
}

function createDocsNook(parent: THREE.Group): void {
  const x = 6.85
  const z = -4.25

  addBox(parent, [3.45, 0.035, 2.45], [x, 0.04, z], 0x504b46)
  addBox(parent, [2.45, 0.1, 0.76], [x, 0.82, z], 0x8b6548)
  for (const dx of [-0.82, 0.82]) {
    addBox(parent, [0.07, 0.76, 0.07], [x + dx, 0.4, z - 0.25], 0x303943)
    addBox(parent, [0.07, 0.76, 0.07], [x + dx, 0.4, z + 0.25], 0x303943)
  }

  addBox(parent, [0.8, 0.48, 0.05], [x - 0.45, 1.17, z], 0x18222c)
  const screen = addBox(
    parent,
    [0.68, 0.37, 0.018],
    [x - 0.45, 1.17, z - 0.03],
    0x476f87,
  )
  ;(screen.material as THREE.MeshStandardMaterial).emissive.setHex(0x17354a)
  ;(screen.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.38

  addBox(parent, [1.1, 1.55, 0.36], [x + 1.25, 0.78, z - 0.65], 0x4b5963)
  for (const y of [0.42, 0.77, 1.12]) {
    addBox(parent, [0.86, 0.05, 0.3], [x + 1.25, y, z - 0.84], 0x7a604c)
  }
}

function createOpsRack(parent: THREE.Group): void {
  const x = 7.55
  const z = 3.7

  addBox(parent, [2.3, 0.035, 2.7], [x, 0.04, z], 0x3e4850)
  for (const rackX of [x - 0.62, x + 0.62]) {
    addBox(parent, [0.82, 1.95, 0.72], [rackX, 0.98, z], 0x252f38)
    for (const y of [0.48, 0.82, 1.16, 1.5]) {
      const panel = addBox(parent, [0.62, 0.16, 0.035], [rackX, y, z - 0.37], 0x2e4d5f)
      ;(panel.material as THREE.MeshStandardMaterial).emissive.setHex(0x102b39)
      ;(panel.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.32
    }
  }
}

function createRoadmapWall(parent: THREE.Group): void {
  const wall = new THREE.Group()
  wall.name = 'office-strategy-roadmap-wall'
  wall.position.set(3.65, 0, -5.88)

  addBox(wall, [4.45, 1.65, 0.08], [0, 1.72, 0], 0x394955)
  const board = addBox(wall, [4.05, 1.28, 0.035], [0, 1.72, 0.06], 0x173141)
  ;(board.material as THREE.MeshStandardMaterial).emissive.setHex(0x0f2735)
  ;(board.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.38

  for (const [dx, dy, color] of [
    [-1.4, 0.32, 0x587b91],
    [-0.7, -0.2, 0x75647f],
    [0, 0.22, 0x79875a],
    [0.72, -0.25, 0x8a674c],
    [1.42, 0.3, 0x4f7781],
  ] as Array<[number, number, number]>) {
    addBox(wall, [0.52, 0.34, 0.02], [dx, 1.72 + dy, 0.1], color)
  }

  parent.add(wall)
}

function createDecisionPods(parent: THREE.Group): void {
  const x = 6.55
  const z = 4.55

  addBox(parent, [4.2, 0.035, 3.35], [x, 0.04, z], 0x4a4d52)
  for (const offset of [-0.95, 0.95]) {
    addCylinder(parent, 0.54, 0.09, [x + offset, 0.72, z], 0x856045)
    addCylinder(parent, 0.055, 0.62, [x + offset, 0.34, z], 0x303943)
    addBox(parent, [0.72, 0.42, 0.72], [x + offset, 0.31, z + 0.95], 0x435a6a)
  }
  addBox(parent, [2.65, 1.15, 0.08], [x, 1.6, z - 1.52], 0x485762)
  addBox(parent, [2.25, 0.78, 0.035], [x, 1.6, z - 1.46], 0x29445a)
}

function createReviewWall(parent: THREE.Group): void {
  addBox(parent, [0.14, 2.45, 2.5], [6.05, 1.22, 0.75], 0x46545f)
  const panel = addBox(parent, [0.05, 1.28, 1.75], [5.96, 1.55, 0.75], 0x27445d)
  ;(panel.material as THREE.MeshStandardMaterial).emissive.setHex(0x132b3d)
  ;(panel.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5
  addBox(parent, [0.82, 1.2, 0.48], [6.7, 0.6, 0.25], 0x59636d)
  addBox(parent, [0.82, 1.2, 0.48], [6.7, 0.6, 1.45], 0x59636d)
}

function createWindowWall(parent: THREE.Group): void {
  const glass = new THREE.MeshStandardMaterial({
    color: 0xbcd6e4,
    emissive: 0xdcecf5,
    emissiveIntensity: 0.55,
    roughness: 0.12,
    metalness: 0.02,
    transparent: true,
    opacity: 0.5,
  })

  for (let index = 0; index < 4; index += 1) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1.75, 2.95, 0.08),
      glass.clone(),
    )
    panel.position.set(-2.7 + index * 1.85, 1.52, -6.92)
    panel.receiveShadow = true
    parent.add(panel)
  }
}

function createDoor(position: THREE.Vector3): THREE.Group {
  const group = new THREE.Group()
  group.position.copy(position)
  addBox(group, [1.45, 2.65, 0.14], [0, 1.33, 0], 0x5b4639)
  addBox(group, [1.18, 2.38, 0.03], [0, 1.28, 0.085], 0x6d5141)
  addCylinder(group, 0.04, 0.12, [0.45, 1.18, 0.13], 0xc9a768)
  return group
}

function createWoodFloor(parent: THREE.Group): void {
  const floor = addBox(
    parent,
    [OFFICE_WIDTH, 0.16, OFFICE_DEPTH],
    [0, -0.04, 0],
    0xc9a878,
  )
  floor.receiveShadow = true

  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xa8824f,
    transparent: true,
    opacity: 0.3,
  })
  const vertices: number[] = []

  for (let z = -6.75; z <= 6.75; z += 0.5) {
    vertices.push(-9.9, 0.055, z, 9.9, 0.055, z)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  )
  parent.add(new THREE.LineSegments(geometry, lineMaterial))
}

function createWorkArea(
  parent: THREE.Group,
  presentation: EngineeringPodPresentation = 'primitive',
  deskStatusByWorkstation: ReadonlyMap<string, string> = new Map(),
): void {
  const area = new THREE.Group()
  area.name = 'office-engineering-pod'

  const rug = addBox(area, [8.7, 0.025, 5.65], [0, 0.055, 1.5], 0x62584f)
  rug.receiveShadow = true

  if (presentation === 'primitive') {
    const primitive = new THREE.Group()
    primitive.name = 'office-engineering-pod-primitive'

    WORKSTATIONS.forEach((workstation, index) => {
      primitive.add(
        createStandingDesk(
          workstation.desk,
          workstation.yaw,
          deskStatusByWorkstation.get(workstation.id) ?? null,
        ),
      )

      const chairOffset = workstation.yaw === 0 ? 0.6 : -0.6
      const chair = createDeskChair(
        point(
          workstation.desk.x + (index % 2 === 0 ? -0.64 : 0.64),
          workstation.desk.z + chairOffset,
        ),
        workstation.yaw,
      )
      chair.scale.setScalar(0.78)
      primitive.add(chair)
    })

    area.add(primitive)
  }

  addBox(area, [0.08, 1.25, 4.3], [-4.05, 0.66, 1.43], 0x536a78)
  addBox(area, [0.08, 1.25, 4.3], [4.05, 0.66, 1.43], 0x536a78)
  parent.add(area)
}

function engineeringPodOffset(
  origin: THREE.Vector3,
  yaw: number,
  x: number,
  y: number,
  z: number,
): THREE.Vector3 {
  const offset = new THREE.Vector3(x, y, z)
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
  return origin.clone().add(offset)
}

export function engineeringPodPilotPlacements(): EngineeringPodPilotPlacement[] {
  return WORKSTATIONS.map((workstation, index) => {
    const chairOffset = workstation.yaw === 0 ? 0.6 : -0.6
    const chairX = workstation.desk.x + (index % 2 === 0 ? -0.64 : 0.64)

    return {
      index,
      desk: {
        position: workstation.desk.clone(),
        yaw: workstation.yaw,
      },
      chair: {
        position: new THREE.Vector3(chairX, 0, workstation.desk.z + chairOffset),
        yaw: workstation.yaw,
      },
      screen: {
        position: engineeringPodOffset(
          workstation.desk,
          workstation.yaw,
          0,
          0.99,
          0.1,
        ),
        yaw: workstation.yaw,
      },
      keyboard: {
        position: engineeringPodOffset(
          workstation.desk,
          workstation.yaw,
          -0.04,
          1.0,
          -0.2,
        ),
        yaw: workstation.yaw,
      },
      mouse: {
        position: engineeringPodOffset(
          workstation.desk,
          workstation.yaw,
          0.38,
          1.0,
          -0.18,
        ),
        yaw: workstation.yaw,
      },
    }
  })
}

function roleWorkstation(
  profileKey: string,
  used: Set<string>,
): Workstation {
  const preferredId = ROLE_STATIONS[profileKey]
  const preferred = WORKSTATIONS.find(
    (workstation) =>
      workstation.id === preferredId && !used.has(workstation.id),
  )
  if (preferred) return preferred

  const available = WORKSTATIONS.find(
    (workstation) => !used.has(workstation.id),
  )
  return available ?? WORKSTATIONS[used.size % WORKSTATIONS.length]
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
  return WORKSTATIONS[index % WORKSTATIONS.length].station.clone()
}

const FLOOR_ACCENT: Record<
  OfficeFloorKey,
  { wall: number; accent: number; trim: number }
> = {
  commons: {
    wall: 0xe8e4da,
    accent: 0x7ba05b,
    trim: 0xa8824f,
  },
  build: {
    wall: 0xe6e3db,
    accent: 0x4f7ba0,
    trim: 0x8a9aa5,
  },
  strategy: {
    wall: 0xe9e5dc,
    accent: 0x7a6a9b,
    trim: 0xa07c4e,
  },
}

function createLiftCore(
  parent: THREE.Group,
  floor: OfficeFloorKey,
): void {
  const floorIndex = floor === 'commons' ? 0 : floor === 'build' ? 1 : 2
  const lift = new THREE.Group()
  lift.name = 'office-lift-core'
  lift.position.set(LIFT_CORE_X, 0, 0)

  addBox(lift, [3.15, 2.75, 0.14], [0, 1.42, LIFT_FRAME_Z], 0xd8d3c8)
  addBox(lift, [1.2, 2.2, 0.06], [-0.7, 1.12, -6.66], 0xb9c2c9)
  addBox(lift, [1.2, 2.2, 0.06], [0.7, 1.12, -6.66], 0xb9c2c9)
  addBox(lift, [0.05, 2.16, 0.075], [0, 1.12, -6.61], 0x8a949b)

  addBox(lift, [0.72, 0.34, 0.08], [0, 2.66, -6.6], 0xe8e2d5)
  for (let index = 0; index < 3; index += 1) {
    const active = index === floorIndex
    const lamp = addCylinder(
      lift,
      0.075,
      0.04,
      [-0.2 + index * 0.2, 2.66, -6.52],
      active ? 0x75d5f0 : 0x40515b,
    )
    lamp.rotation.x = Math.PI / 2
    if (active) {
      ;(lamp.material as THREE.MeshStandardMaterial).emissive.setHex(0x39798d)
      ;(lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9
    }
  }

  addBox(lift, [2.45, 0.025, 1.35], [0, 0.065, LIFT_LANDING_Z], 0x3c4548)
  parent.add(lift)
}

function createOfficeShell(
  environment: THREE.Group,
  floor: OfficeFloorKey,
): void {
  addBox(environment, [20.5, 0.34, 14.5], [0, -0.22, 0], 0xb8b2a6)
  createWoodFloor(environment)
  const palette = FLOOR_ACCENT[floor]
  addBox(environment, [20, 3.2, 0.16], [0, 1.56, -6.98], palette.wall)
  addBox(environment, [0.16, 3.2, 14], [-9.92, 1.56, 0], palette.wall)
  addBox(environment, [0.16, 3.2, 14], [9.92, 1.56, 0], palette.wall)

  addBox(environment, [2.3, 2.72, 0.035], [5.0, 1.5, -6.86], palette.accent)
  addBox(environment, [1.95, 0.08, 0.04], [5.0, 0.18, -6.81], palette.trim)

  createWindowWall(environment)
  environment.add(createDoor(new THREE.Vector3(0, 0, -6.9)))
  createLiftCore(environment, floor)
}

function createCup(
  parent: THREE.Group,
  x: number,
  z: number,
  color = 0xd8c7a8,
): void {
  addCylinder(parent, 0.09, 0.16, [x, 0.94, z], color)
  addBox(parent, [0.08, 0.07, 0.03], [x + 0.1, 0.97, z], color)
}

function createLunchTray(
  parent: THREE.Group,
  x: number,
  z: number,
): void {
  addBox(parent, [0.56, 0.035, 0.36], [x, 0.73, z], 0x756f65)
  addCylinder(parent, 0.12, 0.025, [x - 0.13, 0.76, z], 0xd6c7a5)
  addCylinder(parent, 0.07, 0.04, [x + 0.16, 0.77, z + 0.04], 0x8b6d4d)
}

function createCommonsWorldCue(
  parent: THREE.Group,
  mode: OfficeModeKey | null,
): void {
  if (!mode) return

  if (mode === 'ARRIVAL') {
    addBox(parent, [2.4, 0.025, 0.9], [-7.2, 0.07, -5.65], 0x445965)
    createCup(parent, 6.15, -4.08)
    createCup(parent, 6.55, -4.08)
    return
  }

  if (mode === 'LUNCH') {
    createLunchTray(parent, -0.8, 1.18)
    createLunchTray(parent, 0.8, 1.18)
    createLunchTray(parent, 0, 0.35)
    return
  }

  if (mode === 'COFFEE_BREAK') {
    createCup(parent, 6.0, -4.05, 0xcaa47c)
    createCup(parent, 6.42, -4.05, 0xb9805f)
    createCup(parent, 6.84, -4.05, 0x9f795f)
    createCup(parent, 7.26, -4.05, 0xd0b391)
    return
  }

}

function createBuildWorldCue(
  parent: THREE.Group,
  mode: OfficeModeKey | null,
): void {
  if (!mode) return

  if (
    mode === 'CORE_WORK' ||
    mode === 'AFTERNOON_FOCUS' ||
    mode === 'WRAP_UP'
  ) {
    const cue = new THREE.Group()
    cue.name = 'office-build-focus-cue'

    for (const [x, y, color] of [
      [-7.35, 1.35, 0x4f9d78],
      [-6.65, 1.35, 0xd09a35],
      [-5.95, 1.35, 0x4f8ca8],
    ] as Array<[number, number, number]>) {
      const note = addBox(cue, [0.34, 0.22, 0.025], [x, y, -6.68], color)
      note.name = 'office-build-focus-note'
    }

    parent.add(cue)
  }

  if (mode === 'WRAP_UP') {
    createCup(parent, -3.15, 0.18, 0xb68d68)
    createCup(parent, 3.15, 2.68, 0xb68d68)
  }
}

function createStrategyWorldCue(
  parent: THREE.Group,
  mode: OfficeModeKey | null,
): void {
  if (!mode) return

  if (
    mode === 'CORE_WORK' ||
    mode === 'AFTERNOON_FOCUS' ||
    mode === 'WRAP_UP'
  ) {
    for (const [x, z, color] of [
      [-0.7, 0.38, 0x5d8195],
      [0, 0.38, 0x7f6a8d],
      [0.7, 0.38, 0x788b60],
    ] as Array<[number, number, number]>) {
      addBox(parent, [0.38, 0.025, 0.24], [x, 0.87, z], color)
    }
  }

  if (mode === 'LATE_EVENING') {
    const tableLamp = new THREE.PointLight(0xffc77e, 0.28, 4.5)
    tableLamp.position.set(0, 1.5, 0.4)
    parent.add(tableLamp)
  }
}

function createCommonsDetailProps(parent: THREE.Group): void {
  const details = new THREE.Group()
  details.name = 'office-floor-details-commons'

  // Parcel / personal lockers near the entry wall.
  for (const x of [-8.75, -8.05, -7.35]) {
    addBox(details, [0.58, 1.55, 0.5], [x, 0.78, -5.92], 0x52616a)
    addBox(details, [0.4, 0.025, 0.02], [x, 0.9, -5.65], 0x2d3a43)
    addBox(details, [0.4, 0.025, 0.02], [x, 0.42, -5.65], 0x2d3a43)
  }

  // Snack / hydration rack that makes Commons read differently from work floors.
  addBox(details, [0.95, 1.55, 0.58], [8.85, 0.78, -0.35], 0x4e5e67)
  for (const y of [0.5, 0.86, 1.22]) {
    addBox(details, [0.72, 0.05, 0.42], [8.85, y, -0.62], 0x7f664e)
  }
  for (const [y, color] of [
    [0.58, 0x7a9b68],
    [0.94, 0xc58c5f],
    [1.3, 0x6388a4],
  ] as Array<[number, number]>) {
    addBox(details, [0.16, 0.17, 0.08], [8.85, y, -0.83], color)
  }

  // Two compact acoustic phone/focus pods.
  for (const z of [-0.85, 1.05]) {
    addBox(details, [0.72, 2.05, 1.15], [-9.42, 1.03, z], 0x374650)
    addBox(details, [0.035, 1.72, 0.86], [-9.03, 1.06, z], 0x4f7180)
    addBox(details, [0.42, 0.06, 0.34], [-9.1, 0.72, z], 0x805f48)
  }

  parent.add(details)
}

function createBuildDetailProps(parent: THREE.Group): void {
  const details = new THREE.Group()
  details.name = 'office-floor-details-build'

  // Sprint / engineering board.
  addBox(details, [3.55, 1.55, 0.08], [-6.65, 1.72, -6.82], 0x394955)
  const board = addBox(
    details,
    [3.18, 1.18, 0.035],
    [-6.65, 1.72, -6.74],
    0x163141,
  )
  ;(board.material as THREE.MeshStandardMaterial).emissive.setHex(0x0e2634)
  ;(board.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.32

  for (const [x, y, color] of [
    [-7.7, 1.95, 0x5d8195],
    [-7.05, 1.55, 0x7a6950],
    [-6.4, 1.9, 0x69835f],
    [-5.75, 1.5, 0x80617e],
  ] as Array<[number, number, number]>) {
    addBox(details, [0.42, 0.3, 0.02], [x, y, -6.7], color)
  }

  // Charging / utility station.
  addBox(details, [1.55, 0.82, 0.6], [8.75, 0.42, -1.8], 0x4d5a63)
  addBox(details, [1.35, 0.08, 0.72], [8.75, 0.88, -1.8], 0x7f624a)
  for (const x of [8.35, 8.75, 9.15]) {
    addBox(details, [0.23, 0.08, 0.35], [x, 0.97, -1.8], 0x26333d)
  }
  // Print/artifact station and a standing incident huddle point.
  addBox(details, [1.15, 0.92, 0.7], [8.75, 0.46, 0.15], 0x53616a)
  addBox(details, [0.78, 0.18, 0.46], [8.75, 1.02, 0.15], 0x222f39)
  addCylinder(details, 0.48, 0.09, [-8.3, 0.92, 2.15], 0x826147)
  addCylinder(details, 0.055, 0.78, [-8.3, 0.43, 2.15], 0x303943)

  parent.add(details)
}

function createStrategyDetailProps(parent: THREE.Group): void {
  const details = new THREE.Group()
  details.name = 'office-floor-details-strategy'

  // Reference bookshelf / strategy library.
  addBox(details, [1.55, 2.05, 0.5], [-8.85, 1.03, 2.0], 0x46555e)
  for (const y of [0.38, 0.8, 1.22, 1.64]) {
    addBox(details, [1.34, 0.055, 0.42], [-8.85, y, 1.78], 0x7e624c)
  }
  for (const [x, y, color] of [
    [-9.22, 0.58, 0x55788b],
    [-8.92, 0.58, 0x75677f],
    [-8.6, 1.0, 0x7d875c],
    [-9.12, 1.42, 0x8b684f],
    [-8.72, 1.42, 0x537985],
  ] as Array<[number, number, number]>) {
    addBox(details, [0.18, 0.28, 0.12], [x, y, 1.52], color)
  }

  // Presentation sideboard and a warm floor lamp.
  addBox(details, [2.05, 0.72, 0.48], [7.85, 0.36, -3.65], 0x505d65)
  addBox(details, [1.78, 0.08, 0.58], [7.85, 0.78, -3.65], 0x87654b)
  addCylinder(details, 0.07, 1.5, [8.9, 0.75, 2.7], 0x343f47)
  const shade = addCylinder(details, 0.32, 0.38, [8.9, 1.56, 2.7], 0xc9a36b)
  ;(shade.material as THREE.MeshStandardMaterial).emissive.setHex(0x6e4d24)
  ;(shade.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.42
  // Prototype / decision plinths for a more studio-like strategy floor.
  for (const [x, color] of [
    [-7.95, 0x5b7585],
    [-7.25, 0x7b6857],
    [-6.55, 0x667c63],
  ] as Array<[number, number]>) {
    addBox(details, [0.48, 0.62, 0.48], [x, 0.31, -1.75], 0x3d4a52)
    addBox(details, [0.32, 0.22, 0.32], [x, 0.73, -1.75], color)
  }

  parent.add(details)
}

function createCommonsFloor(
  environment: THREE.Group,
  mode: OfficeModeKey | null,
): void {
  createPantry(environment)
  createGameRoom(environment)
  createLoungeAndFocus(environment)
  createQuietRoom(environment)
  createCommonsHub(environment)
  createReceptionCorner(environment)
  createCommunityWall(environment)
  createCommonsDetailProps(environment)
  createCommonsWorldCue(environment, mode)

  const pantryLight = new THREE.PointLight(0xffd6a0, 0.82, 7)
  pantryLight.position.set(7.1, 2.65, -2.8)
  const gameLight = new THREE.PointLight(0x8abbd4, 0.58, 6.5)
  gameLight.position.set(7.0, 2.5, 4.2)
  const loungeLight = new THREE.PointLight(0xffcf9a, 0.46, 6)
  loungeLight.position.set(-7.0, 2.4, 4.2)
  environment.add(pantryLight, gameLight, loungeLight)
}

function createBuildFloor(
  environment: THREE.Group,
  mode: OfficeModeKey | null,
  engineeringPodPresentation: EngineeringPodPresentation,
  deskStatusByWorkstation: ReadonlyMap<string, string> = new Map(),
): void {
  createWorkArea(
    environment,
    engineeringPodPresentation,
    deskStatusByWorkstation,
  )
  createReviewWall(environment)
  createQaLab(environment)
  createPairingIsland(environment)
  createDocsNook(environment)
  createOpsRack(environment)
  createBuildDetailProps(environment)
  createBuildWorldCue(environment, mode)

  const reviewLight = new THREE.PointLight(0xa8d2e8, 0.52, 6.5)
  reviewLight.position.set(5.6, 2.45, 0.9)
  const deskLight = new THREE.PointLight(0xffe0b0, 0.48, 8)
  deskLight.position.set(0, 3.0, 1.5)
  environment.add(reviewLight, deskLight)
}

function createStrategyFloor(
  environment: THREE.Group,
  mode: OfficeModeKey | null,
): void {
  createMeetingRoom(environment)
  createReviewWall(environment)
  createLoungeAndFocus(environment)
  createStrategyHub(environment)
  createRoadmapWall(environment)
  createDecisionPods(environment)
  createStrategyDetailProps(environment)
  createStrategyWorldCue(environment, mode)

  const meetingLight = new THREE.PointLight(0xffe0b0, 0.72, 7.5)
  meetingLight.position.set(-7.1, 2.8, -3.6)
  const reviewLight = new THREE.PointLight(0x8abbd4, 0.5, 6.5)
  reviewLight.position.set(5.7, 2.5, 0.8)
  environment.add(meetingLight, reviewLight)
}

export function createOfficeEnvironment(
  environment: THREE.Group,
  _stages: RunStage[],
  members: OfficeEnvironmentMember[],
  floor: OfficeFloorKey = 'build',
  officeMode: OfficeModeKey | null = null,
  engineeringPodPresentation: EngineeringPodPresentation = 'primitive',
): Map<string, StationPlacement> {
  clearGroup(environment)
  createOfficeShell(environment, floor)

  if (floor === 'commons') createCommonsFloor(environment, officeMode)
  else if (floor === 'strategy') createStrategyFloor(environment, officeMode)
  else {
    // Screen tint follows the seeded desk occupant, then stations reuse the
    // same deterministic desk assignment so characters sit at lit desks.
    const seedUsed = new Set<string>()
    const seedDeskByMember = new Map<string, string>()
    members.forEach((member) => {
      if (member.zone) return
      const workstation = roleWorkstation(member.agent_profile_key, seedUsed)
      seedUsed.add(workstation.id)
      seedDeskByMember.set(member.id, workstation.id)
    })
    const deskStatusByWorkstation = new Map<string, string>()
    members.forEach((member) => {
      const deskId = seedDeskByMember.get(member.id)
      if (deskId && member.status) {
        deskStatusByWorkstation.set(deskId, member.status)
      }
    })
    createBuildFloor(
      environment,
      officeMode,
      engineeringPodPresentation,
      deskStatusByWorkstation,
    )
  }

  environment.add(createPlant(point(-4.65, -1.7), 0.9))
  environment.add(createPlant(point(4.65, -1.7), 0.9))
  environment.add(createPlant(point(-4.9, 4.9), 0.82))
  environment.add(createPlant(point(4.75, 4.85), 0.8))

  const stations = new Map<string, StationPlacement>()
  const used = new Set<string>()
  const occupiedZoneSlots = new Map<OfficeZoneKey, Set<number>>()

  members.forEach((member) => {
    if (member.zone) {
      const index = reserveZonePlacement(
        member.zone,
        member.placementIndex ?? 0,
        occupiedZoneSlots,
      )
      stations.set(member.id, officeZonePlacement(member.zone, index))
      return
    }

    if (floor === 'build') {
      const workstation = roleWorkstation(member.agent_profile_key, used)
      used.add(workstation.id)
      stations.set(member.id, {
        position: workstation.station.clone(),
        yaw: workstation.yaw,
      })
      return
    }

    const fallbackZone: OfficeZoneKey =
      floor === 'strategy' ? 'planning-table' : 'lounge'
    const index = reserveZonePlacement(
      fallbackZone,
      member.placementIndex ?? 0,
      occupiedZoneSlots,
    )
    stations.set(member.id, officeZonePlacement(fallbackZone, index))
  })

  return stations
}

