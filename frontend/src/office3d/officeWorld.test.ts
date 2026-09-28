import { describe, expect, it } from 'vitest'

import {
  isPlanningPresenceFresh,
  officeWorldContext,
} from './officeWorld'

describe('office world context', () => {
  it('closes ambient occupancy during weekday night quiet', () => {
    const world = officeWorldContext(new Date(2026, 8, 29, 0, 44))

    expect(world.mode).toBe('NIGHT_QUIET')
    expect(world.ambientOccupancyCap).toBe(0)
    expect(world.isOfficeOpen).toBe(false)
    expect(world.nextEventLabel).toBe('Morning arrival')
    expect(world.nextEventTimeLabel).toBe('07:00')
  })

  it('reduces occupancy progressively after core hours', () => {
    expect(
      officeWorldContext(new Date(2026, 8, 28, 19, 15)).ambientOccupancyCap,
    ).toBe(3)
    expect(
      officeWorldContext(new Date(2026, 8, 28, 20, 30)).ambientOccupancyCap,
    ).toBe(1)
    expect(
      officeWorldContext(new Date(2026, 8, 28, 22, 30)).ambientOccupancyCap,
    ).toBe(0)
  })

  it('keeps weekends quiet by default', () => {
    const world = officeWorldContext(new Date(2026, 9, 3, 11, 0))

    expect(world.dayKind).toBe('WEEKEND')
    expect(world.mode).toBe('WEEKEND_QUIET')
    expect(world.ambientOccupancyCap).toBe(0)
    expect(world.nextEventLabel).toBe('Next weekday arrival')
  })

  it('treats recent planning activity as live presence', () => {
    const now = new Date('2026-09-29T00:44:00+07:00')

    expect(
      isPlanningPresenceFresh('2026-09-29T00:35:00+07:00', now),
    ).toBe(true)
    expect(
      isPlanningPresenceFresh('2026-09-28T23:30:00+07:00', now),
    ).toBe(false)
  })

  it('allows longer live-planning freshness during core work hours', () => {
    const now = new Date(2026, 8, 28, 10, 30)

    expect(
      isPlanningPresenceFresh(new Date(2026, 8, 28, 9, 20).toISOString(), now),
    ).toBe(true)
    expect(
      isPlanningPresenceFresh(new Date(2026, 8, 28, 8, 30).toISOString(), now),
    ).toBe(false)
  })
})
