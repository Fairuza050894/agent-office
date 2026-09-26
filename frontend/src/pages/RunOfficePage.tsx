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
import { officeAgentState, officeLatestAgentEvent } from '../officeProjection'
import { PageHeader } from '../components/PageHeader'
import { Link } from '../router/Link'

export interface RunOfficePageProps {
  runId: string
}

type LiveState = 'connected' | 'disconnected' | 'unsupported'

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
  const [motionPaused, setMotionPaused] = useState(false)\n  const [officeMode, setOfficeMode] = useState<'live' | 'replay'>('live')\n  const [replayNonce, setReplayNonce] = useState(0)
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
              onClick={() => setOfficeMode('live')}
            >
              Live state
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-pressed={motionPaused}
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
        <OfficeRendererBoundary operationalHref={`/runs/${run.id}`}>
          <OfficeScene
            stages={stages}
            agents={agents}
            events={events}
            workspaces={workspaces}
            executors={executors}
            profiles={profiles}
            selectedAgentId={selectedAgentId}
            onSelectAgent={setSelectedAgentId}
            motionPaused={motionPaused}
            mode={officeMode}
            replayNonce={replayNonce}
          />
        </OfficeRendererBoundary>

        {selectedAgent && selectedState && (
          <aside className="office-detail-panel" aria-label="Selected AgentRun details">
            <div className="office-detail-header">
              <div>
                <span>AgentRun detail</span>
                <h2>
                  {selectedProfile?.name ?? selectedAgent.agent_profile_key}
                </h2>
                <code>{selectedAgent.id}</code>
              </div>
              <button
                type="button"
                className="office-detail-close"
                aria-label="Close AgentRun detail"
                onClick={() => setSelectedAgentId(null)}
              >
                ×
              </button>
            </div>

            <dl className="office-detail-facts">
              <div>
                <dt>Role</dt>
                <dd>{selectedProfile?.name ?? selectedAgent.agent_profile_key}</dd>
              </div>
              <div>
                <dt>State</dt>
                <dd>{selectedState.label} · {selectedAgent.status}</dd>
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
                <dt>Stage</dt>
                <dd>
                  {selectedAgent.stage_key}
                  {selectedStage ? ` · ${selectedStage.status}` : ''}
                </dd>
              </div>
              <div>
                <dt>Workspace type</dt>
                <dd>{selectedWorkspace?.kind ?? 'Unavailable'}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{formatTimestamp(selectedAgent.started_at)}</dd>
              </div>
              <div>
                <dt>Last factual activity</dt>
                <dd>
                  {selectedEvent
                    ? `${selectedEvent.event_type} · ${formatTimestamp(selectedEvent.occurred_at)}`
                    : `No agent-scoped Event recorded · AgentRun updated ${formatTimestamp(selectedAgent.updated_at)}`}
                </dd>
              </div>
            </dl>

            {selectedAgent.reason_summary && (
              <div className="office-detail-note">
                <strong>{selectedAgent.reason_code ?? 'AgentRun note'}</strong>
                <span>{selectedAgent.reason_summary}</span>
              </div>
            )}
          </aside>
        )}
      </div>

      <div className="office-accessibility-note">
        Office View is optional. Cancellation, Findings, Evidence, executor selection,
        approvals, and all canonical execution state remain available in the operational
        Run view.
      </div>
    </div>
  )
}
