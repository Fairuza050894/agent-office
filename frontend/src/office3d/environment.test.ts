import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { OFFICE_MAX_ACCENT_LIGHTS } from './lighting'
import { OFFICE_AMBIENT_ZONE_CAPACITY } from './livingOffice'
import {
  ENTRANCE,
  buildOfficePath,
  buildWorkspaceOfficePath,
  createOfficeEnvironment,
  engineeringPodPilotPlacements,
  incidentPosition,
  officePathHasFurnitureClearance,
  officeRoleStation,
  officeWorkspacePathHasFurnitureClearance,
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

  it('routes Workspace zone transitions around floor furniture', () => {
    const cases = [
      {
        floor: 'commons' as const,
        from: officeZonePlacement('coffee-bar', 0).position,
        to: officeZonePlacement('lounge', 0).position,
      },
      {
        floor: 'commons' as const,
        from: officeZonePlacement('lounge', 1).position,
        to: officeZonePlacement('game-corner', 0).position,
      },
      {
        floor: 'build' as const,
        from: officeZonePlacement('qa-bench', 0).position,
        to: officeZonePlacement('docs-desk', 0).position,
      },
      {
        floor: 'build' as const,
        from: officeZonePlacement('engineering-pod', 0).position,
        to: officeZonePlacement('review-wall', 0).position,
      },
      {
        floor: 'strategy' as const,
        from: officeZonePlacement('planning-table', 0).position,
        to: officeZonePlacement('architecture-wall', 0).position,
      },
      {
        floor: 'strategy' as const,
        from: officeZonePlacement('architecture-wall', 1).position,
        to: officeZonePlacement('decision-room', 0).position,
      },
    ]

    cases.forEach(({ floor, from, to }) => {
      const route = buildWorkspaceOfficePath(from, to, floor)
      expect(route.length, `${floor} route should exist`).toBeGreaterThan(0)

      const path = [from, ...route]
      expect(
        officeWorkspacePathHasFurnitureClearance(path, floor),
        `${floor} route should not cross furniture`,
      ).toBe(true)
      expect(path.at(-1)!.distanceTo(to)).toBeLessThan(0.08)
    })
  })

  it('uses distinct collision-safe Commons anchors around social furniture', () => {
    const anchors = [
      officeZonePlacement('coffee-bar', 0).position,
      officeZonePlacement('coffee-bar', 1).position,
      officeZonePlacement('pantry', 0).position,
      officeZonePlacement('pantry', 1).position,
      officeZonePlacement('lounge', 0).position,
      officeZonePlacement('lounge', 1).position,
      officeZonePlacement('game-corner', 0).position,
      officeZonePlacement('game-corner', 1).position,
    ]

    const unique = new Set(
      anchors.map((position) =>
        `${position.x.toFixed(2)}:${position.z.toFixed(2)}`,
      ),
    )
    expect(unique.size).toBe(anchors.length)
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

  it('keeps primitive and kit engineering-pod modes on identical agent stations', () => {
    const members = [
      {
        id: 'backend',
        agent_profile_key: 'backend-developer',
        zone: 'engineering-pod' as const,
        placementIndex: 0,
      },
      {
        id: 'frontend',
        agent_profile_key: 'frontend-developer',
        zone: 'engineering-pod' as const,
        placementIndex: 1,
      },
    ]

    const primitive = new THREE.Group()
    const kit = new THREE.Group()
    const primitiveStations = createOfficeEnvironment(
      primitive,
      [],
      members,
      'build',
      'CORE_WORK',
      'primitive',
    )
    const kitStations = createOfficeEnvironment(
      kit,
      [],
      members,
      'build',
      'CORE_WORK',
      'kit',
    )

    expect(
      primitive.getObjectByName('office-engineering-pod-primitive'),
    ).toBeTruthy()
    expect(
      kit.getObjectByName('office-engineering-pod-primitive'),
    ).toBeUndefined()

    for (const member of members) {
      const control = primitiveStations.get(member.id)!
      const candidate = kitStations.get(member.id)!

      expect(candidate.position.toArray()).toEqual(control.position.toArray())
      expect(candidate.yaw).toBe(control.yaw)
    }
  })

  it('exposes eight deterministic pilot furniture placements for the existing pod', () => {
    const placements = engineeringPodPilotPlacements()

    expect(placements).toHaveLength(8)
    expect(officeZoneCapacity('engineering-pod')).toBe(8)
    expect(
      new Set(
        placements.map(
          (entry) =>
            `${entry.desk.position.x.toFixed(2)}:${entry.desk.position.z.toFixed(2)}`,
        ),
      ).size,
    ).toBe(8)

    placements.forEach((entry) => {
      for (const placement of [
        entry.desk,
        entry.chair,
        entry.screen,
        entry.keyboard,
        entry.mouse,
      ]) {
        expect(placement.position.toArray().every(Number.isFinite)).toBe(true)
        expect(Number.isFinite(placement.yaw)).toBe(true)
      }
    })
  })

  it('keeps floor-specific point lights within the V1 accent budget', () => {
    const cases = [
      ['commons', 'CORE_WORK'],
      ['commons', 'NIGHT_QUIET'],
      ['build', 'CORE_WORK'],
      ['build', 'NIGHT_QUIET'],
      ['strategy', 'CORE_WORK'],
      ['strategy', 'LATE_EVENING'],
    ] as const

    for (const [floor, mode] of cases) {
      const environment = new THREE.Group()
      createOfficeEnvironment(environment, [], [], floor, mode)

      let pointLights = 0
      environment.traverse((object) => {
        if (object instanceof THREE.PointLight) pointLights += 1
      })

      expect(
        pointLights,
        `${floor}/${mode} should stay within the accent-light budget`,
      ).toBeLessThanOrEqual(OFFICE_MAX_ACCENT_LIGHTS)
    }
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

  it('renders exactly one shared lift core at the same clear building edge on every floor', () => {
    const positions: string[] = []

    for (const floor of ['commons', 'build', 'strategy'] as const) {
      const environment = new THREE.Group()
      createOfficeEnvironment(environment, [], [], floor, 'CORE_WORK')

      const liftCores: THREE.Object3D[] = []
      environment.traverse((object) => {
        if (object.name === 'office-lift-core') liftCores.push(object)
      })

      expect(liftCores).toHaveLength(1)
      expect(liftCores[0].position.x).toBeGreaterThan(7.3)
      positions.push(
        `${liftCores[0].position.x.toFixed(2)}:${liftCores[0].position.z.toFixed(2)}`,
      )
    }

    expect(new Set(positions).size).toBe(1)
  })

  it('keeps the shared lift landing clear of Commons pantry and Strategy roadmap wall', () => {
    const commons = new THREE.Group()
    createOfficeEnvironment(commons, [], [], 'commons', 'CORE_WORK')
    const commonsLift = commons.getObjectByName('office-lift-core')
    const pantry = commons.getObjectByName('office-pantry')

    expect(commonsLift).toBeTruthy()
    expect(pantry).toBeTruthy()
    expect(
      new THREE.Box3().setFromObject(commonsLift!).intersectsBox(
        new THREE.Box3().setFromObject(pantry!),
      ),
    ).toBe(false)

    const strategy = new THREE.Group()
    createOfficeEnvironment(strategy, [], [], 'strategy', 'CORE_WORK')
    const strategyLift = strategy.getObjectByName('office-lift-core')
    const roadmap = strategy.getObjectByName('office-strategy-roadmap-wall')

    expect(strategyLift).toBeTruthy()
    expect(roadmap).toBeTruthy()
    expect(
      new THREE.Box3().setFromObject(strategyLift!).intersectsBox(
        new THREE.Box3().setFromObject(roadmap!),
      ),
    ).toBe(false)
  })

  it('mounts Build focus notes vertically on the sprint board instead of floating over the floor', () => {
    const environment = new THREE.Group()
    createOfficeEnvironment(environment, [], [], 'build', 'CORE_WORK')

    const notes: THREE.Mesh[] = []
    environment.traverse((object) => {
      if (object.name === 'office-build-focus-note' && object instanceof THREE.Mesh) {
        notes.push(object)
      }
    })

    expect(notes).toHaveLength(3)
    notes.forEach((note) => {
      const geometry = note.geometry as THREE.BoxGeometry
      expect(geometry.parameters.height).toBeGreaterThan(0.15)
      expect(geometry.parameters.depth).toBeLessThan(0.05)
      expect(note.position.z).toBeLessThan(-6.6)
      expect(note.position.y).toBeGreaterThan(1)
    })
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
