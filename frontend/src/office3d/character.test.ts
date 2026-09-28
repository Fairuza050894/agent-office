import { describe, expect, it } from 'vitest'

import {
  officeCharacterAppearance,
  officeCharacterVariant,
  shouldShowOfficeNameplate,
} from './character'

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

describe('officeCharacterAppearance', () => {
  it('gives all eight core roles a deterministic unique visual identity', () => {
    const appearances = CORE_ROLES.map((role) => officeCharacterAppearance(role))

    expect(new Set(appearances.map((appearance) => appearance.id)).size).toBe(8)
    expect(new Set(appearances.map((appearance) => appearance.accent)).size).toBe(8)
    expect(officeCharacterVariant('architect')).toBe('suit')
    expect(officeCharacterVariant('security-reviewer')).toBe('suit')
    expect(officeCharacterAppearance('architect').id).not.toBe(
      officeCharacterAppearance('security-reviewer').id,
    )
  })

  it('declutters completed nameplates while keeping active and selected roles visible', () => {
    expect(shouldShowOfficeNameplate('COMPLETED', false)).toBe(false)
    expect(shouldShowOfficeNameplate('PENDING', false)).toBe(false)
    expect(shouldShowOfficeNameplate('AVAILABLE', false)).toBe(false)
    expect(shouldShowOfficeNameplate('RUNNING', false)).toBe(true)
    expect(shouldShowOfficeNameplate('STARTING', false)).toBe(true)
    expect(shouldShowOfficeNameplate('WAITING', false)).toBe(true)
    expect(shouldShowOfficeNameplate('BLOCKED', false)).toBe(true)
    expect(shouldShowOfficeNameplate('FAILED', false)).toBe(true)
    expect(shouldShowOfficeNameplate('COMPLETED', true)).toBe(true)
  })

  it('keeps unknown-role fallback deterministic', () => {
    const first = officeCharacterAppearance('future-specialist')
    const second = officeCharacterAppearance('future-specialist')

    expect(second).toEqual(first)
    expect(['suit', 'casual', 'hoodie', 'dress', 'smart']).toContain(first.variant)
  })
})
