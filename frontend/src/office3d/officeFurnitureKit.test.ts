import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { styleOfficeFurnitureMaterial } from './officeFurnitureKit'

function material(name: string): THREE.MeshStandardMaterial {
  const value = new THREE.MeshStandardMaterial({ color: 0xffffff })
  value.name = name
  return value
}

describe('Office Furniture Kit visual language', () => {
  it('maps desk wood and metal into the deeper Build palette', () => {
    const wood = styleOfficeFurnitureMaterial(
      'desk',
      material('wood'),
    ) as THREE.MeshStandardMaterial
    const metal = styleOfficeFurnitureMaterial(
      'desk',
      material('metal'),
    ) as THREE.MeshStandardMaterial

    expect(wood.color.getHex()).toBe(0x654936)
    expect(wood.roughness).toBeCloseTo(0.66)
    expect(wood.metalness).toBeCloseTo(0.02)
    expect(metal.color.getHex()).toBe(0x465963)
    expect(metal.roughness).toBeCloseTo(0.52)
    expect(metal.metalness).toBeCloseTo(0.26)
  })

  it('keeps chair upholstery soft and the frame more structural', () => {
    const cushion = styleOfficeFurnitureMaterial(
      'chair',
      material('carpetBlue'),
    ) as THREE.MeshStandardMaterial
    const frame = styleOfficeFurnitureMaterial(
      'chair',
      material('metal'),
    ) as THREE.MeshStandardMaterial

    expect(cushion.color.getHex()).toBe(0x344f60)
    expect(cushion.roughness).toBeCloseTo(0.88)
    expect(frame.color.getHex()).toBe(0x293942)
    expect(frame.metalness).toBeCloseTo(0.18)
  })

  it('gives the display surface controlled contrast and emissive depth', () => {
    const display = styleOfficeFurnitureMaterial(
      'screen',
      material('metal'),
    ) as THREE.MeshStandardMaterial

    expect(display.color.getHex()).toBe(0x3d91ad)
    expect(display.emissive.getHex()).toBe(0x14506a)
    expect(display.emissiveIntensity).toBeCloseTo(0.58)
    expect(display.roughness).toBeCloseTo(0.24)
  })

  it('keeps all furniture materials within a restrained reflection budget', () => {
    const samples = [
      styleOfficeFurnitureMaterial('desk', material('wood')),
      styleOfficeFurnitureMaterial('chair', material('carpetBlue')),
      styleOfficeFurnitureMaterial('screen', material('metal')),
      styleOfficeFurnitureMaterial('keyboard', material('medium')),
      styleOfficeFurnitureMaterial('mouse', material('dark')),
    ] as THREE.MeshStandardMaterial[]

    samples.forEach((sample) => {
      expect(sample.envMapIntensity).toBeLessThanOrEqual(0.55)
      expect(sample.metalness).toBeLessThanOrEqual(0.3)
    })
  })
})
