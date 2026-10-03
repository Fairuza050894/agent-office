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

const FLOOR_CAMERA_VIEWS: Record<
  OfficeFloorKey,
  readonly [OfficeCameraView, OfficeCameraView, OfficeCameraView]
> = {
  commons: [
    {
      key: 'overview',
      label: 'Overview',
      shortcut: '1',
      position: [10.8, 7.6, 11.8],
      target: [0, 0.95, 0.65],
    },
    {
      key: 'primary',
      label: 'Lounge',
      shortcut: '2',
      position: [6.9, 5.0, 8.6],
      target: [-4.8, 0.9, 3.5],
    },
    {
      key: 'secondary',
      label: 'Pantry',
      shortcut: '3',
      position: [10.0, 4.8, 2.8],
      target: [6.6, 0.9, -3.2],
    },
  ],
  build: [
    {
      key: 'overview',
      label: 'Overview',
      shortcut: '1',
      position: [10.4, 7.4, 11.2],
      target: [0, 0.88, 0.4],
    },
    {
      key: 'primary',
      label: 'Engineering',
      shortcut: '2',
      position: [8.4, 5.1, 9.2],
      target: [0, 0.9, 1.2],
    },
    {
      key: 'secondary',
      label: 'QA / Review',
      shortcut: '3',
      position: [1.8, 4.8, 6.6],
      target: [-5.4, 0.85, -2.2],
    },
  ],
  strategy: [
    {
      key: 'overview',
      label: 'Overview',
      shortcut: '1',
      position: [10.7, 7.5, 11.5],
      target: [0, 0.95, 0.5],
    },
    {
      key: 'primary',
      label: 'Planning',
      shortcut: '2',
      position: [7.4, 5.2, 8.8],
      target: [0, 0.95, 0.5],
    },
    {
      key: 'secondary',
      label: 'Meeting',
      shortcut: '3',
      position: [1.6, 4.6, 2.6],
      target: [-6.8, 0.9, -3.5],
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
