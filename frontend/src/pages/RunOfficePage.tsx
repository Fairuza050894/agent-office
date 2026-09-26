import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  api,
  type AgentEvent,
  type AgentProfile,
  type AgentRun,
  type Executor,
  type Project,
  type Run,
  type RunStage,
  type Task,
  type Workspace,
} from '../api'
import { EmptyState } from '../components/EmptyState'
import { OfficeRendererBoundary } from '../components/OfficeRendererBoundary'
import { OfficeScene } from '../components/OfficeScene'
import {
  officeReplayDuration,
  officeReplayFactualCutoff,
  officeReplayRange,
  type OfficeReplayRange,
} from '../office3d/replay'
import { officeCharacterAppearance } from '../office3d/character'
import { officeAgentState, officeLatestAgentEvent } from '../officeProjection'
import { PageHeader } from '../components/PageHeader'
import { Link } from '../router/Link'

export interface RunOfficePageProps {
  runId: string
}

type LiveState = 'connected' | 'disconnected' | 'unsupported'

const EVENT_LABELS: Record<string, string> = {
  'agent.started': 'Agent started',
  'agent.waiting': 'Agent waiting',
  'agent.completed': 'Agent completed',
  'agent.failed': 'Agent failed',
  'review.finding.created': 'Review finding created',
  'test.started': 'Verification started',
  'test.completed': 'Verification completed',
}

