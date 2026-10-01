import { describe, expect, it } from 'vitest'

import { officeLightingForHour } from './lighting'

describe('officeLightingForHour', () => {
  it('uses readable morning, day, evening, and night profiles', () => {
    expect(officeLightingForHour(7).key).toBe('morning')
    expect(officeLightingForHour(12).key).toBe('day')
    expect(officeLightingForHour(18).key).toBe('evening')
    expect(officeLightingForHour(23).key).toBe('night')
  })

  it('keeps night readable without flattening the day and night distinction', () => {
    const day = officeLightingForHour(12)
    const night = officeLightingForHour(23)

    expect(night.hemisphereIntensity).toBeGreaterThanOrEqual(1.2)
    expect(night.fillIntensity).toBeGreaterThanOrEqual(0.45)
    expect(night.exposure).toBeGreaterThanOrEqual(0.94)
    expect(night.hemisphereIntensity).toBeLessThan(day.hemisphereIntensity)
    expect(night.keyIntensity).toBeLessThan(day.keyIntensity)
    expect(night.exposure).toBeLessThan(day.exposure)
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
