import { describe, expect, it } from 'vitest'

import { officeFurniturePolicy } from './furniturePolicy'

describe('officeFurniturePolicy', () => {
  it('rolls the accepted kit into the ordinary Build floor with a primitive loading fallback', () => {
    expect(officeFurniturePolicy('build')).toEqual({
      loadKit: true,
      initialPresentation: 'primitive',
      debugPilot: null,
      keepPrimitiveFallbackUntilReady: true,
    })
  })

  it('keeps the deterministic primitive A/B control explicit in the Diorama fixture', () => {
    expect(officeFurniturePolicy('build', 'primitive')).toEqual({
      loadKit: false,
      initialPresentation: 'primitive',
      debugPilot: 'primitive',
      keepPrimitiveFallbackUntilReady: false,
    })
  })

  it('keeps the deterministic kit A/B candidate free of the primitive fallback', () => {
    expect(officeFurniturePolicy('build', 'kit')).toEqual({
      loadKit: true,
      initialPresentation: 'kit',
      debugPilot: 'kit',
      keepPrimitiveFallbackUntilReady: false,
    })
  })

  it('does not roll Build furniture onto Commons or Strategy', () => {
    expect(officeFurniturePolicy('commons').loadKit).toBe(false)
    expect(officeFurniturePolicy('strategy').loadKit).toBe(false)
  })
})