function humanizeEventType(eventType: string): string {
  const explicit = EVENT_LABELS[eventType]
  if (explicit) return explicit
  return eventType
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function signalDetail(event: AgentEvent): string {
  const summary = event.payload.summary
  if (typeof summary === 'string' && summary.trim()) return summary.trim()

  const title = event.payload.title
  if (typeof title === 'string' && title.trim()) return title.trim()

  if (event.event_type === 'test.completed') {
    const passed = event.payload.passed
    const failed = event.payload.failed
    const details: string[] = []
    if (typeof passed === 'number') details.push(`${passed} passed`)
    if (typeof failed === 'number') details.push(`${failed} failed`)
    if (details.length > 0) return details.join(' · ')
  }

  return event.source
}

function signalTone(eventType: string): string {
  if (eventType.includes('failed') || eventType.includes('blocked')) return 'critical'
  if (eventType.includes('completed') || eventType.includes('resolved')) return 'success'
  if (eventType.includes('waiting') || eventType.includes('finding')) return 'attention'
  return 'neutral'
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function RunOfficePage({ runId }: RunOfficePageProps) {
  const [run, setRun] = useState<Run | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [task, setTask] = useState<Task | null>(null)
  const [stages, setStages] = useState<RunStage[]>([])
  const [agents, setAgents] = useState<AgentRun[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [executors, setExecutors] = useState<Executor[]>([])
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [motionPaused, setMotionPaused] = useState(false)
  const [officeMode, setOfficeMode] = useState<'live' | 'replay'>('live')
  const [replayNonce, setReplayNonce] = useState(0)
  const [replayStartedAt, setReplayStartedAt] = useState<number | null>(null)
  const [replayRangeSnapshot, setReplayRangeSnapshot] =
    useState<OfficeReplayRange | null>(null)
  const [replayElapsed, setReplayElapsed] = useState<number | null>(null)
  const [liveState, setLiveState] = useState<LiveState>(() =>
    typeof EventSource === 'undefined' ? 'unsupported' : 'disconnected',
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshProjection = useCallback(async () => {
    const [loadedRun, loadedStages, loadedAgents, loadedWorkspaces] =
      await Promise.all([
        api.getRun(runId),
        api.getRunStages(runId),
        api.getRunAgents(runId),
        api.getRunWorkspaces(runId),
      ])

    setRun(loadedRun)
    setStages(loadedStages)
    setAgents(loadedAgents)
    setWorkspaces(loadedWorkspaces)

    setSelectedAgentId((current) => {
      if (current && loadedAgents.some((agent) => agent.id === current)) {
        return current
      }
      return null
    })
  }, [runId])

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const loadedRun = await api.getRun(runId)
      const [
        loadedProject,
        loadedTask,
        loadedStages,
        loadedAgents,
        loadedWorkspaces,
        loadedEvents,
        loadedExecutors,
        loadedProfiles,
      ] = await Promise.all([
        api.getProject(loadedRun.project_id),
        api.getTask(loadedRun.task_id),
        api.getRunStages(runId),
        api.getRunAgents(runId),
        api.getRunWorkspaces(runId),
        api.getRunEvents(runId),
        api.listExecutors(),
        api.listAgentProfiles(),
      ])

      setRun(loadedRun)
      setProject(loadedProject)
      setTask(loadedTask)
      setStages(loadedStages)
      setAgents(loadedAgents)
      setWorkspaces(loadedWorkspaces)
      setEvents(
        loadedEvents.events
          .slice()
          .sort((left, right) => left.recorded_at.localeCompare(right.recorded_at))
          .slice(-100),
      )
      setExecutors(loadedExecutors)
      setProfiles(loadedProfiles)
      setError(null)
      setSelectedAgentId((current) => {
        if (current && loadedAgents.some((agent) => agent.id === current)) {
          return current
        }
        return null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Office View data is unavailable.')
    } finally {
      setIsRefreshing(false)
      setIsLoading(false)
    }
  }, [runId])

  useEffect(() => {
    void Promise.resolve().then(refreshAll)
  }, [refreshAll])

  useEffect(() => {
    let active = true

    if (typeof EventSource === 'undefined') {
      return () => {
        active = false
      }
    }

    const source = new EventSource(
      `/api/runs/${encodeURIComponent(runId)}/events/stream`,
    )

    source.onopen = () => {
      if (active) setLiveState('connected')
    }

    source.onmessage = (message) => {
      if (!active) return

      try {
        const event = JSON.parse(message.data) as AgentEvent
        if (event.run_id !== runId) return

        setEvents((current) => {
          if (current.some((item) => item.id === event.id)) return current
          return [...current, event]
            .sort((left, right) => left.recorded_at.localeCompare(right.recorded_at))
            .slice(-100)
        })

        if (refreshTimer.current === null) {
          refreshTimer.current = setTimeout(() => {
            refreshTimer.current = null
            void refreshProjection().catch(() => {
              // Durable state remains available through manual refresh.
            })
          }, 250)
        }
      } catch {
        // Malformed frames do not alter canonical state.
      }
    }

    source.onerror = () => {
      if (active) setLiveState('disconnected')
      source.close()
    }

    return () => {
      active = false
      source.close()
      if (refreshTimer.current !== null) {
        clearTimeout(refreshTimer.current)
        refreshTimer.current = null
      }
    }
  }, [refreshProjection, runId])

  const executorById = useMemo(
    () => new Map(executors.map((executor) => [executor.id, executor])),
    [executors],
  )
  const profileByKey = useMemo(
    () => new Map(profiles.map((profile) => [profile.key, profile])),
    [profiles],
  )
  const workspaceById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
    [workspaces],
  )
  const stageByKey = useMemo(
    () => new Map(stages.map((stage) => [stage.stage_key, stage])),
    [stages],
  )
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  )
  const agentById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents],
  )

  useEffect(() => {
    if (
      officeMode !== 'replay' ||
      replayStartedAt === null ||
      replayRangeSnapshot === null
    ) {
      return
    }

    const duration = officeReplayDuration(replayRangeSnapshot)
    const timer = window.setInterval(() => {
      const elapsed = Math.max(0, performance.now() - replayStartedAt)
      setReplayElapsed(Math.min(elapsed, duration))
      if (elapsed >= duration) window.clearInterval(timer)
    }, 100)

    return () => window.clearInterval(timer)
  }, [officeMode, replayNonce, replayRangeSnapshot, replayStartedAt])

  const recentSignals = useMemo(() => {
    const cutoff =
      officeMode === 'replay'
        ? officeReplayFactualCutoff(replayRangeSnapshot, replayElapsed)
        : null

    return events
      .filter((event) => {
        if (officeMode !== 'replay') return true
        const occurredAt = Date.parse(event.occurred_at)
        return (
          cutoff !== null &&
          Number.isFinite(occurredAt) &&
          occurredAt <= cutoff
        )
      })
      .slice()
      .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
      .slice(0, 40)
  }, [events, officeMode, replayElapsed, replayRangeSnapshot])

  if (isLoading) {
    return (
      <div className="page-view office-view">
        <PageHeader
          title="Office View"
          description="Loading the factual Run projection."
        />
        <div className="status-feedback" role="status">
          <span className="status-spinner" /> Loading Office View...
        </div>
      </div>
    )
  }

  if (error || !run) {
    return (
      <div className="page-view office-view">
        <PageHeader
          title="Office View unavailable"
          description="The visual projection could not load canonical Run state."
          action={
            <Link href={`/runs/${runId}`} className="btn btn-secondary">
              Operational Run
            </Link>
          }
        />
        <EmptyState
          title="Office View could not load."
          message={error ?? 'Run state is unavailable.'}
          detail="Workflow execution and operational views remain independent from the Office renderer."
        />
      </div>
    )
  }

  const selectedProfile = selectedAgent
    ? profileByKey.get(selectedAgent.agent_profile_key)
    : undefined
  const selectedExecutor = selectedAgent
    ? executorById.get(selectedAgent.executor_id)
    : undefined
  const selectedWorkspace =
    selectedAgent?.workspace_id
      ? workspaceById.get(selectedAgent.workspace_id)
      : undefined
  const selectedStage = selectedAgent
    ? stageByKey.get(selectedAgent.stage_key)
    : undefined
  const selectedEvent = selectedAgent
    ? officeLatestAgentEvent(selectedAgent.id, events)
    : null
  const selectedState = selectedAgent
    ? officeAgentState(selectedAgent.status)
    : null

  return (
    <div className="page-view office-view">
      <PageHeader
        title="Office View"
        description={`${task?.title ?? 'Unknown task'} · Run #${run.id.slice(0, 8)} · ${agents.length} factual AgentRun${agents.length === 1 ? '' : 's'} across ${stages.length} workflow stage${stages.length === 1 ? '' : 's'}.`}
        action={
          <Link href={`/runs/${run.id}`} className="btn btn-secondary">
            Operational Run
          </Link>
        }
      />

      <div className="office-control-bar">
        <div className="office-run-context">
          <strong>{project?.name ?? run.project_id}</strong>
          <span className={`status-inline status-${run.status.toLowerCase()}`}>
            {run.status}
          </span>
          <span>{agents.length} AgentRun{agents.length === 1 ? '' : 's'}</span>
          <span>{stages.length} stage{stages.length === 1 ? '' : 's'}</span>
        </div>

        <div className="office-view-controls">
          <span className="office-live-state" role="status">
            <span
              className={`status-dot ${liveState === 'connected' ? 'connected' : 'disconnected'}`}
              aria-hidden="true"
            />
            {liveState === 'connected'
              ? 'Live Events'
              : liveState === 'unsupported'
                ? 'Manual refresh'
                : 'Live disconnected'}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-pressed={officeMode === 'replay'}
            onClick={() => {
              const range = officeReplayRange(agents, events)
              setReplayRangeSnapshot(range)
              setReplayStartedAt(performance.now())
              setReplayElapsed(0)
              setOfficeMode('replay')
              setMotionPaused(false)
              setReplayNonce((current) => current + 1)
            }}
          >
            Historical replay
          </button>
          {officeMode === 'replay' && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setOfficeMode('live')
                setReplayStartedAt(null)
                setReplayRangeSnapshot(null)
                setReplayElapsed(null)
              }}
            >
              Live state
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-pressed={motionPaused}
            disabled={officeMode === 'replay'}
            title={
              officeMode === 'replay'
                ? 'Historical replay uses one shared playback clock.'
                : undefined
            }
            onClick={() => setMotionPaused((current) => !current)}
          >
            {motionPaused ? 'Resume motion' : 'Pause motion'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={isRefreshing}
            onClick={() => void refreshAll()}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="office-layout">
        <div className="office-scene-column">
          <OfficeRendererBoundary operationalHref={`/runs/${run.id}`}>
            <OfficeScene
              stages={stages}
              agents={agents}
              profiles={profiles}
              selectedAgentId={selectedAgentId}
              onSelectAgent={setSelectedAgentId}
              motionPaused={motionPaused}
              mode={officeMode}
              replayNonce={replayNonce}
              replayStartedAt={replayStartedAt}
              replayRange={replayRangeSnapshot}
            />
          </OfficeRendererBoundary>
        </div>

        <aside className="office-live-sidebar" aria-label="Live office sidebar">
          <section
            className="office-sidebar-section office-selected-agent"
            aria-label="Selected AgentRun details"
          >
            <div className="office-sidebar-heading">
              <div>
                <span className="office-sidebar-kicker">Selected AgentRun</span>
                <strong>
                  {selectedAgent
                    ? selectedProfile?.name ?? selectedAgent.agent_profile_key
                    : 'No agent selected'}
                </strong>
              </div>
              {selectedAgent && selectedState && (
                <span
                  className={`office-state-pill state-${selectedState.key}`}
                >
                  {selectedState.label}
                </span>
              )}
            </div>

            {selectedAgent && selectedState ? (
              <>
                <div className="office-agent-identity">
                  <span
                    className="office-agent-avatar"
                    style={{
                      backgroundColor: `#${officeCharacterAppearance(
                        selectedAgent.agent_profile_key,
                      ).accent
                        .toString(16)
                        .padStart(6, '0')}`,
                    }}
                    aria-hidden="true"
                  >
                    {(selectedProfile?.name ?? selectedAgent.agent_profile_key)
                      .split(/\s+/)
                      .map((part) => part[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <div>
                    <strong>
                      {selectedProfile?.name ?? selectedAgent.agent_profile_key}
                    </strong>
                    <span>
                      {selectedAgent.status} · attempt {selectedAgent.attempt}
                    </span>
                  </div>
                </div>

                <dl className="office-detail-facts">
                  <div>
                    <dt>Stage</dt>
                    <dd>
                      {selectedAgent.stage_key}
                      {selectedStage ? ` · ${selectedStage.status}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Executor</dt>
                    <dd>
                      {selectedExecutor?.name ?? selectedAgent.executor_id}
                      {selectedExecutor?.runtime_version
                        ? ` · ${selectedExecutor.runtime_version}`
                        : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Workspace</dt>
                    <dd>
                      {selectedWorkspace
                        ? `${selectedWorkspace.kind}${selectedWorkspace.git_branch ? ` · ${selectedWorkspace.git_branch}` : ''}`
                        : 'Unavailable'}
                    </dd>
                  </div>
                  <div>
                    <dt>Started</dt>
                    <dd>{formatTimestamp(selectedAgent.started_at)}</dd>
                  </div>
                  <div className="office-detail-fact-wide">
                    <dt>Last factual activity</dt>
                    <dd>
                      {selectedEvent
                        ? `${humanizeEventType(selectedEvent.event_type)} · ${formatTimestamp(selectedEvent.occurred_at)}`
                        : `No agent-scoped Event · updated ${formatTimestamp(selectedAgent.updated_at)}`}
                    </dd>
                  </div>
                </dl>

                {selectedAgent.reason_summary && (
                  <div className="office-detail-note">
                    <strong>{selectedAgent.reason_code ?? 'AgentRun note'}</strong>
                    <span>{selectedAgent.reason_summary}</span>
                  </div>
                )}

                <div className="office-technical-refs">
                  <span>
                    AgentRun <code>{selectedAgent.id}</code>
                  </span>
                  <span>
                    Profile <code>{selectedAgent.agent_profile_key}</code>
                  </span>
                  <span>
                    Executor <code>{shortId(selectedAgent.executor_id)}</code>
                  </span>
                  {selectedAgent.workspace_id && (
                    <span>
                      Workspace <code>{shortId(selectedAgent.workspace_id)}</code>
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="office-selection-prompt">
                <strong>Select an agent in the room or roster.</strong>
                <span>
                  Factual status, executor, workspace, and latest activity will
                  appear here without covering the scene.
                </span>
              </div>
            )}
          </section>

          <section
            className="office-sidebar-section office-signal-feed"
            aria-label="Recent factual office signals"
          >
            <div className="office-sidebar-heading">
              <div>
                <span className="office-sidebar-kicker">Canonical event stream</span>
                <strong>Recent signals</strong>
              </div>
              <span className="office-feed-mode">
                {officeMode === 'replay' ? 'Replay' : 'Live'}
              </span>
            </div>

            {recentSignals.length === 0 ? (
              <div className="office-signal-empty">
                {officeMode === 'replay'
                  ? 'No canonical Event has occurred at this replay timestamp.'
                  : 'No canonical Event has been recorded for this Run.'}
              </div>
            ) : (
              <div className="office-signal-list">
                {recentSignals.map((event) => {
                  const eventAgent = event.agent_run_id
                    ? agentById.get(event.agent_run_id)
                    : undefined
                  const eventRole = eventAgent
                    ? profileByKey.get(eventAgent.agent_profile_key)?.name ??
                      eventAgent.agent_profile_key
                    : event.source

                  return (
                    <article key={event.id} className="office-signal">
                      <span
                        className={`office-signal-dot tone-${signalTone(
                          event.event_type,
                        )}`}
                        aria-hidden="true"
                      />
                      <div className="office-signal-copy">
                        <div className="office-signal-meta">
                          <strong>{eventRole}</strong>
                          <time dateTime={event.occurred_at}>
                            {new Date(event.occurred_at).toLocaleTimeString()}
                          </time>
                        </div>
                        <span className="office-signal-type">
                          {humanizeEventType(event.event_type)}
                        </span>
                        <span className="office-signal-detail">
                          {signalDetail(event)}
                        </span>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </aside>
      </div>

      <div className="office-accessibility-note">
        Office View is optional. Cancellation, Findings, Evidence, executor selection,
        approvals, and all canonical execution state remain available in the operational
        Run view.
      </div>
    </div>
  )
}
