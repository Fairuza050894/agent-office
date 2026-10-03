import type { Run, Task } from '../api'

const TERMINAL_RUN_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

export interface TaskKpiRow {
  taskId: string
  title: string
  attempts: number
  latestRunId: string | null
  latestStatus: string
  cycleMinutes: number | null
  completedAt: string | null
}

export interface ProjectKpiSnapshot {
  totalTasks: number
  tasksWithRuns: number
  unstartedTasks: number
  activeRuns: number
  completedRuns: number
  failedRuns: number
  cancelledRuns: number
  runSuccessRate: number | null
  averageCompletedCycleMinutes: number | null
  totalRemediationCycles: number
  tasksWithRetries: number
  latestActivityAt: string | null
  taskRows: TaskKpiRow[]
}

function durationMinutes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null
  }
  return (endMs - startMs) / 60_000
}

function latestByUpdatedAt(runs: Run[]): Run | null {
  if (runs.length === 0) return null
  return runs
    .slice()
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0]
}

function ratioPercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return (numerator / denominator) * 100
}

export function projectKpiSnapshot(tasks: Task[], runs: Run[]): ProjectKpiSnapshot {
  const runsByTask = new Map<string, Run[]>()
  for (const run of runs) {
    const list = runsByTask.get(run.task_id) ?? []
    list.push(run)
    runsByTask.set(run.task_id, list)
  }

  const completedRuns = runs.filter((run) => run.status === 'COMPLETED')
  const failedRuns = runs.filter((run) => run.status === 'FAILED')
  const cancelledRuns = runs.filter((run) => run.status === 'CANCELLED')
  const activeRuns = runs.filter((run) => !TERMINAL_RUN_STATUSES.has(run.status))
  const decidedRuns = completedRuns.length + failedRuns.length

  const completedDurations = completedRuns
    .map((run) => durationMinutes(run.started_at, run.completed_at))
    .filter((value): value is number => value !== null)

  const taskRows = tasks
    .map((task): TaskKpiRow => {
      const attempts = runsByTask.get(task.id) ?? []
      const latest = latestByUpdatedAt(attempts)
      return {
        taskId: task.id,
        title: task.title,
        attempts: attempts.length,
        latestRunId: latest?.id ?? null,
        latestStatus: latest?.status ?? 'NOT_STARTED',
        cycleMinutes: latest
          ? durationMinutes(latest.started_at, latest.completed_at)
          : null,
        completedAt: latest?.completed_at ?? null,
      }
    })
    .sort((left, right) => {
      const leftActive = left.latestStatus === 'NOT_STARTED' ? 0 : 1
      const rightActive = right.latestStatus === 'NOT_STARTED' ? 0 : 1
      return rightActive - leftActive || left.title.localeCompare(right.title)
    })

  const tasksWithRuns = taskRows.filter((row) => row.attempts > 0).length
  const latestActivityAt = [
    ...tasks.map((task) => task.updated_at),
    ...runs.map((run) => run.updated_at),
  ]
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left))[0] ?? null

  return {
    totalTasks: tasks.length,
    tasksWithRuns,
    unstartedTasks: tasks.length - tasksWithRuns,
    activeRuns: activeRuns.length,
    completedRuns: completedRuns.length,
    failedRuns: failedRuns.length,
    cancelledRuns: cancelledRuns.length,
    runSuccessRate: ratioPercent(completedRuns.length, decidedRuns),
    averageCompletedCycleMinutes:
      completedDurations.length > 0
        ? completedDurations.reduce((sum, value) => sum + value, 0) /
          completedDurations.length
        : null,
    totalRemediationCycles: runs.reduce(
      (sum, run) => sum + run.remediation_cycles_used,
      0,
    ),
    tasksWithRetries: taskRows.filter((row) => row.attempts > 1).length,
    latestActivityAt,
    taskRows,
  }
}
