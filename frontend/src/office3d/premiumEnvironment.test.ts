import { describe, expect, it, vi } from 'vitest'
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

describe('RC1 premium Office spatial architecture', () => {
  it.each(FLOORS)(
    'mounts a presentation-only spatial scene kit for %s',
    (floor) => {
      const parent = new THREE.Group()
      const layer = mountPremiumOfficeArchitecture(parent, floor)
      const identity = premiumOfficeIdentity(floor)

      expect(layer.name).toBe('office-premium-architecture')
      expect(parent.children).toContain(layer)
      expect(parent.userData.visualShell).toBe('premium-r3f')
      expect(parent.userData.legacyVisualShellMounted).toBe(false)
      expect(layer.userData.presentationOnly).toBe(true)
      expect(layer.userData.canonicalStateOwner).toBe(false)
      expect(layer.userData.replacesLegacyVisualShell).toBe(true)
      expect(layer.userData.floor).toBe(floor)
      expect(layer.userData.identity).toBe(identity.signature)
      expect(layer.userData.visualRevision).toBe('cinematic-composition-v1')
      expect(layer.userData.cinematicComposition).toBe(true)
      expect(layer.userData.roomSpanningOverheadFrame).toBe(false)
      expect(layer.userData.localPracticalLightCount).toBe(2)
      expect(layer.getObjectByName(identity.architectureGroupName)).toBeTruthy()
      expect(layer.getObjectByName(FLOOR_RICHNESS[floor])).toBeTruthy()
      expect(layer.getObjectByName('office-premium-floor-tiles')).toBeTruthy()
      expect(layer.getObjectByName('office-premium-command-wall-display')).toBeTruthy()
      expect(layer.getObjectByName('office-premium-scene-enhancements')).toBeTruthy()
      expect(layer.getObjectByName('office-premium-cinematic-details')).toBeTruthy()
      expect(layer.getObjectByName('office-premium-command-beacon')).toBeFalsy()

      let lightCount = 0
      let pointLightCount = 0
      let renderableMeshCount = 0
      let instancedMeshCount = 0
      layer.traverse((object) => {
        if (object instanceof THREE.Light) lightCount += 1
        if (object instanceof THREE.PointLight) pointLightCount += 1
        if (object instanceof THREE.Mesh) renderableMeshCount += 1
        if (object instanceof THREE.InstancedMesh) instancedMeshCount += 1
      })

      expect(lightCount).toBe(2)
      expect(pointLightCount).toBe(2)
      expect(instancedMeshCount).toBeGreaterThanOrEqual(22)
      expect(renderableMeshCount).toBeLessThanOrEqual(28)
    },
  )

  it('disposes the legacy primitive shell before mounting premium R3F visuals', () => {
    const parent = new THREE.Group()
    const legacyMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 })
    const legacyGeometry = new THREE.BoxGeometry(1, 1, 1)
    const legacy = new THREE.Mesh(legacyGeometry, legacyMaterial)
    legacy.name = 'legacy-office-primitive'
    parent.add(legacy)

    const disposeGeometry = vi.spyOn(legacyGeometry, 'dispose')
    const disposeMaterial = vi.spyOn(legacyMaterial, 'dispose')
    const layer = mountPremiumOfficeArchitecture(parent, 'build')

    expect(parent.getObjectByName('legacy-office-primitive')).toBeUndefined()
    expect(parent.children).toEqual([layer])
    expect(disposeGeometry).toHaveBeenCalledTimes(1)
    expect(disposeMaterial).toHaveBeenCalledTimes(1)
  })

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

      expect(largestHorizontalSpan).toBeLessThanOrEqual(9)
    },
  )

  it.each(FLOORS)(
    'adds believable furniture/greenery depth without creating workflow truth for %s',
    (floor) => {
      const parent = new THREE.Group()
      const layer = mountPremiumOfficeArchitecture(parent, floor)

      const namedObjects: string[] = []
      layer.traverse((object) => namedObjects.push(object.name))

      expect(namedObjects.some((name) => name.includes('planters'))).toBe(true)
      expect(namedObjects.some((name) => name.includes('greenery'))).toBe(true)
      expect(namedObjects.some((name) => name.includes('practical-glow'))).toBe(true)
      expect(namedObjects.some((name) => name.includes('refined'))).toBe(true)
      expect(namedObjects.some((name) => name.includes('cinematic'))).toBe(true)
      expect(layer.userData.telemetry).toBeUndefined()
      expect(layer.userData.kpi).toBeUndefined()
      expect(layer.userData.activity).toBeUndefined()
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
