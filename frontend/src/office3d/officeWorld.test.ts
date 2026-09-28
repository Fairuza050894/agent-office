import { describe, expect, it } from 'vitest'

import {
  isPlanningPresenceFresh,
  normalizeOfficeTimeZone,
  officeWorldContext,
} from './officeWorld'

const JAKARTA = 'Asia/Jakarta'

describe('office world context', () => {
  it('uses the configured office timezone instead of the host timezone', () => {
    const instant = new Date('2026-09-28T17:44:00Z')
    const world = officeWorldContext(instant, JAKARTA)

    expect(world.mode).toBe('NIGHT_QUIET')
    expect(world.ambientOccupancyCap).toBe(0)
    expect(world.isOfficeOpen).toBe(false)
    expect(world.clockLabel).toBe('00:44:00')
    expect(world.dayLabel).toContain('29')
    expect(world.timeZone).toBe(JAKARTA)
    expect(world.nextEventLabel).toBe('Morning arrival')
    expect(world.nextEventTimeLabel).toBe('07:00')
  })

  it('can produce different office modes for the same instant in different timezones', () => {
    const instant = new Date('2026-09-28T17:44:00Z')

    expect(officeWorldContext(instant, JAKARTA).mode).toBe('NIGHT_QUIET')
    expect(officeWorldContext(instant, 'America/Los_Angeles').mode).not.toBe(
      'NIGHT_QUIET',
    )
  })

  it('allows staggered arrival to reach full attendance before core hours', () => {
    const world = officeWorldContext(
      new Date('2026-09-28T01:50:00Z'),
      JAKARTA,
    )

    expect(world.mode).toBe('ARRIVAL')
    expect(world.ambientOccupancyCap).toBe(9)
  })

  it('reduces occupancy progressively after core hours', () => {
    expect(
      officeWorldContext(
        new Date('2026-09-28T12:15:00Z'),
        JAKARTA,
      ).ambientOccupancyCap,
    ).toBe(2)
    expect(
      officeWorldContext(
        new Date('2026-09-28T13:30:00Z'),
        JAKARTA,
      ).ambientOccupancyCap,
    ).toBe(1)
    expect(
      officeWorldContext(
        new Date('2026-09-28T15:30:00Z'),
        JAKARTA,
      ).ambientOccupancyCap,
    ).toBe(0)
  })

  it('keeps weekends quiet by default', () => {
    const world = officeWorldContext(
      new Date('2026-10-03T04:00:00Z'),
      JAKARTA,
    )

    expect(world.dayKind).toBe('WEEKEND')
    expect(world.mode).toBe('WEEKEND_QUIET')
    expect(world.ambientOccupancyCap).toBe(0)
    expect(world.nextEventLabel).toBe('Next weekday arrival')
  })

  it('treats only recent late-night planning activity as live presence', () => {
    const now = new Date('2026-09-28T17:44:00Z')

    expect(
      isPlanningPresenceFresh(
        '2026-09-28T17:35:00Z',
        now,
        JAKARTA,
      ),
    ).toBe(true)
    expect(
      isPlanningPresenceFresh(
        '2026-09-28T16:30:00Z',
        now,
        JAKARTA,
      ),
    ).toBe(false)
  })

  it('allows longer live-planning freshness during core work hours', () => {
    const now = new Date('2026-09-28T03:30:00Z')

    expect(
      isPlanningPresenceFresh(
        '2026-09-28T02:20:00Z',
        now,
        JAKARTA,
      ),
    ).toBe(true)
    expect(
      isPlanningPresenceFresh(
        '2026-09-28T01:30:00Z',
        now,
        JAKARTA,
      ),
    ).toBe(false)
  })

  it('falls back safely when an invalid timezone is supplied', () => {
    expect(normalizeOfficeTimeZone('Mars/Olympus_Mons')).not.toBe(
      'Mars/Olympus_Mons',
    )
  })
})
