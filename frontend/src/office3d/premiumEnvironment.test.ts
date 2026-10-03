import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { mountPremiumOfficeArchitecture } from './premiumEnvironment'

describe('RC1 premium Office architecture', () => {
  it.each(['commons', 'build', 'strategy'] as const)(
    'mounts a presentation-only architecture layer for %s',
    (floor) => {
      const parent = new THREE.Group()
      const layer = mountPremiumOfficeArchitecture(parent, floor)

      expect(layer.name).toBe('office-premium-architecture')
      expect(parent.children).toContain(layer)
      expect(layer.getObjectByName('office-premium-command-beacon')).toBeTruthy()

      let lightCount = 0
      layer.traverse((object) => {
        if (object instanceof THREE.Light) lightCount += 1
      })

      expect(lightCount).toBe(0)
    },
  )
})
