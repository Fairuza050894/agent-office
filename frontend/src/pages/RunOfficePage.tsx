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
  type Workspace,
} from '../api'
import { EmptyState } from '../components/EmptyState'
import { AgentInspector } from '../components/office/AgentInspector'
import { BottomOperationsDock } from '../components/office/BottomOperationsDock'
import { OfficeCommandRail } from '../components/office/OfficeCommandRail'
import { UniversalComposerShell } from '../components/office/UniversalComposerShell'
import { OfficeRendererBoundary } from '../components/OfficeRendererBoundary'
import { OfficeScene } from '../components/OfficeScene'
import {
  officeReplayDuration,
  officeReplayFactualCutoff,
  officeReplayRange,
  type OfficeReplayRange,
} from '../office3d/replay'
import { officeLatestAgentEvent } from '../officeProjection'
import { PageHeader } from '../components/PageHeader'
import { Link } from '../router/Link'

export interface RunOfficePageProps {
  runId: string
}

type LiveState = 'connected' | 'disconnected' | 'unsupported'

export function RunOfficePage({ runId }: RunOfficePageProps) {
  const [run, setRun] = useState<Run | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [stages, setStages] = useState<RunStage[]>([])
  const [agents, setAgents] = useState<AgentRun[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [executors, setExecutors] = useState<Executor[]>([])
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [motionPaused, setMotionPaused] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
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
        loadedStages,
        loadedAgents,
        loadedWorkspaces,
        loadedEvents,
        loadedExecutors,
        loadedProfiles,
      ] = await Promise.all([
        api.getProject(loadedRun.project_id),
        api.getRunStages(runId),
        api.getRunAgents(runId),
        api.getRunWorkspaces(runId),
        api.getRunEvents(runId),
        api.listExecutors(),
        api.listAgentProfiles(),
      ])

      setRun(loadedRun)
      setProject(loadedProject)
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

  useEffect(() => {
    if (!isMaximized) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMaximized(false)
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isMaximized])

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

  return (
    <div
      className={`page-view office-view office-workspace ${isMaximized ? 'office-maximized' : ''}`}
    >
      <OfficeCommandRail
        title="Office View"
        projectName={project?.name ?? run.project_id}
        modeLabel={officeMode === 'replay' ? 'Historical replay' : 'Live'}
        statusLabel={run.status}
        meta={`${agents.length} AgentRun${agents.length === 1 ? '' : 's'} · ${stages.length} stage${stages.length === 1 ? '' : 's'}`}
        actions={
          <>
            <span className="office-live-state" role="status">
              <span
                className={`status-dot ${liveState === 'connected' ? 'connected' : 'disconnected'}`}
                aria-hidden="true"
              />
              {liveState === 'connected'
                ? 'Live'
                : liveState === 'unsupported'
                  ? 'Manual'
                  : 'Disconnected'}
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
              Replay
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
                Live
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
              {motionPaused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={isRefreshing}
              onClick={() => void refreshAll()}
            >
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <Link href={`/runs/${run.id}`} className="btn btn-secondary btn-sm">
              Run
            </Link>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setIsMaximized((current) => !current)}
            >
              {isMaximized ? 'Exit maximize' : 'Maximize'}
            </button>
          </>
        }
      />

      <div className="office-workspace-scene">
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
            showRoster={false}
          />
        </OfficeRendererBoundary>

        {selectedAgent && (
          <AgentInspector
            agent={selectedAgent}
            profile={selectedProfile}
            executor={selectedExecutor}
            workspace={selectedWorkspace}
            stage={selectedStage}
            latestEvent={selectedEvent}
            onClose={() => setSelectedAgentId(null)}
          />
        )}
      </div>

      <UniversalComposerShell
        projects={project ? [project] : []}
        selectedProjectId={project?.id ?? ''}
        projectLocked
        executors={executors}
        selectedExecutorId={
          run.resolved_executor_id ?? run.requested_executor_id ?? null
        }
        contextLabel={
          project
            ? `${project.repository.name} · Run #${run.id.slice(0, 8)}`
            : `Run #${run.id.slice(0, 8)}`
        }
      />

      <BottomOperationsDock
        events={recentSignals}
        agents={agents}
        profiles={profiles}
        selectedAgentId={selectedAgentId}
        onSelectAgent={setSelectedAgentId}
        modeLabel={officeMode === 'replay' ? 'Historical replay' : 'Canonical live state'}
      />

      <p className="office-workspace-note">
        Office View remains a projection. Cancellation, Findings, Evidence,
        executor selection, approvals, and canonical execution state remain
        available in the operational Run view.
      </p>
    </div>
  )
}
