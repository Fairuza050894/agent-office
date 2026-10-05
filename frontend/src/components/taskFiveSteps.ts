import type { ResultReview, Run, VerificationStatus } from '../api'

export type FiveStepId = 'plan' | 'work' | 'verify' | 'review' | 'deliver'
export type FiveStepState = 'done' | 'current' | 'pending' | 'blocked' | 'unavailable'

export interface FiveStep {
  id: FiveStepId
  label: string
  state: FiveStepState
  detail: string
}

export interface FiveStepInput {
  runCount: number
  latestRun: Run | null
  review: ResultReview | null
  reviewUnavailable: boolean
  verification: VerificationStatus | null
  verificationUnavailable: boolean
}

function workStep(runCount: number, latestRun: Run | null): FiveStep {
  if (!latestRun) {
    return {
      id: 'work',
      label: 'Work',
      state: runCount > 0 ? 'current' : 'pending',
      detail: 'No execution Run yet',
    }
  }
  switch (latestRun.status) {
    case 'COMPLETED':
      return { id: 'work', label: 'Work', state: 'done', detail: 'Run COMPLETED' }
    case 'BLOCKED':
    case 'FAILED':
    case 'CANCELLED':
      return {
        id: 'work',
        label: 'Work',
        state: 'blocked',
        detail: `Run ${latestRun.status}`,
      }
    default:
      return {
        id: 'work',
        label: 'Work',
        state: 'current',
        detail: `Run ${latestRun.status}`,
      }
  }
}

function verifyStep(
  latestRun: Run | null,
  verification: VerificationStatus | null,
  verificationUnavailable: boolean,
): FiveStep {
  if (!latestRun) {
    return { id: 'verify', label: 'Verify', state: 'pending', detail: 'No execution Run yet' }
  }
  if (verificationUnavailable || !verification) {
    return {
      id: 'verify',
      label: 'Verify',
      state: 'unavailable',
      detail: 'Verification state unavailable',
    }
  }
  if (!verification.checked) {
    return {
      id: 'verify',
      label: 'Verify',
      state: 'pending',
      detail: 'No verification obligation declared',
    }
  }
  const required = verification.checks.filter((check) => check.required)
  const satisfiedRequired = required.filter((check) => check.satisfied).length
  if (required.length > 0 && satisfiedRequired === required.length) {
    return {
      id: 'verify',
      label: 'Verify',
      state: 'done',
      detail: `${satisfiedRequired} of ${required.length} required checks satisfied`,
    }
  }
  const observed = verification.checks.filter((check) => check.command_status !== null).length
  if (observed > 0 || verification.evidence_count > 0) {
    return {
      id: 'verify',
      label: 'Verify',
      state: 'current',
      detail: `${satisfiedRequired} of ${required.length} required checks satisfied`,
    }
  }
  return {
    id: 'verify',
    label: 'Verify',
    state: 'pending',
    detail: 'No verification evidence recorded',
  }
}

function reviewStep(review: ResultReview | null, reviewUnavailable: boolean): FiveStep {
  if (reviewUnavailable || !review) {
    return {
      id: 'review',
      label: 'Review',
      state: 'unavailable',
      detail: 'Review state unavailable',
    }
  }
  switch (review.state) {
    case 'DELIVERED':
      return { id: 'review', label: 'Review', state: 'done', detail: 'Accepted and delivered' }
    case 'AWAITING_REVIEW':
      return { id: 'review', label: 'Review', state: 'current', detail: 'Awaiting human review' }
    case 'CHANGES_REQUESTED':
      return { id: 'review', label: 'Review', state: 'current', detail: 'Changes requested' }
    case 'APPROVED':
      return { id: 'review', label: 'Review', state: 'current', detail: 'Approved, delivery pending' }
    default:
      return { id: 'review', label: 'Review', state: 'pending', detail: 'Not ready for review' }
  }
}

function deliverStep(review: ResultReview | null, reviewUnavailable: boolean): FiveStep {
  if (reviewUnavailable || !review) {
    return {
      id: 'deliver',
      label: 'Deliver',
      state: 'unavailable',
      detail: 'Delivery state unavailable',
    }
  }
  switch (review.state) {
    case 'DELIVERED':
      return {
        id: 'deliver',
        label: 'Deliver',
        state: 'done',
        detail: review.delivered_branch ? `Delivered to ${review.delivered_branch}` : 'Delivered',
      }
    case 'APPROVED':
      return { id: 'deliver', label: 'Deliver', state: 'current', detail: 'Delivery pending' }
    default:
      return { id: 'deliver', label: 'Deliver', state: 'pending', detail: 'Not delivered' }
  }
}

/**
 * Pure derivation from canonical Task execution state to the five-step view.
 * Full mapping is documented in docs/product/TARGET_UI_TASK_DETAIL_MAPPING.md.
 */
export function deriveFiveSteps(input: FiveStepInput): FiveStep[] {
  const plan: FiveStep =
    input.runCount > 0
      ? { id: 'plan', label: 'Plan', state: 'done', detail: `${input.runCount} Run(s) created` }
      : { id: 'plan', label: 'Plan', state: 'current', detail: 'Task created, no Run yet' }

  return [
    plan,
    workStep(input.runCount, input.latestRun),
    verifyStep(input.latestRun, input.verification, input.verificationUnavailable),
    reviewStep(input.review, input.reviewUnavailable),
    deliverStep(input.review, input.reviewUnavailable),
  ]
}
