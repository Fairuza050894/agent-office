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
import { AgentOfficeScopeSwitcher } from '../components/office/AgentOfficeScopeSwitcher'
import { UniversalComposerShell } from '../components/office/UniversalComposerShell'
import { OfficeRendererBoundary } from '../components/OfficeRendererBoundary'
import { OfficeScene } from '../components/OfficeScene'
import {
  OFFICE_FLOORS,
  officeRoleHomeLocation,
  type OfficeFloorKey,
} from '../office3d/livingOffice'
import {
  officeReplayDuration,
  officeReplayFactualCutoff,
  officeReplayRange,
  type OfficeReplayRange,
} from '../office3d/replay'
import { officeLatestAgentEvent } from '../officeProjection'
import { PageHeader } from '../components/PageHeader'
import { Link } from '../router/Link'
import { useRouter } from '../router/useRouter'

export interface RunOfficePageProps {
  runId: string
}

type LiveState = 'connected' | 'disconnected' | 'unsupported'

export function RunOfficePage({ runId }: RunOfficePageProps) {
  const { currentSearch, navigate } = useRouter()
  const requestedReplay = useMemo(
    () => new URLSearchParams(currentSearch).get('mode') === 'replay',
    [currentSearch],
  )
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
  const [officeMode, setOfficeMode] = useState<'live' | 'replay'>(
    requestedReplay ? 'replay' : 'live',
  )
  const [selectedFloor, setSelectedFloor] = useState<OfficeFloorKey>('build')
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
  const initialFloorResolved = useRef(false)

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
    if (!run) return

    if (requestedReplay && officeMode !== 'replay') {
      const range = officeReplayRange(agents, events)
      setReplayRangeSnapshot(range)
      setReplayStartedAt(performance.now())
      setReplayElapsed(0)
      setOfficeMode('replay')
      setMotionPaused(false)
      setReplayNonce((current) => current + 1)
      return
    }

    if (!requestedReplay && officeMode === 'replay') {
      setOfficeMode('live')
      setReplayStartedAt(null)
      setReplayRangeSnapshot(null)
      setReplayElapsed(null)
    }
  }, [agents, events, officeMode, requestedReplay, run])


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

  const operationalFloorCounts = useMemo(
    () =>
      OFFICE_FLOORS.reduce(
        (counts, floor) => {
          counts[floor.key] = agents.filter(
            (agent) =>
              officeRoleHomeLocation(agent.agent_profile_key).floor === floor.key,
          ).length
          return counts
        },
        { commons: 0, build: 0, strategy: 0 } as Record<
          OfficeFloorKey,
          number
        >,
      ),
    [agents],
  )

  const visibleAgents = useMemo(
    () =>
      agents.filter(
        (agent) =>
          officeRoleHomeLocation(agent.agent_profile_key).floor === selectedFloor,
      ),
    [agents, selectedFloor],
  )

  useEffect(() => {
    if (initialFloorResolved.current || agents.length === 0) return

    const preferredFloor: OfficeFloorKey =
      operationalFloorCounts.build > 0
        ? 'build'
        : operationalFloorCounts.strategy > 0
          ? 'strategy'
          : 'commons'

    setSelectedFloor(preferredFloor)
    initialFloorResolved.current = true
  }, [agents.length, operationalFloorCounts])

  const selectOperationalAgent = (agentId: string | null) => {
    setSelectedAgentId(agentId)
    if (!agentId) return

    const agent = agents.find((candidate) => candidate.id === agentId)
    if (!agent) return

    setSelectedFloor(officeRoleHomeLocation(agent.agent_profile_key).floor)
  }

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
          title="Run Office View"
          description="Loading the factual Run projection."
        />
        <div className="status-feedback" role="status">
          <span className="status-spinner" /> Loading Run Office View...
        </div>
      </div>
    )
  }

  if (error || !run) {
    return (
      <div className="page-view office-view">
        <PageHeader
          title="Run Office View unavailable"
          description="The visual projection could not load canonical Run state."
          action={
            <Link href={`/runs/${runId}`} className="btn btn-secondary">
              Operational Run
            </Link>
          }
        />
        <EmptyState
          title="Run Office View could not load."
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
        title="Agent Office"
        projectName={project?.name ?? run.project_id}
        modeLabel={officeMode === 'replay' ? 'Run · Replay' : 'Run · Live'}
        statusLabel={run.status}
        meta={`${agents.length} AgentRun${agents.length === 1 ? '' : 's'} · ${stages.length} stage${stages.length === 1 ? '' : 's'}`}
        actions={
          <>
            <AgentOfficeScopeSwitcher
              projectId={project?.id ?? run.project_id}
              runId={run.id}
              activeScope={officeMode}
              onLive={() => {
                setOfficeMode('live')
                setReplayStartedAt(null)
                setReplayRangeSnapshot(null)
                setReplayElapsed(null)
                navigate(`/runs/${run.id}/office`)
              }}
              onReplay={() => {
                const range = officeReplayRange(agents, events)
                setReplayRangeSnapshot(range)
                setReplayStartedAt(performance.now())
                setReplayElapsed(0)
                setOfficeMode('replay')
                setMotionPaused(false)
                setReplayNonce((current) => current + 1)
                navigate(`/runs/${run.id}/office?mode=replay`)
              }}
            />
            <span className="office-live-state" role="status">
              <span
                className={`status-dot ${liveState === 'connected' ? 'connected' : 'disconnected'}`}
                aria-hidden="true"
              />
              {liveState === 'connected'
                ? 'Events connected'
                : liveState === 'unsupported'
                  ? 'Manual refresh'
                  : 'Events disconnected'}
            </span>
            <details className="office-action-menu">
              <summary>Run controls</summary>
              <div>
                <button
                  type="button"
                  className="office-action-menu-item"
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
                  className="office-action-menu-item"
                  disabled={isRefreshing}
                  onClick={() => void refreshAll()}
                >
                  {isRefreshing ? 'Refreshing…' : 'Refresh data'}
                </button>
                <Link
                  href={`/runs/${run.id}`}
                  className="office-action-menu-item"
                >
                  Open Run details
                </Link>
              </div>
            </details>
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
            agents={visibleAgents}
            profiles={profiles}
            selectedAgentId={selectedAgentId}
            onSelectAgent={(agentId) => selectOperationalAgent(agentId)}

            motionPaused={motionPaused}
            mode={officeMode}
            replayNonce={replayNonce}
            replayStartedAt={replayStartedAt}
            replayRange={replayRangeSnapshot}
            showRoster={false}
            floor={selectedFloor}
            onFloorChange={(floor) => {
              initialFloorResolved.current = true
              setSelectedFloor(floor)
              setSelectedAgentId(null)
            }}
            operationalFloorCounts={operationalFloorCounts}
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
            onClose={() => selectOperationalAgent(null)}
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
        onSelectAgent={(agentId) => selectOperationalAgent(agentId)}
        modeLabel={officeMode === 'replay' ? 'Historical replay' : 'Canonical state'}
        forceCollapsed={isMaximized}
      />

      <p className="office-workspace-note">
        Agent Office is showing the canonical Run scope. Workspace, Live Run,
        and Replay share one 3D office experience while preserving different
        truth sources. Run detail remains authoritative for execution controls,
        Findings, Evidence, approvals, and integration state.
      </p>
    </div>
  )
}
