import { describe, expect, it } from 'vitest'

import {
  nextOfficeRenderQualityTier,
  officeAdaptiveQualityEnabled,
  officeFrameWindowSummary,
  officeRenderQualityProfile,
  officeTargetDpr,
} from './renderQuality'

describe('office render quality policy', () => {
  it('keeps visual acceptance fixtures deterministic', () => {
    expect(officeAdaptiveQualityEnabled('?fixture=diorama&renderer=r3f')).toBe(
      false,
    )
    expect(officeAdaptiveQualityEnabled('?quality=fixed')).toBe(false)
    expect(officeAdaptiveQualityEnabled('?floor=build')).toBe(true)
  })

  it('caps device pixel ratio without oversampling low-DPR displays', () => {
    expect(officeTargetDpr(3, 'premium')).toBe(1.7)
    expect(officeTargetDpr(2, 'balanced')).toBe(1.35)
    expect(officeTargetDpr(2, 'reduced')).toBe(1)
    expect(officeTargetDpr(1, 'premium')).toBe(1)
  })

  it('keeps each lower tier materially cheaper than the tier above it', () => {
    const premium = officeRenderQualityProfile('premium')
    const balanced = officeRenderQualityProfile('balanced')
    const reduced = officeRenderQualityProfile('reduced')

    expect(balanced.dprCap).toBeLessThan(premium.dprCap)
    expect(reduced.dprCap).toBeLessThan(balanced.dprCap)
    expect(balanced.shadowMapSize).toBeLessThan(premium.shadowMapSize)
    expect(reduced.shadowMapSize).toBeLessThan(balanced.shadowMapSize)
  })

  it('degrades one step at a time under sustained slow frames', () => {
    const pressured = officeFrameWindowSummary([
      31,
      34,
      29,
      30,
      36,
      32,
      28,
      35,
    ])

    expect(nextOfficeRenderQualityTier('premium', pressured)).toBe('balanced')
    expect(nextOfficeRenderQualityTier('balanced', pressured)).toBe('reduced')
  })

  it('recovers one step at a time only after a healthy frame window', () => {
    const healthy = officeFrameWindowSummary([
      15,
      16,
      15,
      16,
      16,
      15,
      16,
      15,
    ])

    expect(nextOfficeRenderQualityTier('reduced', healthy)).toBe('balanced')
    expect(nextOfficeRenderQualityTier('balanced', healthy)).toBe('premium')
  })

  it('uses hysteresis so borderline frame windows do not oscillate tiers', () => {
    const borderline = officeFrameWindowSummary([
      18,
      19,
      20,
      21,
      22,
      23,
      20,
      21,
    ])

    expect(nextOfficeRenderQualityTier('premium', borderline)).toBe('premium')
    expect(nextOfficeRenderQualityTier('balanced', borderline)).toBe('balanced')
    expect(nextOfficeRenderQualityTier('reduced', borderline)).toBe('reduced')
  })

  it('bounds pathological frame samples before deriving pressure', () => {
    const summary = officeFrameWindowSummary([16, 16, 1000])

    expect(summary.sampleCount).toBe(3)
    expect(summary.averageFrameMs).toBeLessThan(60)
    expect(summary.slowFrameRatio).toBeCloseTo(1 / 3)
  })
})
