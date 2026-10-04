import { useEffect, useMemo, useState } from 'react'

import {
  api,
  type ComposerThread,
  type Project,
  type RequirementCandidate,
  type ResultReview,
  type Run,
  type Task,
  type TeamProposal,
} from '../api'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { Link } from '../router/Link'

export type DecisionCenterMode = 'inbox' | 'board'

interface DecisionTask {
  project: Project
  task: Task
  latestRun: Run | null
  review: ResultReview | null
  agentRunCount: number
}

interface PlanningApproval {
  kind: 'Requirement' | 'Team'
  project: Project
  thread: ComposerThread
  id: string
  title: string
  summary: string
  createdAt: string
}

type BoardColumn = 'Planning' | 'Ready' | 'Running' | 'In review' | 'Needs you' | 'Accepted'
type InboxFilter = 'all' | 'result' | 'approvals' | 'blocked'

const BOARD_COLUMNS: BoardColumn[] = [
  'Planning',
  'Ready',
  'Running',
  'In review',
  'Needs you',
  'Accepted',
]

const INBOX_FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'result', label: 'Result Review' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'blocked', label: 'Blocked' },
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

function decisionKind(item: DecisionTask): Exclude<InboxFilter, 'all' | 'approvals'> | null {
  const run = item.latestRun
  if (!run) return null
  if (item.review?.state === 'AWAITING_REVIEW') return 'result'
  if (run.status === 'BLOCKED' || run.status === 'FAILED') return 'blocked'
  return null
}

function decisionText(item: DecisionTask): string | null {
  const run = item.latestRun
  if (!run) return null
  if (item.review?.state === 'AWAITING_REVIEW') return 'Review and accept the completed result'
  if (run.status === 'BLOCKED') return 'Resolve a blocked execution decision'
  if (run.status === 'FAILED') return 'Inspect the failed Run and decide the next attempt'
  return null
}

