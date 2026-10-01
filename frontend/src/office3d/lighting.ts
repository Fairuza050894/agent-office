export type OfficeLightingKey = 'morning' | 'day' | 'evening' | 'night'

export interface OfficeLightingProfile {
  key: OfficeLightingKey
  label: string
  background: number
  hemisphereSky: number
  hemisphereGround: number
  hemisphereIntensity: number
  keyColor: number
  keyIntensity: number
  fillColor: number
  fillIntensity: number
  exposure: number
}

const MORNING: OfficeLightingProfile = {
  key: 'morning',
  label: 'Morning light',
  background: 0x15202a,
  hemisphereSky: 0xe7f2fb,
  hemisphereGround: 0x1e2933,
  hemisphereIntensity: 2.05,
  keyColor: 0xffe8bf,
  keyIntensity: 2.55,
  fillColor: 0xa6c9e3,
  fillIntensity: 0.72,
  exposure: 1.04,
}

const DAY: OfficeLightingProfile = {
  key: 'day',
  label: 'Daylight',
  background: 0x111820,
  hemisphereSky: 0xdce9f4,
  hemisphereGround: 0x1a232d,
  hemisphereIntensity: 2,
  keyColor: 0xfff0d2,
  keyIntensity: 2.8,
  fillColor: 0x8fb8dc,
  fillIntensity: 0.8,
  exposure: 1.05,
}

const EVENING: OfficeLightingProfile = {
  key: 'evening',
  label: 'Evening light',
  background: 0x101820,
  hemisphereSky: 0xd7dde4,
  hemisphereGround: 0x211c1a,
  hemisphereIntensity: 1.58,
  keyColor: 0xffc98f,
  keyIntensity: 2.2,
  fillColor: 0x7396b6,
  fillIntensity: 0.55,
  exposure: 0.98,
}

const NIGHT: OfficeLightingProfile = {
  key: 'night',
  label: 'Night office',
  background: 0x0d151d,
  hemisphereSky: 0x9eb3c6,
  hemisphereGround: 0x1a2026,
  hemisphereIntensity: 1.32,
  keyColor: 0xffc985,
  keyIntensity: 1.88,
  fillColor: 0x668eae,
  fillIntensity: 0.52,
  exposure: 0.96,
}

export function officeLightingForHour(hour: number): OfficeLightingProfile {
  const normalized = ((Math.trunc(hour) % 24) + 24) % 24

  if (normalized >= 6 && normalized < 10) return MORNING
  if (normalized >= 10 && normalized < 17) return DAY
  if (normalized >= 17 && normalized < 20) return EVENING
  return NIGHT
}
