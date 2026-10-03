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
 * RC1 spatial-overhaul camera policy.
 *
 * The legacy diorama used a high, distant isometric angle that made furniture
 * and characters read like tiny blocks. These presets intentionally lower the
 * eye line and aim through the room so architecture, furniture and people form
 * layered foreground/midground/background compositions closer to a premium
 * control-room product while retaining deterministic snap views.
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
      position: [10.2, 5.9, 11.8],
      target: [0, 1.0, 1.1],
    },
    {
      key: 'primary',
      label: 'Lounge',
      shortcut: '2',
      position: [7.6, 4.6, 8.8],
      target: [-3.8, 0.92, 2.9],
    },
    {
      key: 'secondary',
      label: 'Pantry',
      shortcut: '3',
      position: [10.3, 4.5, 3.8],
      target: [5.5, 0.95, -3.9],
    },
  ],
  build: [
    {
      key: 'overview',
      label: 'Overview',
      shortcut: '1',
      position: [10.0, 5.7, 11.3],
      target: [0, 0.95, 0.8],
    },
    {
      key: 'primary',
      label: 'Engineering',
      shortcut: '2',
      position: [8.3, 4.7, 8.9],
      target: [0.2, 0.98, 1.45],
    },
    {
      key: 'secondary',
      label: 'QA / Review',
      shortcut: '3',
      position: [2.4, 4.5, 7.0],
      target: [-5.5, 0.92, -2.9],
    },
  ],
  strategy: [
    {
      key: 'overview',
      label: 'Overview',
      shortcut: '1',
      position: [10.3, 5.8, 11.7],
      target: [0, 1.0, 0.8],
    },
    {
      key: 'primary',
      label: 'Planning',
      shortcut: '2',
      position: [7.8, 4.7, 8.7],
      target: [0.1, 1.0, 0.65],
    },
    {
      key: 'secondary',
      label: 'Meeting',
      shortcut: '3',
      position: [2.0, 4.5, 3.4],
      target: [-6.4, 0.95, -3.6],
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
