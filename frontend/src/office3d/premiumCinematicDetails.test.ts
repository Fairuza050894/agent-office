import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { mountPremiumCinematicDetails } from './premiumCinematicDetails'

const FLOORS = ['commons', 'build', 'strategy'] as const

describe('RC1 cinematic Office details', () => {
  it.each(FLOORS)('keeps %s details presentation-only and truth-neutral', (floor) => {
    const parent = new THREE.Group()
    const layer = mountPremiumCinematicDetails(parent, floor)

    expect(layer.name).toBe('office-premium-cinematic-details')
    expect(parent.children).toContain(layer)
    expect(layer.userData.presentationOnly).toBe(true)
    expect(layer.userData.canonicalStateOwner).toBe(false)
    expect(layer.userData.floor).toBe(floor)
    expect(layer.userData.visualRevision).toBe('cinematic-composition-v1')
    expect(layer.userData.telemetry).toBeUndefined()
    expect(layer.userData.kpi).toBeUndefined()
    expect(layer.userData.activity).toBeUndefined()
  })

  it.each(FLOORS)('uses two instanced draw groups and no lights for %s', (floor) => {
    const layer = mountPremiumCinematicDetails(new THREE.Group(), floor)
    let instanced = 0
    let lights = 0

    layer.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) instanced += 1
      if (object instanceof THREE.Light) lights += 1
    })

    expect(instanced).toBe(2)
    expect(lights).toBe(0)
    expect(layer.getObjectByName(`office-premium-cinematic-${floor}-shell`)).toBeTruthy()
    expect(layer.getObjectByName(`office-premium-cinematic-${floor}-glow`)).toBeTruthy()
  })

  it.each(FLOORS)('keeps localized geometry below room-spanning scale for %s', (floor) => {
    const layer = mountPremiumCinematicDetails(new THREE.Group(), floor)
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
        largestHorizontalSpan = Math.max(largestHorizontalSpan, scale.x, scale.z)
      }
    })

    expect(largestHorizontalSpan).toBeLessThan(9)
  })
})
