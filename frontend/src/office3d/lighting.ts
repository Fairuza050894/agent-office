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
  background: 0x0b1721,
  hemisphereSky: 0xd6edf6,
  hemisphereGround: 0x17252c,
  hemisphereIntensity: 1.88,
  keyColor: 0xffd3a3,
  keyIntensity: 2.28,
  exposure: 1.015,
}

const DAY: OfficeLightingProfile = {
  key: 'day',
  label: 'Daylight',
  background: 0x08141d,
  hemisphereSky: 0xd3edf7,
  hemisphereGround: 0x13232c,
  hemisphereIntensity: 2.02,
  keyColor: 0xffe6c4,
  keyIntensity: 2.45,
  exposure: 1.035,
}

const EVENING: OfficeLightingProfile = {
  key: 'evening',
  label: 'Evening light',
  background: 0x09121a,
  hemisphereSky: 0xb3ccd9,
  hemisphereGround: 0x211a17,
  hemisphereIntensity: 1.68,
  keyColor: 0xe8b27f,
  keyIntensity: 1.82,
  exposure: 0.995,
}

const NIGHT: OfficeLightingProfile = {
  key: 'night',
  label: 'Night office',
  background: 0x06111a,
  hemisphereSky: 0x91b8cf,
  hemisphereGround: 0x0c171f,
  hemisphereIntensity: 1.62,
  keyColor: 0x9fc3d9,
  keyIntensity: 1.52,
  exposure: 1.005,
}

export function officeLightingForHour(hour: number): OfficeLightingProfile {
  const normalized = ((Math.trunc(hour) % 24) + 24) % 24

  if (normalized >= 6 && normalized < 10) return MORNING
  if (normalized >= 10 && normalized < 17) return DAY
  if (normalized >= 17 && normalized < 20) return EVENING
  return NIGHT
}
