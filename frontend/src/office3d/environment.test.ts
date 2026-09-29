import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { OFFICE_AMBIENT_ZONE_CAPACITY } from './livingOffice'
import {
  ENTRANCE,
  buildOfficePath,
  createOfficeEnvironment,
  incidentPosition,
  officePathHasFurnitureClearance,
  officeRoleStation,
  officeZoneCapacity,
  officeZonePlacement,
  waitingPosition,
} from './environment'

const CORE_ROLES = [
  'architect',
  'explorer',
  'backend-developer',
  'frontend-developer',
  'qa-reviewer',
  'security-reviewer',
  'verifier',
  'documentation-writer',
] as const

describe('office navigation clearance', () => {
  it('keeps every core workstation route outside desk collision volumes', () => {
    for (const role of CORE_ROLES) {
      const station = officeRoleStation(role)
      const path = [ENTRANCE, ...buildOfficePath(ENTRANCE, station.position)]

      expect(
        officePathHasFurnitureClearance(path),
        `${role} path should not intersect a workstation`,
      ).toBe(true)
    }
  })

  it('routes waiting and incident transitions through safe aisles', () => {
    for (const role of CORE_ROLES) {
      const station = officeRoleStation(role)
      const waiting = waitingPosition(CORE_ROLES.indexOf(role))
      const incident = incidentPosition(CORE_ROLES.indexOf(role))

      const waitingPath = [
        station.position,
        ...buildOfficePath(station.position, waiting),
      ]
      const incidentPath = [
        station.position,
        ...buildOfficePath(station.position, incident),
      ]

      expect(officePathHasFurnitureClearance(waitingPath)).toBe(true)
      expect(officePathHasFurnitureClearance(incidentPath)).toBe(true)
    }
  })

  it('provides deterministic multi-slot anchors for living-office zones', () => {
    const planning = [0, 1, 2, 3].map((index) =>
      officeZonePlacement('planning-table', index),
    )
    const positions = planning.map(
      (placement) =>
        `${placement.position.x.toFixed(2)}:${placement.position.z.toFixed(2)}`,
    )

    expect(new Set(positions).size).toBe(4)
    expect(officeZonePlacement('coffee-bar', 0).position.x).toBeGreaterThan(0)
  })

  it('exposes enough capacity for social and planning movement without forced overlap', () => {
    expect(officeZoneCapacity('planning-table')).toBeGreaterThanOrEqual(6)
    expect(officeZoneCapacity('lounge')).toBeGreaterThanOrEqual(2)
    expect(officeZoneCapacity('game-corner')).toBeGreaterThanOrEqual(2)
    expect(officeZoneCapacity('coffee-bar')).toBeGreaterThanOrEqual(2)
  })

  it('keeps semantic ambient capacity aligned with actual zone slots', () => {
    Object.entries(OFFICE_AMBIENT_ZONE_CAPACITY).forEach(
      ([zone, capacity]) => {
        expect(
          officeZoneCapacity(
            zone as keyof typeof OFFICE_AMBIENT_ZONE_CAPACITY,
          ),
        ).toBe(capacity)
      },
    )
  })

  it('keeps strategy planning anchors spatially separated', () => {
    const planning = [0, 1, 2].map((index) =>
      officeZonePlacement('planning-table', index).position,
    )

    expect(planning[0].distanceTo(planning[1])).toBeGreaterThan(1.5)
    expect(planning[1].distanceTo(planning[2])).toBeGreaterThan(1.5)
  })

  it('varies commons world props across office modes without changing presence truth', () => {
    const arrival = new THREE.Group()
    const night = new THREE.Group()

    createOfficeEnvironment(arrival, [], [], 'commons', 'ARRIVAL')
    createOfficeEnvironment(night, [], [], 'commons', 'NIGHT_QUIET')

    expect(arrival.children.length).toBeGreaterThan(night.children.length)
  })

  it('keeps each floor detail vocabulary isolated', () => {
    const floors = ['commons', 'build', 'strategy'] as const

    for (const floor of floors) {
      const environment = new THREE.Group()
      createOfficeEnvironment(environment, [], [], floor, 'CORE_WORK')

      const detailGroups: string[] = []
      environment.traverse((object) => {
        if (object.name.startsWith('office-floor-details-')) {
          detailGroups.push(object.name)
        }
      })

      expect(detailGroups).toEqual([`office-floor-details-${floor}`])
    }
  })

  it('renders exactly one shared lift core on every floor', () => {
    for (const floor of ['commons', 'build', 'strategy'] as const) {
      const environment = new THREE.Group()
      createOfficeEnvironment(environment, [], [], floor, 'CORE_WORK')

      const liftCores: THREE.Object3D[] = []
      environment.traverse((object) => {
        if (object.name === 'office-lift-core') liftCores.push(object)
      })

      expect(liftCores).toHaveLength(1)
    }
  })

  it('aligns specialist zones with their distinct floor spaces', () => {
    const qa = officeZonePlacement('qa-bench', 0).position
    const docs = officeZonePlacement('docs-desk', 0).position
    const architecture = officeZonePlacement('architecture-wall', 0).position
    const decision = officeZonePlacement('decision-room', 0).position

    expect(qa.x).toBeLessThan(-5)
    expect(qa.z).toBeLessThan(0)
    expect(docs.x).toBeGreaterThan(5)
    expect(docs.z).toBeLessThan(0)
    expect(architecture.x).toBeGreaterThan(2)
    expect(architecture.z).toBeLessThan(-4)
    expect(decision.x).toBeGreaterThan(5)
    expect(decision.z).toBeGreaterThan(3)
    expect(decision.z).toBeLessThan(4)
  })

  it('keeps all eight core roles on unique deterministic workstation anchors', () => {
    const positions = CORE_ROLES.map((role) => {
      const station = officeRoleStation(role)
      return `${station.position.x.toFixed(2)}:${station.position.z.toFixed(2)}`
    })

    expect(new Set(positions).size).toBe(8)
  })
})
