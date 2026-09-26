import { describe, expect, it } from 'vitest'

import { officeCharacterVariant } from './character'

describe('officeCharacterVariant', () => {
  it('maps core roles to stable, clothed office variants', () => {
    expect(officeCharacterVariant('architect')).toBe('suit')
    expect(officeCharacterVariant('explorer')).toBe('hoodie')
    expect(officeCharacterVariant('backend-developer')).toBe('casual')
    expect(officeCharacterVariant('frontend-developer')).toBe('smart')
    expect(officeCharacterVariant('qa-reviewer')).toBe('dress')
    expect(officeCharacterVariant('security-reviewer')).toBe('suit')
    expect(officeCharacterVariant('verifier')).toBe('casual')
    expect(officeCharacterVariant('documentation-writer')).toBe('dress')
  })

  it('keeps unknown-role fallback deterministic', () => {
    const first = officeCharacterVariant('future-specialist')
    const second = officeCharacterVariant('future-specialist')

    expect(second).toBe(first)
    expect(['suit', 'casual', 'hoodie', 'dress', 'smart']).toContain(first)
  })
})
