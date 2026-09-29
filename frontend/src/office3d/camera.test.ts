import { describe, expect, it } from 'vitest'

import { officeCameraView, officeCameraViews } from './camera'

describe('office camera presets', () => {
  it('exposes three keyboard-addressable views for every floor', () => {
    for (const floor of ['commons', 'build', 'strategy'] as const) {
      const views = officeCameraViews(floor)

      expect(views).toHaveLength(3)
      expect(views.map((view) => view.key)).toEqual([
        'overview',
        'primary',
        'secondary',
      ])
      expect(views.map((view) => view.shortcut)).toEqual(['1', '2', '3'])
      expect(new Set(views.map((view) => view.label)).size).toBe(3)
    }
  })

  it('uses floor-specific semantic destinations instead of generic camera names', () => {
    expect(officeCameraView('commons', 'primary').label).toBe('Lounge')
    expect(officeCameraView('commons', 'secondary').label).toBe('Pantry')
    expect(officeCameraView('build', 'primary').label).toBe('Engineering')
    expect(officeCameraView('build', 'secondary').label).toBe('QA / Review')
    expect(officeCameraView('strategy', 'primary').label).toBe('Planning')
    expect(officeCameraView('strategy', 'secondary').label).toBe('Meeting')
  })

  it('keeps overview framing intentionally different across floors', () => {
    const commons = officeCameraView('commons', 'overview')
    const build = officeCameraView('build', 'overview')
    const strategy = officeCameraView('strategy', 'overview')

    expect(commons.position).not.toEqual(build.position)
    expect(strategy.position).not.toEqual(build.position)
    expect(commons.target).not.toEqual(build.target)
  })

  it('keeps every preset within a bounded office camera envelope', () => {
    for (const floor of ['commons', 'build', 'strategy'] as const) {
      for (const view of officeCameraViews(floor)) {
        const [x, y, z] = view.position
        const [tx, ty, tz] = view.target

        expect(Math.abs(x)).toBeLessThanOrEqual(16)
        expect(y).toBeGreaterThanOrEqual(4)
        expect(y).toBeLessThanOrEqual(12)
        expect(Math.abs(z)).toBeLessThanOrEqual(18)
        expect(Math.abs(tx)).toBeLessThanOrEqual(9)
        expect(ty).toBeGreaterThanOrEqual(0)
        expect(ty).toBeLessThanOrEqual(2)
        expect(Math.abs(tz)).toBeLessThanOrEqual(7)
      }
    }
  })
})
