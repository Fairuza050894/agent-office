import type { ResultReview, Run, Task } from '../api'
import { columnForTask } from '../components/taskBoardProjection'

export type KpiWindow = 7 | 30 | 90

export interface AcceptedSeriesPoint {
  day: string
  accepted: number
}

export interface WindowedAcceptedMetrics {
  window: KpiWindow
  acceptedInWindow: number
  acceptedPrior: number | null
  delta: number | null
  series: AcceptedSeriesPoint[]
  acceptanceRate: number | null
  averageCompletionToDeliveryMinutes: number | null
  averageTimeToDecisionMinutes: number | null
  averageRemediationCycles: number | null
  boardPipeline: {
    planning: number
    ready: number
    running: number
    inReview: number
    needsYou: number
    accepted: number
  }
}

function timeOrNull(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

// ponytail: day buckets use the viewer's local calendar day; switch to run
// timezone when Run records carry one.
function dayKey(timestampMs: number): string {
  const date = new Date(timestampMs)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dayStartMs(timestampMs: number): number {
  const date = new Date(timestampMs)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

const DAY_MS = 24 * 60 * 60 * 1000

export function windowedAcceptedMetrics(
  runs: Run[],
  reviews: ResultReview[],
  tasks: Task[],
  window: KpiWindow,
  now: Date = new Date(),
): WindowedAcceptedMetrics {
  const delivered = reviews.filter((review) => review.state === 'DELIVERED')
  const completedById = new Map(
    runs.filter((run) => run.status === 'COMPLETED').map((run) => [run.id, run]),
  )

  const nowMs = now.getTime()
  const todayStart = dayStartMs(nowMs)
  const windowStart = todayStart - (window - 1) * DAY_MS
  const priorStart = windowStart - window * DAY_MS

  const series: AcceptedSeriesPoint[] = []
  for (let index = 0; index < window; index += 1) {
    const start = windowStart + index * DAY_MS
    series.push({ day: dayKey(start), accepted: 0 })
  }
  const seriesByDay = new Map(series.map((point) => [point.day, point]))

  let acceptedInWindow = 0
  let acceptedPrior = 0
  const completionToDelivery: number[] = []
  const decisionDurations: number[] = []
  const remediationCycles: number[] = []

  for (const review of delivered) {
    const deliveredAt = timeOrNull(review.delivered_at)
    if (deliveredAt === null) continue
    const run = completedById.get(review.run_id)
    const completedAt = run ? timeOrNull(run.completed_at) : null
    if (completedAt === null || deliveredAt < completedAt) continue


    if (deliveredAt >= windowStart && deliveredAt < todayStart + DAY_MS) {
      acceptedInWindow += 1
      const durationMinutes = (deliveredAt - completedAt) / 60_000
      decisionDurations.push(durationMinutes)
      completionToDelivery.push(durationMinutes)
      if (run) remediationCycles.push(run.remediation_cycles_used)
      const point = seriesByDay.get(dayKey(deliveredAt))
      if (point) point.accepted += 1
    } else if (deliveredAt >= priorStart && deliveredAt < windowStart) {
      acceptedPrior += 1
    }
  }

  const completedInWindow = runs.filter((run) => {
    if (run.status !== 'COMPLETED') return false
    const completedAt = timeOrNull(run.completed_at)
    return (
      completedAt !== null && completedAt >= windowStart && completedAt < todayStart + DAY_MS
    )
  })
  const deliveredInWindow = delivered.filter((review) => {
    const deliveredAt = timeOrNull(review.delivered_at)
    const run = completedById.get(review.run_id)
    const completedAt = run ? timeOrNull(run.completed_at) : null
    return (
      deliveredAt !== null &&
      completedAt !== null &&
      deliveredAt >= completedAt &&
      deliveredAt >= windowStart &&
      deliveredAt < todayStart + DAY_MS
    )
  })

  const boardPipeline = {
    planning: 0,
    ready: 0,
    running: 0,
    inReview: 0,
    needsYou: 0,
    accepted: 0,
  }
  const runsByTask = new Map<string, Run[]>()
  for (const run of runs) {
    const list = runsByTask.get(run.task_id) ?? []
    list.push(run)
    runsByTask.set(run.task_id, list)
  }
  const reviewsByRun = new Map(reviews.map((review) => [review.run_id, review]))
  for (const task of tasks) {
    const attempts = runsByTask.get(task.id) ?? []
    const latest =
      attempts.length > 0
        ? attempts.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
        : null
    const review = latest ? (reviewsByRun.get(latest.id) ?? null) : null
    const column = columnForTask({ latestRun: latest, review })
    if (column === 'Planning') boardPipeline.planning += 1
    else if (column === 'Ready') boardPipeline.ready += 1
    else if (column === 'Running') boardPipeline.running += 1
    else if (column === 'In review') boardPipeline.inReview += 1
    else if (column === 'Needs you') boardPipeline.needsYou += 1
    else boardPipeline.accepted += 1
  }

  const average = (values: number[]): number | null =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null

  return {
    window,
    acceptedInWindow,
    acceptedPrior,
    delta: acceptedInWindow - acceptedPrior,
    series,
    acceptanceRate:
      completedInWindow.length > 0
        ? (deliveredInWindow.length / completedInWindow.length) * 100
        : null,
    averageCompletionToDeliveryMinutes: average(completionToDelivery),
    averageTimeToDecisionMinutes: average(decisionDurations),
    averageRemediationCycles: average(remediationCycles),
    boardPipeline,
  }
}
