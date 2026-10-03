import * as THREE from 'three'

import type { OfficeFloorKey } from './livingOffice'
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
 * Presentation-only premium Office composition.
 *
 * This layer deliberately changes the spatial design system rather than adding
 * decorative neon to the legacy diorama. It may provide materials, floor
 * surfaces, glass rooms, furniture masses, planters, wall displays and
 * practical-light geometry, but it never creates canonical workflow truth.
 *
 * No THREE.Light objects are created here. Real renderer lighting remains owned
 * by R3FOfficeScene/lighting.ts. Navigation, collision, occupancy and character
 * stations remain owned by the canonical environment/runtime projection.
 */
export function mountPremiumOfficeArchitecture(
  parent: THREE.Group,
  floor: OfficeFloorKey,
): THREE.Group {
  const group = mountPremiumSceneKit(parent, floor)
  const identity = FLOOR_IDENTITY[floor]

  group.name = 'office-premium-architecture'
  group.userData.presentationOnly = true
  group.userData.floor = floor
  group.userData.identity = identity.signature
  group.userData.visualRevision = 'spatial-overhaul-v1'
  group.userData.roomSpanningOverheadFrame = false
  group.userData.canonicalStateOwner = false

  return group
}
