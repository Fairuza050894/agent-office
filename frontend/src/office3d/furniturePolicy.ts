import type { EngineeringPodPresentation } from './environment'
import type { OfficeDioramaPilotMode } from './dioramaDebug'
import type { OfficeFloorKey } from './livingOffice'

export interface OfficeFurniturePolicy {
  loadKit: boolean
  initialPresentation: EngineeringPodPresentation
  debugPilot: OfficeDioramaPilotMode | null
  keepPrimitiveFallbackUntilReady: boolean
}

export function officeFurniturePolicy(
  floor: OfficeFloorKey,
  debugPilot?: OfficeDioramaPilotMode,
): OfficeFurniturePolicy {
  if (floor !== 'build') {
    return {
      loadKit: false,
      initialPresentation: 'primitive',
      debugPilot: debugPilot ?? null,
      keepPrimitiveFallbackUntilReady: false,
    }
  }

  if (debugPilot === 'primitive') {
    return {
      loadKit: false,
      initialPresentation: 'primitive',
      debugPilot,
      keepPrimitiveFallbackUntilReady: false,
    }
  }

  if (debugPilot === 'kit') {
    return {
      loadKit: true,
      initialPresentation: 'kit',
      debugPilot,
      keepPrimitiveFallbackUntilReady: false,
    }
  }

  return {
    loadKit: true,
    initialPresentation: 'primitive',
    debugPilot: null,
    keepPrimitiveFallbackUntilReady: true,
  }
}
