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
  background: 0x121d27,
  hemisphereSky: 0xe6f1f8,
  hemisphereGround: 0x20282d,
  hemisphereIntensity: 1.9,
  keyColor: 0xffddb0,
  keyIntensity: 2.35,
  exposure: 1.02,
}

const DAY: OfficeLightingProfile = {
  key: 'day',
  label: 'Daylight',
  background: 0x0f171f,
  hemisphereSky: 0xdce9f2,
  hemisphereGround: 0x18232b,
  hemisphereIntensity: 2.05,
  keyColor: 0xffefd0,
  keyIntensity: 2.5,
  exposure: 1.035,
}

const EVENING: OfficeLightingProfile = {
  key: 'evening',
  label: 'Evening light',
  background: 0x10171d,
  hemisphereSky: 0xcad4dd,
  hemisphereGround: 0x241d19,
  hemisphereIntensity: 1.7,
  keyColor: 0xffbd78,
  keyIntensity: 2.0,
  exposure: 0.995,
}

const NIGHT: OfficeLightingProfile = {
  key: 'night',
  label: 'Night office',
  background: 0x09131c,
  hemisphereSky: 0x9cb3c7,
  hemisphereGround: 0x171f25,
  hemisphereIntensity: 1.5,
  keyColor: 0xffba74,
  keyIntensity: 1.72,
  exposure: 0.98,
}

export function officeLightingForHour(hour: number): OfficeLightingProfile {
  const normalized = ((Math.trunc(hour) % 24) + 24) % 24

  if (normalized >= 6 && normalized < 10) return MORNING
  if (normalized >= 10 && normalized < 17) return DAY
  if (normalized >= 17 && normalized < 20) return EVENING
  return NIGHT
}
