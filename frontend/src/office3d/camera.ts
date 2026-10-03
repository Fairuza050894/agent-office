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
  minDistance: 8.5,
  maxDistance: 22,
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
      position: [13.2, 9.4, 14.2],
      target: [0, 0.78, 0.75],
    },
    {
      key: 'primary',
      label: 'Lounge',
      shortcut: '2',
      position: [7.9, 5.85, 10.6],
      target: [-5.8, 0.82, 3.6],
    },
    {
      key: 'secondary',
      label: 'Pantry',
      shortcut: '3',
      position: [12.2, 5.35, 3.8],
      target: [6.7, 0.82, -3.7],
    },
  ],
  build: [
    {
      key: 'overview',
      label: 'Overview',
      shortcut: '1',
      position: [12.55, 9.25, 13.45],
      target: [0, 0.72, 0.45],
    },
    {
      key: 'primary',
      label: 'Engineering',
      shortcut: '2',
      position: [10.35, 6.35, 11.5],
      target: [0, 0.78, 1.2],
    },
    {
      key: 'secondary',
      label: 'QA / Review',
      shortcut: '3',
      position: [2.4, 5.45, 7.8],
      target: [-5.4, 0.85, -2.2],
    },
  ],
  strategy: [
    {
      key: 'overview',
      label: 'Overview',
      shortcut: '1',
      position: [13.0, 9.5, 14.0],
      target: [0, 0.8, 0.6],
    },
    {
      key: 'primary',
      label: 'Planning',
      shortcut: '2',
      position: [8.4, 5.9, 10.0],
      target: [0, 0.86, 0.5],
    },
    {
      key: 'secondary',
      label: 'Meeting',
      shortcut: '3',
      position: [1.8, 4.85, 2.7],
      target: [-6.8, 0.85, -3.5],
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
