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

const MORNING: OfficeLightingProfile = {
  key: 'morning',
  label: 'Morning light',
  background: 0x15202a,
  hemisphereSky: 0xe7f2fb,
  hemisphereGround: 0x1e2933,
  hemisphereIntensity: 2.0,
  keyColor: 0xffe8bf,
  keyIntensity: 2.5,
  exposure: 1.04,
}

const DAY: OfficeLightingProfile = {
  key: 'day',
  label: 'Daylight',
  background: 0x111820,
  hemisphereSky: 0xdce9f4,
  hemisphereGround: 0x1a232d,
  hemisphereIntensity: 2.1,
  keyColor: 0xfff0d2,
  keyIntensity: 2.65,
  exposure: 1.05,
}

const EVENING: OfficeLightingProfile = {
  key: 'evening',
  label: 'Evening light',
  background: 0x101820,
  hemisphereSky: 0xd7dde4,
  hemisphereGround: 0x211c1a,
  hemisphereIntensity: 1.75,
  keyColor: 0xffc98f,
  keyIntensity: 2.15,
  exposure: 1.0,
}

const NIGHT: OfficeLightingProfile = {
  key: 'night',
  label: 'Night office',
  background: 0x0d151d,
  hemisphereSky: 0xa8bdcf,
  hemisphereGround: 0x1a2026,
  hemisphereIntensity: 1.55,
  keyColor: 0xffc985,
  keyIntensity: 1.85,
  exposure: 0.99,
}

export function officeLightingForHour(hour: number): OfficeLightingProfile {
  const normalized = ((Math.trunc(hour) % 24) + 24) % 24

  if (normalized >= 6 && normalized < 10) return MORNING
  if (normalized >= 10 && normalized < 17) return DAY
  if (normalized >= 17 && normalized < 20) return EVENING
  return NIGHT
}
