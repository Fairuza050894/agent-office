import { describe, expect, it } from 'vitest'

import {
  OFFICE_MAX_ACCENT_LIGHTS,
  officeLightingForHour,
} from './lighting'

describe('officeLightingForHour', () => {
  it('uses readable morning, day, evening, and night profiles', () => {
    expect(officeLightingForHour(7).key).toBe('morning')
    expect(officeLightingForHour(12).key).toBe('day')
    expect(officeLightingForHour(18).key).toBe('evening')
    expect(officeLightingForHour(23).key).toBe('night')
  })

  it('keeps the accent-light budget intentionally small', () => {
    expect(OFFICE_MAX_ACCENT_LIGHTS).toBe(3)
  })

  it('keeps night readable without flattening the day and night distinction', () => {
    const day = officeLightingForHour(12)
    const night = officeLightingForHour(23)

    expect(night.hemisphereIntensity).toBeGreaterThanOrEqual(1.5)
    expect(night.exposure).toBeGreaterThanOrEqual(0.98)
    expect(night.hemisphereIntensity).toBeLessThan(day.hemisphereIntensity)
    expect(night.keyIntensity).toBeLessThan(day.keyIntensity)
    expect(night.exposure).toBeLessThan(day.exposure)
  })

  it('keeps a cool architectural ambience with a warm key light', () => {
    const day = officeLightingForHour(12)
    const evening = officeLightingForHour(18)

    expect(day.hemisphereSky).not.toBe(day.keyColor)
    expect(evening.hemisphereSky).not.toBe(evening.keyColor)
    expect(day.background).toBeLessThan(day.hemisphereSky)
    expect(evening.background).toBeLessThan(evening.hemisphereSky)
  })

  it('uses one key-light profile without a second global fill channel', () => {
    const day = officeLightingForHour(12)

    expect('fillColor' in day).toBe(false)
    expect('fillIntensity' in day).toBe(false)
  })

  it('normalizes out-of-range hours deterministically', () => {
    expect(officeLightingForHour(25).key).toBe(officeLightingForHour(1).key)
    expect(officeLightingForHour(-1).key).toBe(officeLightingForHour(23).key)
  })

  it('keeps night lighting dimmer than daylight', () => {
    const day = officeLightingForHour(12)
    const night = officeLightingForHour(23)

    expect(night.hemisphereIntensity).toBeLessThan(day.hemisphereIntensity)
    expect(night.keyIntensity).toBeLessThan(day.keyIntensity)
    expect(night.exposure).toBeLessThan(day.exposure)
  })
})
