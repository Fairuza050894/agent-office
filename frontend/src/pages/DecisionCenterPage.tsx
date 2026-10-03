import { useEffect, useMemo, useState } from 'react'

import { api, type Project, type ResultReview, type Run, type Task } from '../api'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { Link } from '../router/Link'

export type DecisionCenterMode = 'inbox' | 'board'

interface DecisionTask {
  project: Project
  task: Task
  latestRun: Run | null
  review: ResultReview | null
}

type BoardColumn = 'Planning' | 'Ready' | 'Running' | 'In review' | 'Needs you' | 'Accepted'

const BOARD_COLUMNS: BoardColumn[] = [
  'Planning',
  'Ready',
  'Running',
  'In review',
  'Needs you',
  'Accepted',
]

function latestRun(runs: Run[]): Run | null {
  if (runs.length === 0) return null
  return runs.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
}

function columnFor(item: DecisionTask): BoardColumn {
  const run = item.latestRun
  if (!run) return 'Planning'
  if (item.review?.state === 'DELIVERED') return 'Accepted'
  if (item.review?.state === 'AWAITING_REVIEW') return 'Needs you'
  if (run.status === 'BLOCKED' || run.status === 'FAILED') return 'Needs you'
  if (run.status === 'CREATED' || run.status === 'READY') return 'Ready'
  if (['REVIEWING', 'VERIFYING', 'REMEDIATING', 'COMPLETED'].includes(run.status)) {
    return 'In review'
  }
  if (['PLANNING', 'RUNNING'].includes(run.status)) return 'Running'
  return 'Planning'
}

function decisionText(item: DecisionTask): string | null {
  const run = item.latestRun
  if (!run) return null
  if (item.review?.state === 'AWAITING_REVIEW') return 'Review and accept the completed result'
  if (run.status === 'BLOCKED') return 'Resolve a blocked execution decision'
  if (run.status === 'FAILED') return 'Inspect the failed Run and decide the next attempt'
  if (run.status === 'CREATED' || run.status === 'READY') return 'Start execution when ready'
  return null
}

export function DecisionCenterPage({ mode }: { mode: DecisionCenterMode }) {
  const [items, setItems] = useState<DecisionTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const projects = await api.listProjects()
        const activeProjects = projects.filter((project) => project.status === 'ACTIVE')
        const taskGroups = await Promise.all(
          activeProjects.map(async (project) => ({
            project,
            tasks: await api.listTasks(project.id),
          })),
        )

        const loaded = await Promise.all(
          taskGroups.flatMap(({ project, tasks }) =>
            tasks.map(async (task): Promise<DecisionTask> => {
              const runs = await api.listRuns(task.id)
              const latest = latestRun(runs)
              let review: ResultReview | null = null
              if (latest?.status === 'COMPLETED') {
                try {
                  review = await api.getResultReview(latest.id)
                } catch {
                  review = null
                }
              }
              return { project, task, latestRun: latest, review }
            }),
          ),
        )

        if (!active) return
        setItems(loaded)
        setError(null)
      } catch (reason) {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'Decision Center is unavailable.')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void Promise.resolve().then(load)
    return () => {
      active = false
    }
  }, [])

  const inbox = useMemo(
    () => items.filter((item) => decisionText(item) !== null),
    [items],
  )

  if (isLoading) {
    return (
      <div className="page-view">
        <PageHeader
          title={mode === 'inbox' ? 'Inbox' : 'Task Board'}
          description="Loading canonical Task and Run decisions..."
        />
        <div className="status-feedback" role="status">
          <span className="status-spinner" /> Loading decisions...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-view">
        <PageHeader title="Decision Center" description="Human decision surface" />
        <div className="status-feedback" role="alert">
          <p className="status-error-text">{error}</p>
        </div>
      </div>
    )
  }

  if (mode === 'inbox') {
    return (
      <div className="page-view">
        <PageHeader
          title="Inbox"
          description="Everything that currently waits for an explicit human decision."
        />
        {inbox.length === 0 ? (
          <EmptyState
            title="Nothing needs you"
            message="Agent Office has no canonical Task or Run decision waiting for human action."
          />
        ) : (
          <div className="dashboard-section" aria-label="Human decision inbox">
            <div className="section-body">
              {inbox.map((item) => (
                <article key={item.task.id} className="result-decision-card">
                  <div className="section-header">
                    <div>
                      <span className="cell-secondary">{item.project.name}</span>
                      <h2 className="section-title">{item.task.title}</h2>
                    </div>
                    <span className="badge badge-neutral">{columnFor(item)}</span>
                  </div>
                  <p>{decisionText(item)}</p>
                  {item.latestRun && (
                    <p className="cell-secondary">
                      Run <code>{item.latestRun.id.slice(0, 8)}</code> · {item.latestRun.status}
                    </p>
                  )}
                  <Link href={`/tasks/${item.task.id}`}>Open Task decision</Link>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page-view">
      <PageHeader
        title="Task Board"
        description="Read-only workflow projection. Columns are derived from canonical Task, Run, and acceptance state—cards cannot be dragged to invent progress."
      />
      <div className="decision-board" aria-label="Canonical Task board">
        {BOARD_COLUMNS.map((column) => {
          const columnItems = items.filter((item) => columnFor(item) === column)
          return (
            <section key={column} className="dashboard-section decision-board-column">
              <div className="section-header">
                <h2 className="section-title">{column}</h2>
                <span className="badge badge-neutral">{columnItems.length}</span>
              </div>
              <div className="section-body">
                {columnItems.length === 0 ? (
                  <p className="cell-secondary">Nothing here</p>
                ) : (
                  columnItems.map((item) => (
                    <article key={item.task.id} className="result-decision-card">
                      <span className="cell-secondary">{item.project.name}</span>
                      <h3>{item.task.title}</h3>
                      <p className="cell-secondary">
                        {item.latestRun
                          ? `${item.latestRun.status} · Run ${item.latestRun.id.slice(0, 8)}`
                          : 'No execution Run yet'}
                      </p>
                      <Link href={`/tasks/${item.task.id}`}>Open Task</Link>
                    </article>
                  ))
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
