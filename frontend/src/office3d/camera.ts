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
 * RC1 premium camera policy.
 *
 * The overview presets intentionally move closer than the legacy diorama angle
 * so people, furniture and command-room surfaces read as product UI rather than
 * miniature decoration. Semantic close views preserve deterministic navigation
 * while building stronger foreground / midground / background depth.
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
      position: [8.8, 5.1, 10.2],
      target: [0, 1.05, 1.3],
    },
    {
      key: 'primary',
      label: 'Lounge',
      shortcut: '2',
      position: [6.8, 4.35, 7.5],
      target: [-3.7, 1.0, 2.9],
    },
    {
      key: 'secondary',
      label: 'Pantry',
      shortcut: '3',
      position: [9.0, 4.25, 2.9],
      target: [5.45, 1.0, -3.75],
    },
  ],
  build: [
    {
      key: 'overview',
      label: 'Overview',
      shortcut: '1',
      position: [8.7, 5.0, 9.8],
      target: [0.3, 1.05, 1.0],
    },
    {
      key: 'primary',
      label: 'Engineering',
      shortcut: '2',
      position: [7.2, 4.25, 7.6],
      target: [0.4, 1.02, 1.55],
    },
    {
      key: 'secondary',
      label: 'QA / Review',
      shortcut: '3',
      position: [1.7, 4.2, 5.9],
      target: [-5.4, 0.98, -2.8],
    },
  ],
  strategy: [
    {
      key: 'overview',
      label: 'Overview',
      shortcut: '1',
      position: [8.9, 5.1, 10.0],
      target: [0, 1.05, 0.9],
    },
    {
      key: 'primary',
      label: 'Planning',
      shortcut: '2',
      position: [6.9, 4.3, 7.5],
      target: [0.1, 1.05, 0.65],
    },
    {
      key: 'secondary',
      label: 'Meeting',
      shortcut: '3',
      position: [1.3, 4.2, 2.8],
      target: [-6.2, 1.0, -3.55],
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
