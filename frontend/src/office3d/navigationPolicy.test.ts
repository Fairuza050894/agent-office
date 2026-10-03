import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import {
  OFFICE_NAVIGATION_LANE_OFFSET,
  applyOfficeLaneSeparation,
  compactOfficePath,
  officeNavigationLane,
} from './navigationPolicy'

describe('Office navigation policy', () => {
  it('assigns deterministic opposite corridor lanes', () => {
    const a = officeNavigationLane('agent-a')
    const b = officeNavigationLane('agent-b')

    expect(officeNavigationLane('agent-a')).toBe(a)
    expect(officeNavigationLane('agent-b')).toBe(b)
    expect([-1, 1]).toContain(a)
    expect([-1, 1]).toContain(b)
  })

  it('removes duplicate and collinear micro-waypoints', () => {
    const path = compactOfficePath([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.01, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(2, 0, 1),
    ])

    expect(path).toHaveLength(3)
    expect(path[0].toArray()).toEqual([0, 0, 0])
    expect(path[1].toArray()).toEqual([2, 0, 0])
    expect(path[2].toArray()).toEqual([2, 0, 1])
  })

  it('separates corridor travel while preserving the factual destination', () => {
    const original = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 3),
      new THREE.Vector3(3, 0, 3),
    ]
    const separated = applyOfficeLaneSeparation(
      original,
      'agent-a',
      'build',
    )

    expect(separated.at(-1)?.toArray()).toEqual(original.at(-1)?.toArray())
    expect(separated[0].distanceTo(original[0])).toBeCloseTo(
      OFFICE_NAVIGATION_LANE_OFFSET,
    )
    expect(original[0].toArray()).toEqual([0, 0, 0])
  })

  it('keeps separated points inside the Office shell', () => {
    const separated = applyOfficeLaneSeparation(
      [
        new THREE.Vector3(9.14, 0, 0),
        new THREE.Vector3(9.14, 0, 5.5),
        new THREE.Vector3(8.5, 0, 5.5),
      ],
      'agent-edge',
      'commons',
    )

    separated.forEach((point) => {
      expect(Math.abs(point.x)).toBeLessThanOrEqual(9.15)
      expect(Math.abs(point.z)).toBeLessThanOrEqual(6.2)
    })
  })
})
