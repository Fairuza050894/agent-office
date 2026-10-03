import * as THREE from 'three'

import type { OfficeFloorKey } from './livingOffice'

export const OFFICE_NAVIGATION_LANE_OFFSET = 0.18
export const OFFICE_NAVIGATION_MIN_SEGMENT = 0.08

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function officeNavigationLane(agentId: string): -1 | 1 {
  return (stableHash(agentId) & 1) === 0 ? -1 : 1
}

function clampFloorPoint(
  point: THREE.Vector3,
  floor: OfficeFloorKey,
): THREE.Vector3 {
  // All three floors share the same shell footprint. Keep a slightly larger
  // margin on Commons because social furniture sits closer to the walls.
  const xLimit = floor === 'commons' ? 9.15 : 9.25
  const zLimit = floor === 'commons' ? 6.2 : 6.3
  point.x = THREE.MathUtils.clamp(point.x, -xLimit, xLimit)
  point.z = THREE.MathUtils.clamp(point.z, -zLimit, zLimit)
  point.y = 0
  return point
}

export function compactOfficePath(path: THREE.Vector3[]): THREE.Vector3[] {
  const compact: THREE.Vector3[] = []

  for (const candidate of path) {
    const point = candidate.clone()
    const previous = compact.at(-1)
    if (previous && previous.distanceTo(point) < OFFICE_NAVIGATION_MIN_SEGMENT) {
      continue
    }
    compact.push(point)
  }

  if (compact.length < 3) return compact

  const simplified: THREE.Vector3[] = [compact[0]]
  for (let index = 1; index < compact.length - 1; index += 1) {
    const previous = simplified.at(-1)!
    const current = compact[index]
    const next = compact[index + 1]
    const incoming = current.clone().sub(previous).normalize()
    const outgoing = next.clone().sub(current).normalize()

    // Drop effectively collinear waypoints so characters do not micro-turn or
    // jitter on long corridor segments.
    if (incoming.dot(outgoing) > 0.995) continue
    simplified.push(current)
  }
  simplified.push(compact.at(-1)!)
  return simplified
}

export function applyOfficeLaneSeparation(
  path: THREE.Vector3[],
  agentId: string,
  floor: OfficeFloorKey,
): THREE.Vector3[] {
  const compact = compactOfficePath(path)
  if (compact.length <= 1) return compact

  const lane = officeNavigationLane(agentId)
  const result = compact.map((point) => point.clone())

  for (let index = 0; index < result.length - 1; index += 1) {
    const previous = index === 0 ? result[index] : result[index - 1]
    const next = result[index + 1]
    const direction = next.clone().sub(previous)
    direction.y = 0
    if (direction.lengthSq() < 0.0001) continue
    direction.normalize()

    const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x)
    result[index].addScaledVector(
      perpendicular,
      OFFICE_NAVIGATION_LANE_OFFSET * lane,
    )
    clampFloorPoint(result[index], floor)
  }

  // Never offset the factual destination/station. Separation only applies to
  // corridor travel, not where a worker ultimately belongs.
  result[result.length - 1].copy(compact[compact.length - 1])
  return compactOfficePath(result)
}
