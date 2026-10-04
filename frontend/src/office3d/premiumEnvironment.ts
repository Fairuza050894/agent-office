import * as THREE from 'three'

import { disposeObject } from './environment'
import type { OfficeFloorKey } from './livingOffice'
import { mountPremiumCinematicDetails } from './premiumCinematicDetails'
import { mountPremiumSceneEnhancements } from './premiumSceneEnhancements'
import { mountPremiumSceneKit } from './premiumSceneKit'

export interface PremiumOfficeIdentity {
  floor: OfficeFloorKey
  label: string
  signature: 'social-hub' | 'engineering-control-room' | 'decision-studio'
  architectureGroupName: string
}

const FLOOR_IDENTITY: Record<OfficeFloorKey, PremiumOfficeIdentity> = {
  commons: {
    floor: 'commons',
    label: 'Commons / Collaboration Hub',
    signature: 'social-hub',
    architectureGroupName: 'office-premium-identity-commons',
  },
  build: {
    floor: 'build',
    label: 'Build / Engineering Control Room',
    signature: 'engineering-control-room',
    architectureGroupName: 'office-premium-identity-build',
  },
  strategy: {
    floor: 'strategy',
    label: 'Strategy / Decision Studio',
    signature: 'decision-studio',
    architectureGroupName: 'office-premium-identity-strategy',
  },
}

export function premiumOfficeIdentity(
  floor: OfficeFloorKey,
): PremiumOfficeIdentity {
  return FLOOR_IDENTITY[floor]
}

/**
 * The legacy environment module still owns canonical spatial facts such as
 * workstation coordinates, navigation routes, zone placements and collision
 * policy. `createOfficeEnvironment()` materializes those facts together with
 * the historical primitive diorama because the Three.js recovery renderer
 * still needs it.
 *
 * Production R3F must not keep rendering that historical shell underneath the
 * premium scene. By the time this function runs, R3F has already received the
 * station map returned by `createOfficeEnvironment()`, so the primitive visual
 * objects can be safely disposed while the canonical spatial data remains in
 * normal TypeScript structures. The recovery renderer is untouched because it
 * never mounts this premium layer.
 */
function replaceLegacyVisualShell(parent: THREE.Group): void {
  for (const child of [...parent.children]) {
    disposeObject(child)
    parent.remove(child)
  }
  parent.userData.visualShell = 'premium-r3f'
  parent.userData.legacyVisualShellMounted = false
}

/**
 * Presentation-only premium Office composition.
 *
 * This is a spatial replacement, not a decorative overlay. Production R3F
 * keeps canonical station/navigation/collision facts from `environment.ts`,
 * removes the historical primitive render shell, then mounts a premium spatial
 * kit plus localized cinematic detail and a small practical-light layer.
 *
 * Navigation, collision, occupancy, workflow, KPI, activity and character
 * stations remain owned by canonical environment/runtime projection code.
 */
export function mountPremiumOfficeArchitecture(
  parent: THREE.Group,
  floor: OfficeFloorKey,
): THREE.Group {
  replaceLegacyVisualShell(parent)

  const group = mountPremiumSceneKit(parent, floor)
  mountPremiumSceneEnhancements(group, floor, 'evening')
  mountPremiumCinematicDetails(group, floor)
  const identity = FLOOR_IDENTITY[floor]

  group.name = 'office-premium-architecture'
  group.userData.presentationOnly = true
  group.userData.floor = floor
  group.userData.identity = identity.signature
  group.userData.visualRevision = 'cinematic-composition-v1'
  group.userData.roomSpanningOverheadFrame = false
  group.userData.canonicalStateOwner = false
  group.userData.replacesLegacyVisualShell = true
  group.userData.localPracticalLightCount = 2
  group.userData.cinematicComposition = true

  return group
}
