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
  background: 0x07121a,
  hemisphereSky: 0xc7dfe9,
  hemisphereGround: 0x162128,
  hemisphereIntensity: 1.72,
  keyColor: 0xf2c69b,
  keyIntensity: 2.05,
  exposure: 1.0,
}

const DAY: OfficeLightingProfile = {
  key: 'day',
  label: 'Daylight',
  background: 0x07131c,
  hemisphereSky: 0xc9e3ee,
  hemisphereGround: 0x14232b,
  hemisphereIntensity: 1.86,
  keyColor: 0xf5ddbc,
  keyIntensity: 2.22,
  exposure: 1.02,
}

const EVENING: OfficeLightingProfile = {
  key: 'evening',
  label: 'Evening light',
  background: 0x081119,
  hemisphereSky: 0xa9c2cf,
  hemisphereGround: 0x191a19,
  hemisphereIntensity: 1.58,
  keyColor: 0xdca875,
  keyIntensity: 1.7,
  exposure: 1.0,
}

const NIGHT: OfficeLightingProfile = {
  key: 'night',
  label: 'Night office',
  background: 0x050d14,
  hemisphereSky: 0x89afc4,
  hemisphereGround: 0x0b151c,
  hemisphereIntensity: 1.54,
  keyColor: 0x9bbdd0,
  keyIntensity: 1.44,
  exposure: 1.01,
}

const FLOOR_PRACTICALS: Record<
  OfficeFloorKey,
  readonly [OfficePracticalLight, OfficePracticalLight]
> = {
  commons: [
    {
      color: 0xf2c27b,
      intensity: 1.05,
      distance: 8.5,
      decay: 2,
      position: [5.4, 3.0, -3.9],
    },
    {
      color: 0x7abbd7,
      intensity: 0.72,
      distance: 9.5,
      decay: 2,
      position: [-4.9, 3.3, 3.0],
    },
  ],
  build: [
    {
      color: 0xe4b36f,
      intensity: 0.88,
      distance: 8.5,
      decay: 2,
      position: [5.4, 3.1, 4.2],
    },
    {
      color: 0x63bde0,
      intensity: 0.86,
      distance: 10.5,
      decay: 2,
      position: [-4.8, 3.5, 1.4],
    },
  ],
  strategy: [
    {
      color: 0xe1b479,
      intensity: 0.92,
      distance: 9,
      decay: 2,
      position: [0, 3.3, 1.0],
    },
    {
      color: 0x739dcc,
      intensity: 0.7,
      distance: 10,
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
  const scale = lightingKey === 'day' ? 0.72 : lightingKey === 'morning' ? 0.82 : 1
  const [warm, cool] = FLOOR_PRACTICALS[floor]

  return [
    { ...warm, intensity: warm.intensity * scale },
    { ...cool, intensity: cool.intensity * scale },
  ]
}