function ageLabel(timestamp: string): string {
  const elapsedMs = Math.max(0, Date.now() - new Date(timestamp).getTime())
  const minutes = Math.floor(elapsedMs / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function proposalTitle(proposal: TeamProposal): string {
  return `${proposal.phase[0]}${proposal.phase.slice(1).toLowerCase()} team proposal`
}

async function loadApprovals(project: Project): Promise<PlanningApproval[]> {
  let threads: ComposerThread[]
  try {
    threads = await api.listProjectComposerThreads(project.id)
  } catch {
    return []
  }

  const groups = await Promise.all(
    threads.map(async (thread) => {
      const [requirements, teams] = await Promise.all([
        api.listRequirementCandidates(thread.id).catch(() => [] as RequirementCandidate[]),
        api.listTeamProposals(thread.id).catch(() => [] as TeamProposal[]),
      ])

      const requirementApprovals: PlanningApproval[] = requirements
        .filter((requirement) => requirement.status === 'PROPOSED')
        .map((requirement) => ({
          kind: 'Requirement',
          project,
          thread,
          id: requirement.id,
          title: requirement.title,
          summary: requirement.requirement,
          createdAt: requirement.created_at,
        }))

      const teamApprovals: PlanningApproval[] = teams
        .filter((proposal) => proposal.status === 'PROPOSED')
        .map((proposal) => ({
          kind: 'Team',
          project,
          thread,
          id: proposal.id,
          title: proposalTitle(proposal),
          summary: proposal.rationale_summary,
          createdAt: proposal.created_at,
        }))

      return [...requirementApprovals, ...teamApprovals]
    }),
  )

  return groups.flat()
}

export function DecisionCenterPage({ mode }: { mode: DecisionCenterMode }) {
  const [items, setItems] = useState<DecisionTask[]>([])
  const [approvals, setApprovals] = useState<PlanningApproval[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')

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

        const [loaded, loadedApprovals] = await Promise.all([
          Promise.all(
            taskGroups.flatMap(({ project, tasks }) =>
              tasks.map(async (task): Promise<DecisionTask> => {
                const runs = await api.listRuns(task.id)
                const latest = latestRun(runs)
                let review: ResultReview | null = null
                let agentRunCount = 0

                if (latest) {
                  const [loadedReview, agents] = await Promise.all([
                    latest.status === 'COMPLETED'
                      ? api.getResultReview(latest.id).catch(() => null)
                      : Promise.resolve(null),
                    api.getRunAgents(latest.id).catch(() => []),
                  ])
                  review = loadedReview
                  agentRunCount = agents.length
                }

                return { project, task, latestRun: latest, review, agentRunCount }
              }),
            ),
          ),
          Promise.all(activeProjects.map(loadApprovals)).then((groups) => groups.flat()),
        ])

        if (!active) return
        setItems(loaded)
        setApprovals(loadedApprovals)
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

  const taskDecisions = useMemo(
    () => items.filter((item) => decisionKind(item) !== null),
    [items],
  )

  const filteredTaskDecisions = useMemo(() => {
    if (inboxFilter === 'all') return taskDecisions
    if (inboxFilter === 'approvals') return []
    return taskDecisions.filter((item) => decisionKind(item) === inboxFilter)
  }, [inboxFilter, taskDecisions])

  const filteredApprovals = useMemo(
    () => (inboxFilter === 'all' || inboxFilter === 'approvals' ? approvals : []),
    [approvals, inboxFilter],
  )

  const boardProjects = useMemo(() => {
    const byId = new Map(items.map((item) => [item.project.id, item.project]))
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [items])

  const boardItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return items.filter((item) => {
      const column = columnFor(item)
      if (projectFilter !== 'all' && item.project.id !== projectFilter) return false
      if (statusFilter !== 'all' && column !== statusFilter) return false
      if (
        normalized &&
        !`${item.task.title} ${item.task.id} ${item.project.name} ${item.latestRun?.id ?? ''} ${item.latestRun?.status ?? ''}`
          .toLowerCase()
          .includes(normalized)
      ) {
        return false
      }
      return true
    })
  }, [items, projectFilter, query, statusFilter])

  if (isLoading) {
    return (
      <div className="page-view">
        <PageHeader
          title={mode === 'inbox' ? 'Inbox' : 'Task Board'}
          description="Loading canonical Task, Run, and planning decisions..."
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
    const count = filteredTaskDecisions.length + filteredApprovals.length

    return (
      <div className="page-view decision-center-page">
        <PageHeader
          title="Inbox"
          description="Only canonical records that currently require an explicit human decision."
        />
        <div className="decision-toolbar" aria-label="Inbox filters">
          <div className="decision-filter-tabs" role="group" aria-label="Decision type">
            {INBOX_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={inboxFilter === filter.key ? 'active' : ''}
                aria-pressed={inboxFilter === filter.key}
                onClick={() => setInboxFilter(filter.key)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <span className="decision-toolbar-count">{count} waiting</span>
        </div>

        {count === 0 ? (
          <EmptyState
            title="Nothing needs you"
            message="Agent Office has no canonical result review, approval, or blocked execution waiting for human action in this filter."
          />
        ) : (
          <section className="decision-inbox-list" aria-label="Human decision inbox">
            {filteredTaskDecisions.map((item) => {
              const text = decisionText(item)
              const run = item.latestRun
              if (!text || !run) return null

              return (
                <article key={item.task.id} className="decision-inbox-row">
                  <div className="decision-inbox-kind" data-kind={decisionKind(item)}>
                    {decisionKind(item) === 'result' ? 'Result' : 'Blocked'}
                  </div>
                  <div className="decision-inbox-main">
                    <div className="decision-inbox-kicker">
                      <span>{item.project.name}</span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={run.updated_at} title={run.updated_at}>
                        {ageLabel(run.updated_at)}
                      </time>
                    </div>
                    <h2>{item.task.title}</h2>
                    <p>{text}</p>
                    <div className="decision-inbox-meta">
                      <span>Run {run.id.slice(0, 8)}</span>
                      <span>{run.status}</span>
                      <span>{item.agentRunCount} AgentRun{item.agentRunCount === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                  <div className="decision-inbox-action">
                    <span className="badge badge-neutral">{columnFor(item)}</span>
                    <Link href={`/tasks/${item.task.id}`}>Open decision</Link>
                  </div>
                </article>
              )
            })}

            {filteredApprovals
              .slice()
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((approval) => (
                <article key={`${approval.kind}-${approval.id}`} className="decision-inbox-row">
                  <div className="decision-inbox-kind" data-kind="approval">
                    Approval
                  </div>
                  <div className="decision-inbox-main">
                    <div className="decision-inbox-kicker">
                      <span>{approval.project.name}</span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={approval.createdAt} title={approval.createdAt}>
                        {ageLabel(approval.createdAt)}
                      </time>
                    </div>
                    <h2>{approval.title}</h2>
                    <p>{approval.summary}</p>
                    <div className="decision-inbox-meta">
                      <span>{approval.kind}</span>
                      <span>Thread {approval.thread.id.slice(0, 8)}</span>
                      <span>PROPOSED</span>
                    </div>
                  </div>
                  <div className="decision-inbox-action">
                    <span className="badge badge-neutral">Approval</span>
                    <Link href="/office">Open planning</Link>
                  </div>
                </article>
              ))}
          </section>
        )}
      </div>
    )
  }

  return (
    <div className="page-view decision-center-page">
      <PageHeader
        title="Task Board"
        description="Read-only delivery projection from canonical Task, Run, ResultReview, and AgentRun state. Cards never mutate status."
      />
      <div className="decision-toolbar decision-board-toolbar" aria-label="Task Board filters">
        <label>
          <span>Project</span>
          <select
            aria-label="Filter board by project"
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
          >
            <option value="all">All projects</option>
            {boardProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            aria-label="Filter board by status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            {BOARD_COLUMNS.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </label>
        <label className="decision-board-search">
          <span>Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Task, Run, project..."
          />
        </label>
        <span className="decision-toolbar-count">{boardItems.length} tasks</span>
      </div>

      <div className="decision-board" aria-label="Canonical Task board">
        {BOARD_COLUMNS.map((column) => {
          const columnItems = boardItems.filter((item) => columnFor(item) === column)
          return (
            <section
              key={column}
              className="dashboard-section decision-board-column"
              data-column={column.toLowerCase().replaceAll(' ', '-')}
            >
              <div className="section-header">
                <h2 className="section-title">{column}</h2>
                <span className="badge badge-neutral">{columnItems.length}</span>
              </div>
              <div className="section-body">
                {columnItems.length === 0 ? (
                  <p className="cell-secondary">Nothing here</p>
                ) : (
                  columnItems.map((item) => (
                    <article key={item.task.id} className="result-decision-card decision-board-card">
                      <span className="cell-secondary">{item.project.name}</span>
                      <h3>{item.task.title}</h3>
                      <p className="cell-secondary">
                        {item.latestRun
                          ? `${item.latestRun.status} · Run ${item.latestRun.id.slice(0, 8)}`
                          : 'No execution Run yet'}
                      </p>
                      <div className="decision-board-card-meta">
                        <span>
                          {item.agentRunCount} AgentRun{item.agentRunCount === 1 ? '' : 's'}
                        </span>
                        <span>{column}</span>
                      </div>
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
