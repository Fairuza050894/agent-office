import type { OfficeFloorKey } from './livingOffice'

export type OfficeLightingKey = 'morning' | 'day' | 'evening' | 'night'

export const OFFICE_MAX_ACCENT_LIGHTS = 3

export interface OfficeLightingProfile {
  key: OfficeLightingKey
  label: string
  background: number
  hemisphereSky: number
  hemisphereGround: number
  hemisphereIntensity: number
  keyColor: number
  keyIntensity: number
  exposure: number
}

export interface OfficePracticalLight {
  color: number
  intensity: number
  distance: number
  decay: number
  position: readonly [number, number, number]
}

const MORNING: OfficeLightingProfile = {
  key: 'morning',
  label: 'Morning light',
  background: 0x0e202c,
  hemisphereSky: 0xd7ebf2,
  hemisphereGround: 0x2a3a44,
  hemisphereIntensity: 2.35,
  keyColor: 0xf7cfa7,
  keyIntensity: 2.62,
  exposure: 1.2,
}

const DAY: OfficeLightingProfile = {
  key: 'day',
  label: 'Daylight',
  background: 0x10242f,
  hemisphereSky: 0xe0f1f6,
  hemisphereGround: 0x2e404a,
  hemisphereIntensity: 2.55,
  keyColor: 0xffe4bf,
  keyIntensity: 2.9,
  exposure: 1.25,
}

const EVENING: OfficeLightingProfile = {
  key: 'evening',
  label: 'Evening light',
  background: 0x0d1a24,
  hemisphereSky: 0xc0d3dc,
  hemisphereGround: 0x2c2822,
  hemisphereIntensity: 2.08,
  keyColor: 0xe6b37f,
  keyIntensity: 2.3,
  exposure: 1.16,
}

const NIGHT: OfficeLightingProfile = {
  key: 'night',
  label: 'Night office',
  background: 0x0a1720,
  hemisphereSky: 0xa6c5d6,
  hemisphereGround: 0x1e2c34,
  hemisphereIntensity: 1.95,
  keyColor: 0xa9c8d9,
  keyIntensity: 1.98,
  exposure: 1.12,
}

const FLOOR_PRACTICALS: Record<
  OfficeFloorKey,
  readonly [OfficePracticalLight, OfficePracticalLight]
> = {
  commons: [
    {
      color: 0xf4c77f,
      intensity: 1.24,
      distance: 9.5,
      decay: 2,
      position: [5.4, 3.0, -3.9],
    },
    {
      color: 0x83c9e6,
      intensity: 0.9,
      distance: 10.5,
      decay: 2,
      position: [-4.9, 3.3, 3.0],
    },
  ],
  build: [
    {
      color: 0xe9b975,
      intensity: 1.08,
      distance: 9.5,
      decay: 2,
      position: [5.4, 3.1, 4.2],
    },
    {
      color: 0x71c8ea,
      intensity: 1.04,
      distance: 10.5,
      decay: 2,
      position: [-4.8, 3.5, 1.4],
    },
  ],
  strategy: [
    {
      color: 0xe6bb82,
      intensity: 1.12,
      distance: 9.5,
      decay: 2,
      position: [0, 3.3, 1.0],
    },
    {
      color: 0x82afe0,
      intensity: 0.88,
      distance: 10.5,
      decay: 2,
      position: [-5.8, 3.4, -3.2],
    },
  ],
}

export function officeLightingForHour(hour: number): OfficeLightingProfile {
  const normalized = ((Math.trunc(hour) % 24) + 24) % 24

  if (normalized >= 6 && normalized < 10) return MORNING
  if (normalized >= 10 && normalized < 17) return DAY
  if (normalized >= 17 && normalized < 20) return EVENING
  return NIGHT
}

export function officePracticalLights(
  floor: OfficeFloorKey,
  lightingKey: OfficeLightingKey,
): readonly [OfficePracticalLight, OfficePracticalLight] {
  const scale =
    lightingKey === 'day'
      ? 0.72
      : lightingKey === 'morning'
        ? 0.86
        : lightingKey === 'evening'
          ? 1.04
          : 1.16
  const [warm, cool] = FLOOR_PRACTICALS[floor]

  return [
    { ...warm, intensity: warm.intensity * scale },
    { ...cool, intensity: cool.intensity * scale },
  ]
}
