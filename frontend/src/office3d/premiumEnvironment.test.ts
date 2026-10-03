import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import {
  mountPremiumOfficeArchitecture,
  premiumOfficeIdentity,
} from './premiumEnvironment'

const FLOORS = ['commons', 'build', 'strategy'] as const

const FLOOR_RICHNESS = {
  commons: 'office-premium-commons-zones',
  build: 'office-premium-build-ops-bays',
  strategy: 'office-premium-strategy-forum',
} as const

describe('RC1 premium Office architecture', () => {
  it.each(FLOORS)(
    'mounts a batched presentation-only architecture layer for %s',
    (floor) => {
      const parent = new THREE.Group()
      const layer = mountPremiumOfficeArchitecture(parent, floor)
      const identity = premiumOfficeIdentity(floor)

      expect(layer.name).toBe('office-premium-architecture')
      expect(parent.children).toContain(layer)
      expect(layer.userData.presentationOnly).toBe(true)
      expect(layer.userData.floor).toBe(floor)
      expect(layer.userData.identity).toBe(identity.signature)
      expect(layer.userData.visualRevision).toBe('composition-reset-v1')
      expect(layer.userData.roomSpanningOverheadFrame).toBe(false)
      expect(layer.getObjectByName(identity.architectureGroupName)).toBeTruthy()
      expect(layer.getObjectByName(FLOOR_RICHNESS[floor])).toBeTruthy()
      expect(layer.getObjectByName('office-premium-command-beacon')).toBeFalsy()

      let lightCount = 0
      let renderableMeshCount = 0
      let instancedMeshCount = 0
      layer.traverse((object) => {
        if (object instanceof THREE.Light) lightCount += 1
        if (object instanceof THREE.Mesh) renderableMeshCount += 1
        if (object instanceof THREE.InstancedMesh) instancedMeshCount += 1
      })

      expect(lightCount).toBe(0)
      expect(instancedMeshCount).toBeGreaterThanOrEqual(9)
      expect(renderableMeshCount).toBeLessThanOrEqual(12)
    },
  )

  it.each(FLOORS)(
    'prevents room-spanning decorative beams for %s',
    (floor) => {
      const parent = new THREE.Group()
      const layer = mountPremiumOfficeArchitecture(parent, floor)
      const matrix = new THREE.Matrix4()
      const position = new THREE.Vector3()
      const quaternion = new THREE.Quaternion()
      const scale = new THREE.Vector3()
      let largestHorizontalSpan = 0

      layer.traverse((object) => {
        if (!(object instanceof THREE.InstancedMesh)) return

        for (let index = 0; index < object.count; index += 1) {
          object.getMatrixAt(index, matrix)
          matrix.decompose(position, quaternion, scale)
          largestHorizontalSpan = Math.max(
            largestHorizontalSpan,
            scale.x,
            scale.z,
          )
        }
      })

      // The room is 20 x 14. Decorative architecture must never bridge most of
      // that span again; long cross-room beams were the source of the cage look.
      expect(largestHorizontalSpan).toBeLessThanOrEqual(9)
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
