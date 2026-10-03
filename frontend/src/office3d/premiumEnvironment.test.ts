import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import {
  mountPremiumOfficeArchitecture,
  premiumOfficeIdentity,
} from './premiumEnvironment'

const FLOORS = ['commons', 'build', 'strategy'] as const

describe('RC1 premium Office architecture', () => {
  it.each(FLOORS)(
    'mounts a presentation-only architecture layer for %s',
    (floor) => {
      const parent = new THREE.Group()
      const layer = mountPremiumOfficeArchitecture(parent, floor)
      const identity = premiumOfficeIdentity(floor)

      expect(layer.name).toBe('office-premium-architecture')
      expect(parent.children).toContain(layer)
      expect(layer.userData.presentationOnly).toBe(true)
      expect(layer.userData.floor).toBe(floor)
      expect(layer.userData.identity).toBe(identity.signature)
      expect(layer.getObjectByName('office-premium-command-beacon')).toBeTruthy()
      expect(layer.getObjectByName(identity.architectureGroupName)).toBeTruthy()

      let lightCount = 0
      layer.traverse((object) => {
        if (object instanceof THREE.Light) lightCount += 1
      })

      expect(lightCount).toBe(0)
    },
  )

  it('keeps a distinct spatial identity for each floor', () => {
    const identities = FLOORS.map((floor) => premiumOfficeIdentity(floor))

    expect(new Set(identities.map((identity) => identity.signature)).size).toBe(
      FLOORS.length,
    )
    expect(
      new Set(identities.map((identity) => identity.architectureGroupName)).size,
    ).toBe(FLOORS.length)
  })
})
