import type { ResultReview, Run } from '../api'

export type BoardColumn =
  | 'Planning'
  | 'Ready'
  | 'Running'
  | 'In review'
  | 'Needs you'
  | 'Accepted'

/**
 * Single projection from canonical Task execution state to a Board column.
 * Task has no status field, so every surface (Board, Task Detail summary)
 * derives the same column from the latest Run + ResultReview. No new
 * lifecycle is invented; see docs/product/TARGET_UI_TASK_DETAIL_MAPPING.md.
 */
export function columnForTask(args: {
  latestRun: Run | null
  review: ResultReview | null
}): BoardColumn {
  const run = args.latestRun
  if (!run) return 'Planning'
  if (args.review?.state === 'DELIVERED') return 'Accepted'
  if (args.review?.state === 'AWAITING_REVIEW') return 'Needs you'
  if (run.status === 'BLOCKED' || run.status === 'FAILED') return 'Needs you'
  if (run.status === 'CREATED' || run.status === 'READY') return 'Ready'
  if (['REVIEWING', 'VERIFYING', 'REMEDIATING', 'COMPLETED'].includes(run.status)) {
    return 'In review'
  }
  if (['PLANNING', 'RUNNING'].includes(run.status)) return 'Running'
  return 'Planning'
}
