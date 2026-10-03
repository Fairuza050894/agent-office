import type { ResultReview, Run } from '../api'

export type ResultReviewWithDecisionTimes = ResultReview & {
  changes_requested_at?: string | null
  approved_at?: string | null
  delivered_at?: string | null
}

export interface AcceptedChangeMetrics {
  acceptedChanges: number
  acceptedChangesLast7Days: number
  acceptanceRate: number | null
  averageAcceptanceMinutes: number | null
}

function validTime(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

export function acceptedChangeMetrics(
  runs: Run[],
  reviews: ResultReviewWithDecisionTimes[],
  now: Date = new Date(),
): AcceptedChangeMetrics {
  const completedRuns = runs.filter((run) => run.status === 'COMPLETED')
  const delivered = reviews.filter((review) => review.state === 'DELIVERED')
  const deliveredByRun = new Map(delivered.map((review) => [review.run_id, review]))
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000

  const acceptedChangesLast7Days = delivered.filter((review) => {
    const deliveredAt = validTime(review.delivered_at)
    return deliveredAt !== null && deliveredAt >= sevenDaysAgo && deliveredAt <= now.getTime()
  }).length

  const acceptanceDurations = completedRuns
    .map((run) => {
      const completedAt = validTime(run.completed_at)
      const deliveredAt = validTime(deliveredByRun.get(run.id)?.delivered_at)
      if (completedAt === null || deliveredAt === null || deliveredAt < completedAt) return null
      return (deliveredAt - completedAt) / 60_000
    })
    .filter((value): value is number => value !== null)

  return {
    acceptedChanges: delivered.length,
    acceptedChangesLast7Days,
    acceptanceRate:
      completedRuns.length > 0 ? (delivered.length / completedRuns.length) * 100 : null,
    averageAcceptanceMinutes:
      acceptanceDurations.length > 0
        ? acceptanceDurations.reduce((sum, value) => sum + value, 0) / acceptanceDurations.length
        : null,
  }
}
