import type { OfficeCameraViewKey } from './camera'
import type { OfficeFloorKey, OfficeZoneKey } from './livingOffice'

export interface OfficeZoneNavigatorEntry {
  key: string
  label: string
  floor: OfficeFloorKey
  view: OfficeCameraViewKey
  zone: OfficeZoneKey
  hint: string
}

/**
 * U7 zone navigator targets.
 *
 * Eight zones only — no Design zone until a real zone exists. Each entry maps
 * to the canonical floor that materializes the zone plus the nearest bounded
 * camera preset. Clicking a zone only moves/focuses the camera; several
 * commons zones share the overview preset and re-snap on click.
 */
export const OFFICE_ZONE_NAVIGATOR: readonly OfficeZoneNavigatorEntry[] = [
  {
    key: 'reception',
    label: 'Reception',
    floor: 'commons',
    view: 'overview',
    zone: 'entrance',
    hint: 'Commons · entrance',
  },
  {
    key: 'engineering',
    label: 'Engineering',
    floor: 'build',
    view: 'primary',
    zone: 'engineering-pod',
    hint: 'Build · engineering pod',
  },
  {
    key: 'qa',
    label: 'QA',
    floor: 'build',
    view: 'secondary',
    zone: 'qa-bench',
    hint: 'Build · QA bench',
  },
  {
    key: 'strategy',
    label: 'Planning',
    floor: 'strategy',
    view: 'primary',
    zone: 'planning-table',
    hint: 'Strategy · planning table',
  },
  {
    key: 'focus-rooms',
    label: 'Focus Rooms',
    floor: 'commons',
    view: 'overview',
    zone: 'quiet-room',
    hint: 'Commons · quiet room',
  },
  {
    key: 'game-room',
    label: 'Game Room',
    floor: 'commons',
    view: 'overview',
    zone: 'game-corner',
    hint: 'Commons · game corner',
  },
  {
    key: 'pantry',
    label: 'Pantry',
    floor: 'commons',
    view: 'secondary',
    zone: 'pantry',
    hint: 'Commons · pantry',
  },
  {
    key: 'lounge',
    label: 'Lounge',
    floor: 'commons',
    view: 'primary',
    zone: 'lounge',
    hint: 'Commons · lounge',
  },
]

export function officeZoneNavigatorEntry(
  key: string,
): OfficeZoneNavigatorEntry | null {
  return OFFICE_ZONE_NAVIGATOR.find((entry) => entry.key === key) ?? null
}
