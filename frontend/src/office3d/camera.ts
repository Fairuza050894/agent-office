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
  minDistance: 9.5,
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
      position: [14.4, 10.8, 16.2],
      target: [0, 0.72, 0.65],
    },
    {
      key: 'primary',
      label: 'Lounge',
      shortcut: '2',
      position: [8.6, 6.4, 12.0],
      target: [-5.8, 0.8, 3.6],
    },
    {
      key: 'secondary',
      label: 'Pantry',
      shortcut: '3',
      position: [13.2, 5.8, 4.0],
      target: [6.7, 0.78, -3.7],
    },
  ],
  build: [
    {
      key: 'overview',
      label: 'Overview',
      shortcut: '1',
      position: [13.65, 10.75, 15.2],
      target: [0, 0.68, 0.3],
    },
    {
      key: 'primary',
      label: 'Engineering',
      shortcut: '2',
      position: [11.4, 7.0, 12.8],
      target: [0, 0.72, 1.2],
    },
    {
      key: 'secondary',
      label: 'QA / Review',
      shortcut: '3',
      position: [3.0, 6.0, 8.8],
      target: [-5.4, 0.82, -2.2],
    },
  ],
  strategy: [
    {
      key: 'overview',
      label: 'Overview',
      shortcut: '1',
      position: [14.0, 10.9, 16.0],
      target: [0, 0.76, 0.55],
    },
    {
      key: 'primary',
      label: 'Planning',
      shortcut: '2',
      position: [9.2, 6.4, 11.0],
      target: [0, 0.82, 0.45],
    },
    {
      key: 'secondary',
      label: 'Meeting',
      shortcut: '3',
      position: [2.7, 5.4, 3.4],
      target: [-6.8, 0.82, -3.5],
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
