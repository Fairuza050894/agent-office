import { useMemo } from 'react'

import type { Run, Task } from '../../api'
import type { OfficeWorkAssignment } from '../../office3d/livingOffice'

const WORKDAY_START_MINUTE = 9 * 60
const WORKDAY_END_MINUTE = 18 * 60
const TERMINAL_RUN_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

function localParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  return {
    dateKey: `${read('year')}-${read('month')}-${read('day')}`,
    minute: Number(read('hour')) * 60 + Number(read('minute')),
  }
}

function positionForMinute(minute: number): number {
  const span = WORKDAY_END_MINUTE - WORKDAY_START_MINUTE
  return Math.max(
    0,
    Math.min(100, ((minute - WORKDAY_START_MINUTE) / span) * 100),
  )
}

function runWindow(
  run: Run,
  now: Date,
  timeZone: string,
): { left: number; width: number } | null {
  const nowParts = localParts(now, timeZone)
  const startDate = run.started_at ?? run.created_at
  const startParts = localParts(new Date(startDate), timeZone)
  const endDate = run.completed_at
    ? new Date(run.completed_at)
    : TERMINAL_RUN_STATUSES.has(run.status.toUpperCase())
      ? new Date(run.updated_at)
      : now
  const endParts = localParts(endDate, timeZone)

  if (
    startParts.dateKey !== nowParts.dateKey &&
    endParts.dateKey !== nowParts.dateKey &&
    TERMINAL_RUN_STATUSES.has(run.status.toUpperCase())
  ) {
    return null
  }

  const startMinute =
    startParts.dateKey < nowParts.dateKey
      ? WORKDAY_START_MINUTE
      : startParts.minute
  const endMinute =
    endParts.dateKey > nowParts.dateKey
      ? WORKDAY_END_MINUTE
      : endParts.minute

  const left = positionForMinute(startMinute)
  const right = positionForMinute(endMinute)
  return {
    left,
    width: Math.max(1.5, right - left),
  }
}

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) =>
    letter.toUpperCase(),
  )
}

function runTone(status: string): string {
  switch (status.toUpperCase()) {
    case 'RUNNING':
    case 'PLANNING':
      return 'running'
    case 'WAITING':
    case 'BLOCKED':
      return 'waiting'
    case 'FAILED':
      return 'failed'
    case 'COMPLETED':
      return 'completed'
    default:
      return 'neutral'
  }
}

export interface OfficeShiftRulerProps {
  tasks: Task[]
  runs: Run[]
  assignments: OfficeWorkAssignment[]
  timeZone: string
  now?: Date
}

export function OfficeShiftRuler({
  tasks,
  runs,
  assignments,
  timeZone,
  now = new Date(),
}: OfficeShiftRulerProps) {
  const nowParts = localParts(now, timeZone)
  const nowPosition = positionForMinute(nowParts.minute)
  const taskById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  )

  const rows = useMemo(() => {
    const latestRunByTask = new Map<string, Run>()
    runs
      .slice()
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
      .forEach((run) => {
        if (!latestRunByTask.has(run.task_id)) latestRunByTask.set(run.task_id, run)
      })

    const orderedTasks = tasks
      .slice()
      .sort((left, right) => {
        const leftRun = latestRunByTask.get(left.id)
        const rightRun = latestRunByTask.get(right.id)
        if (leftRun && !rightRun) return -1
        if (!leftRun && rightRun) return 1
        return (rightRun?.updated_at ?? right.updated_at).localeCompare(
          leftRun?.updated_at ?? left.updated_at,
        )
      })
      .slice(0, 4)

    return orderedTasks.map((task) => {
      const run = latestRunByTask.get(task.id) ?? null
      const runAssignments = run
        ? assignments
            .filter((assignment) => assignment.runId === run.id)
            .slice()
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        : []
      const stageKeys = [...new Set(runAssignments.map((assignment) => assignment.stageKey))]
      const agentStates = [
        ...new Set(runAssignments.map((assignment) => assignment.agentRunStatus)),
      ]

      return {
        task,
        run,
        stageLabel:
          stageKeys.length > 0
            ? stageKeys.slice(0, 2).join(' + ')
            : run
              ? statusLabel(run.status)
              : 'No Run',
        agentStateLabel:
          agentStates.length > 0
            ? agentStates.map(statusLabel).join(' + ')
            : null,
        window: run ? runWindow(run, now, timeZone) : null,
      }
    })
  }, [assignments, now, runs, tasks, timeZone])

  const activeCount = runs.filter(
    (run) => !TERMINAL_RUN_STATUSES.has(run.status.toUpperCase()),
  ).length

  return (
    <section className="office-shift-ruler" aria-label="Office shift ruler">
      <header className="office-shift-header">
        <div>
          <strong>Shift</strong>
          <span>
            Read-only workday projection · {activeCount} active Run
            {activeCount === 1 ? '' : 's'}
          </span>
        </div>
        <span className="office-shift-now-label">
          Now · {String(Math.floor(nowParts.minute / 60)).padStart(2, '0')}:
          {String(nowParts.minute % 60).padStart(2, '0')}
        </span>
      </header>

      <div className="office-shift-grid">
        <div className="office-shift-times" aria-hidden="true">
          <span />
          {['09:00', '11:00', '13:00', '15:00', '17:00', '18:00'].map(
            (label) => (
              <span key={label}>{label}</span>
            ),
          )}
        </div>

        {rows.length === 0 ? (
          <div className="office-shift-empty">
            No canonical Task exists in this Project yet.
          </div>
        ) : (
          rows.map(({ task, run, stageLabel, agentStateLabel, window }) => (
            <div className="office-shift-row" key={task.id}>
              <div className="office-shift-task">
                <strong>{task.title}</strong>
                <span>
                  {run ? `Run ${run.id.slice(0, 8)} · ${stageLabel}` : 'No Run yet'}
                </span>
              </div>
              <div className="office-shift-track">
                <div className="office-shift-track-grid" aria-hidden="true">
                  {Array.from({ length: 5 }, (_, index) => (
                    <i key={index} />
                  ))}
                </div>
                {run && window && (
                  <span
                    className={`office-shift-run-window tone-${runTone(run.status)}`}
                    style={{
                      left: `${window.left}%`,
                      width: `${window.width}%`,
                    }}
                    title={`Run ${run.id} · ${run.status}`}
                  >
                    {statusLabel(run.status)}
                  </span>
                )}
                {run && (
                  <span
                    className={`office-shift-state tone-${runTone(run.status)}`}
                    title={agentStateLabel ?? statusLabel(run.status)}
                  >
                    {agentStateLabel ?? statusLabel(run.status)}
                  </span>
                )}
                <span
                  className="office-shift-now"
                  style={{ left: `${nowPosition}%` }}
                  aria-hidden="true"
                />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="office-shift-list" aria-label="Current task and run summary">
        {rows.map(({ task, run, stageLabel, agentStateLabel }) => (
          <article key={task.id}>
            <code>{task.id.slice(0, 8)}</code>
            <strong>{task.title}</strong>
            <span>{run ? run.id.slice(0, 8) : '—'}</span>
            <span>{stageLabel}</span>
            <span className={run ? `tone-${runTone(run.status)}` : 'tone-neutral'}>
              {agentStateLabel ?? (run ? statusLabel(run.status) : 'No Run')}
            </span>
          </article>
        ))}
      </div>

      {taskById.size > rows.length && (
        <small className="office-shift-more">
          Showing {rows.length} of {taskById.size} Tasks · open Tasks for the full registry.
        </small>
      )}
    </section>
  )
}
