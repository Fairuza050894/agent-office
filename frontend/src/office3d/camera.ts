import type { OfficeFloorKey } from './livingOffice'

export type OfficeCameraViewKey = 'overview' | 'primary' | 'secondary'

export interface OfficeCameraControlPolicy {
  enablePan: boolean
  enableRotate: boolean
  enableZoom: boolean
  minDistance: number
  maxDistance: number
}

export const OFFICE_CAMERA_CONTROL_POLICY: OfficeCameraControlPolicy = {
  enablePan: false,
  enableRotate: false,
  enableZoom: true,
  minDistance: 7.5,
  maxDistance: 18.5,
}

export interface OfficeCameraView {
  key: OfficeCameraViewKey
  label: string
  shortcut: '1' | '2' | '3'
  position: readonly [number, number, number]
  target: readonly [number, number, number]
}

/**
 * RC1 cinematic camera policy.
 *
 * Presets stay deterministic and bounded, but sit lower and closer than the
 * earlier premium pass so people and room identity read as an operating space
 * rather than a miniature diorama. Overviews trade the old high>=wide survey
 * for a Sims-iso read: foreground occlusion stays small, midground stations
 * stay legible, architectural background stays in frame. No free orbit or pan.
 */
const FLOOR_CAMERA_VIEWS: Record<
  OfficeFloorKey,
  readonly [OfficeCameraView, OfficeCameraView, OfficeCameraView]
> = {
  commons: [
    {
      key: 'overview',
      label: 'Overview',
      shortcut: '1',
      position: [7.0, 4.0, 8.0],
      target: [-0.1, 1.02, 1.35],
    },
    {
      key: 'primary',
      label: 'Lounge',
      shortcut: '2',
      position: [6.45, 4.05, 7.05],
      target: [-3.55, 1.02, 3.05],
    },
    {
      key: 'secondary',
      label: 'Pantry',
      shortcut: '3',
      position: [8.25, 4.05, 2.65],
      target: [5.25, 1.0, -3.65],
    },
  ],
  build: [
    {
      key: 'overview',
      label: 'Overview',
      shortcut: '1',
      position: [6.9, 4.0, 7.9],
      target: [0.35, 1.0, 1.15],
    },
    {
      key: 'primary',
      label: 'Engineering',
      shortcut: '2',
      position: [6.65, 4.05, 7.0],
      target: [0.45, 1.0, 1.6],
    },
    {
      key: 'secondary',
      label: 'QA / Review',
      shortcut: '3',
      position: [1.55, 4.05, 5.75],
      target: [-5.25, 1.0, -2.7],
    },
  ],
  strategy: [
    {
      key: 'overview',
      label: 'Overview',
      shortcut: '1',
      position: [7.0, 4.0, 7.9],
      target: [0, 1.02, 0.95],
    },
    {
      key: 'primary',
      label: 'Planning',
      shortcut: '2',
      position: [6.45, 4.05, 6.95],
      target: [0.1, 1.02, 0.7],
    },
    {
      key: 'secondary',
      label: 'Meeting',
      shortcut: '3',
      position: [1.25, 4.05, 2.65],
      target: [-6.0, 1.0, -3.45],
    },
  ],
}

export function officeCameraViews(
  floor: OfficeFloorKey,
): readonly [OfficeCameraView, OfficeCameraView, OfficeCameraView] {
  return FLOOR_CAMERA_VIEWS[floor]
}

export function officeCameraView(
  floor: OfficeFloorKey,
  key: OfficeCameraViewKey,
): OfficeCameraView {
  return (
    FLOOR_CAMERA_VIEWS[floor].find((candidate) => candidate.key === key) ??
    FLOOR_CAMERA_VIEWS[floor][0]
  )
}

export interface OfficeRendererViewport {
  width: number
  height: number
}

export function officeRendererViewport(
  width: number,
  height: number,
): OfficeRendererViewport {
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  }
}
