import { describe, expect, it } from 'vitest'

import { OFFICE_AMBIENT_ZONE_CAPACITY } from './livingOffice'
import {
  ENTRANCE,
  buildOfficePath,
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

  it('keeps all eight core roles on unique deterministic workstation anchors', () => {
    const positions = CORE_ROLES.map((role) => {
      const station = officeRoleStation(role)
      return `${station.position.x.toFixed(2)}:${station.position.z.toFixed(2)}`
    })

    expect(new Set(positions).size).toBe(8)
  })
})
