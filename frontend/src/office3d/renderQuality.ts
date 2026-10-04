export type OfficeRenderQualityTier = 'premium' | 'balanced' | 'reduced'

export interface OfficeRenderQualityProfile {
  dprCap: number
  shadowMapSize: number
}

export interface OfficeFrameWindowSummary {
  sampleCount: number
  averageFrameMs: number
  slowFrameRatio: number
}

export const OFFICE_QUALITY_WARMUP_FRAMES = 90
export const OFFICE_QUALITY_SAMPLE_FRAMES = 90
export const OFFICE_QUALITY_SLOW_FRAME_MS = 25
export const OFFICE_QUALITY_MAX_SAMPLE_MS = 120

const OFFICE_RENDER_QUALITY_PROFILES: Record<
  OfficeRenderQualityTier,
  OfficeRenderQualityProfile
> = {
  premium: {
    dprCap: 1.7,
    shadowMapSize: 2048,
  },
  balanced: {
    dprCap: 1.35,
    shadowMapSize: 1024,
  },
  reduced: {
    dprCap: 1,
    shadowMapSize: 512,
  },
}

export function officeRenderQualityProfile(
  tier: OfficeRenderQualityTier,
): OfficeRenderQualityProfile {
  return OFFICE_RENDER_QUALITY_PROFILES[tier]
}

export function officeTargetDpr(
  devicePixelRatio: number,
  tier: OfficeRenderQualityTier,
): number {
  const safeDeviceDpr = Number.isFinite(devicePixelRatio)
    ? Math.max(1, devicePixelRatio)
    : 1
  return Math.min(
    safeDeviceDpr,
    officeRenderQualityProfile(tier).dprCap,
  )
}

export function officeAdaptiveQualityEnabled(search: string): boolean {
  const params = new URLSearchParams(search)
  return params.get('fixture') !== 'diorama' && params.get('quality') !== 'fixed'
}

export function officeFrameWindowSummary(
  frameTimesMs: readonly number[],
): OfficeFrameWindowSummary {
  if (frameTimesMs.length === 0) {
    return {
      sampleCount: 0,
      averageFrameMs: 0,
      slowFrameRatio: 0,
    }
  }

  let total = 0
  let slowFrames = 0
  let sampleCount = 0

  frameTimesMs.forEach((frameMs) => {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return

    const boundedFrameMs = Math.min(frameMs, OFFICE_QUALITY_MAX_SAMPLE_MS)
    total += boundedFrameMs
    sampleCount += 1
    if (boundedFrameMs >= OFFICE_QUALITY_SLOW_FRAME_MS) slowFrames += 1
  })

  if (sampleCount === 0) {
    return {
      sampleCount: 0,
      averageFrameMs: 0,
      slowFrameRatio: 0,
    }
  }

  return {
    sampleCount,
    averageFrameMs: total / sampleCount,
    slowFrameRatio: slowFrames / sampleCount,
  }
}

export function nextOfficeRenderQualityTier(
  current: OfficeRenderQualityTier,
  summary: OfficeFrameWindowSummary,
): OfficeRenderQualityTier {
  if (summary.sampleCount === 0) return current

  if (current === 'premium') {
    if (summary.averageFrameMs >= 24 || summary.slowFrameRatio >= 0.25) {
      return 'balanced'
    }
    return current
  }

  if (current === 'balanced') {
    if (summary.averageFrameMs >= 28 || summary.slowFrameRatio >= 0.35) {
      return 'reduced'
    }
    if (summary.averageFrameMs <= 17 && summary.slowFrameRatio <= 0.05) {
      return 'premium'
    }
    return current
  }

  if (summary.averageFrameMs <= 19 && summary.slowFrameRatio <= 0.1) {
    return 'balanced'
  }

  return current
}
