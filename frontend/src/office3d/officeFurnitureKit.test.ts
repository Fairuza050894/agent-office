import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { styleOfficeFurnitureMaterial } from './officeFurnitureKit'

function material(name: string): THREE.MeshStandardMaterial {
  const value = new THREE.MeshStandardMaterial({ color: 0xffffff })
  value.name = name
  return value
}

describe('Office Furniture Kit visual language', () => {
  it('maps Kenney desk wood and metal into the Build palette', () => {
    const wood = styleOfficeFurnitureMaterial('desk', material('wood'))
    const metal = styleOfficeFurnitureMaterial('desk', material('metal'))

    expect((wood as THREE.MeshStandardMaterial).color.getHex()).toBe(0x73533d)
    expect((metal as THREE.MeshStandardMaterial).color.getHex()).toBe(0x52636d)
  })

  it('maps the chair cushion to muted slate rather than raw bright blue', () => {
    const cushion = styleOfficeFurnitureMaterial(
      'chair',
      material('carpetBlue'),
    )

    expect((cushion as THREE.MeshStandardMaterial).color.getHex()).toBe(
      0x3d5d70,
    )
  })

  it('gives the display surface a restrained cyan emissive treatment', () => {
    const display = styleOfficeFurnitureMaterial(
      'screen',
      material('metal'),
    ) as THREE.MeshStandardMaterial

    expect(display.color.getHex()).toBe(0x3f91ad)
    expect(display.emissive.getHex()).toBe(0x17485d)
    expect(display.emissiveIntensity).toBeCloseTo(0.42)
  })
})
