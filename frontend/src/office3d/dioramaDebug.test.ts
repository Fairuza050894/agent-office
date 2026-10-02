import { describe, expect, it } from 'vitest'

import {
  OFFICE_DIORAMA_DEFAULT_TIME,
  appendOfficeDioramaDebugParams,
  officeDioramaDebugConfig,
} from './dioramaDebug'

describe('Office Diorama development fixture', () => {
  it('is disabled outside development behavior', () => {
    expect(
      officeDioramaDebugConfig(
        '?fixture=diorama&debugTime=2026-10-05T01:00:00.000Z',
        false,
      ),
    ).toBeNull()
  })

  it('returns deterministic ambient members and frozen time in development', () => {
    const config = officeDioramaDebugConfig(
      '?fixture=diorama&debugTime=2026-10-05T11:30:00.000Z',
      true,
    )

    expect(config?.debugTime).toBe('2026-10-05T11:30:00.000Z')
    expect(config?.timeZone).toBe('Asia/Jakarta')
    expect(config?.members).toHaveLength(10)
    expect(new Set(config?.members.map((member) => member.floor))).toEqual(
      new Set(['commons', 'build', 'strategy']),
    )
    expect(config?.members.every((member) => member.truth === 'AMBIENT')).toBe(true)
    expect(config?.members.every((member) => member.name.startsWith('Simulated '))).toBe(true)
  })

  it('falls back to a fixed instant when debugTime is invalid', () => {
    const config = officeDioramaDebugConfig(
      '?fixture=diorama&debugTime=not-a-date',
      true,
    )

    expect(config?.debugTime).toBe(OFFICE_DIORAMA_DEFAULT_TIME)
  })

  it('preserves fixture and frozen time while changing Office floor', () => {
    const config = officeDioramaDebugConfig(
      '?fixture=diorama&debugTime=2026-10-05T04:00:00.000Z',
      true,
    )
    const params = appendOfficeDioramaDebugParams(
      new URLSearchParams('floor=build'),
      config,
    )

    expect(params.get('floor')).toBe('build')
    expect(params.get('fixture')).toBe('diorama')
    expect(params.get('debugTime')).toBe('2026-10-05T04:00:00.000Z')
  })
})
