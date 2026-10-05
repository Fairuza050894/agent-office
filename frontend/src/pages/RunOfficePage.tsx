import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  api,
  type AgentEvent,
  type AgentProfile,
  type AgentRun,
  type AuditRecord,
  type CreateTaskRequest,
  type Evidence,
  type Executor,
  type Finding,
  type Project,
  type ResultReview,
  type Run,
  type RunStage,
  type Task,
  type Workspace,
  type WorkspaceStatusResponse,
} from '../api'
import { EmptyState } from '../components/EmptyState'
import { BottomOperationsDock } from '../components/office/BottomOperationsDock'
import { OfficeHud } from '../components/office/OfficeHud'
import { OfficeFocusCard } from '../components/office/OfficeFocusCard'
import { ContextualOperationsRail } from '../components/office/ContextualOperationsRail'
import { OfficeCommandRail } from '../components/office/OfficeCommandRail'
import { AgentOfficeScopeSwitcher } from '../components/office/AgentOfficeScopeSwitcher'
import { CreateTaskModal } from '../components/CreateTaskModal'
import { OfficeRendererBoundary } from '../components/OfficeRendererBoundary'
import { OfficeScene } from '../components/OfficeScene'
import {
  OFFICE_FLOORS,
  officeFloorFromParam,
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
  const requestedFloor = useMemo(
    () => officeFloorFromParam(new URLSearchParams(currentSearch).get('floor')),
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
  const [tasks, setTasks] = useState<Task[]>([])
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [findings, setFindings] = useState<Finding[]>([])
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([])
  const [review, setReview] = useState<ResultReview | null>(null)
  const [reviewAvailable, setReviewAvailable] = useState(false)
  const [workspaceStatuses, setWorkspaceStatuses] = useState<WorkspaceStatusResponse[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [contextCollapsed, setContextCollapsed] = useState(false)
  const [taskActionMessage, setTaskActionMessage] = useState<string | null>(null)
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false)
  const [motionPaused, setMotionPaused] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [officeMode, setOfficeMode] = useState<'live' | 'replay'>(
    requestedReplay ? 'replay' : 'live',
  )
  const [selectedFloor, setSelectedFloor] = useState<OfficeFloorKey>(
    requestedFloor ?? 'build',
  )
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
  const initialFloorResolved = useRef(Boolean(requestedFloor))

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
        loadedTasks,
        loadedEvidence,
        loadedFindings,
        loadedAudit,
      ] = await Promise.all([
        api.getProject(loadedRun.project_id),
        api.getRunStages(runId),
        api.getRunAgents(runId),
        api.getRunWorkspaces(runId),
        api.getRunEvents(runId),
        api.listExecutors(),
        api.listAgentProfiles(),
        api.listTasks(loadedRun.project_id),
        api.getRunEvidence(runId),
        api.getRunFindings(runId),
        api.getRunAudit(runId),
      ])
      const loadedWorkspaceStatuses = await Promise.all(
        loadedWorkspaces.map((workspace) => api.getWorkspaceStatus(workspace.id)),
      )

      setRun(loadedRun)
      setProject(loadedProject)
      setStages(loadedStages)
      setAgents(loadedAgents)
      setWorkspaces(loadedWorkspaces)
      setTasks(loadedTasks)
      setEvidence(loadedEvidence)
      setFindings(loadedFindings.findings)
      setAuditRecords(loadedAudit)
      setWorkspaceStatuses(loadedWorkspaceStatuses)
      setEvents(
        loadedEvents.events
          .slice()
          .sort((left, right) => left.recorded_at.localeCompare(right.recorded_at))
          .slice(-100),
      )
      setExecutors(loadedExecutors)
      setProfiles(loadedProfiles)
      try {
        setReview(await api.getResultReview(runId))
        setReviewAvailable(true)
      } catch {
        setReview(null)
        setReviewAvailable(false)
      }
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

    let active = true
    void Promise.resolve().then(() => {
      if (!active) return

      if (
        requestedReplay &&
        (officeMode !== 'replay' || replayStartedAt === null)
      ) {
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
    })

    return () => {
      active = false
    }
  }, [agents, events, officeMode, replayStartedAt, requestedReplay, run])

  useEffect(() => {
    if (!requestedFloor) return

    initialFloorResolved.current = true
    let active = true
    void Promise.resolve().then(() => {
      if (!active) return
      setSelectedFloor(requestedFloor)
      setSelectedAgentId(null)
    })

    return () => {
      active = false
    }
  }, [requestedFloor])

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
  const selectedWorkspaceStatus = selectedWorkspace
    ? workspaceStatuses.find((item) => item.workspace.id === selectedWorkspace.id) ?? null
    : null
  const selectedStage = selectedAgent
    ? stageByKey.get(selectedAgent.stage_key)
    : undefined
  const selectedEvent = selectedAgent
    ? officeLatestAgentEvent(selectedAgent.id, events)
    : null

  const createFollowUpTask = async (
    projectId: string,
    data: CreateTaskRequest,
  ): Promise<Task> => {
    const created = await api.createTask(projectId, {
      ...data,
      requested_executor_id:
        data.requested_executor_id ??
        selectedAgent?.executor_id ??
        run.resolved_executor_id ??
        run.requested_executor_id,
    })
    setTasks((current) => [
      created,
      ...current.filter((task) => task.id !== created.id),
    ])
    setTaskActionMessage(
      `Follow-up Task ${created.id.slice(0, 8)} created. It is not started automatically.`,
    )
    return created
  }

  const contextualEvents = selectedAgent
    ? recentSignals.filter((event) => event.agent_run_id === selectedAgent.id)
    : recentSignals
  const contextualEvidence = selectedAgent
    ? evidence.filter((item) => item.agent_run_id === selectedAgent.id)
    : evidence
  const contextualFindings = selectedAgent
    ? findings.filter(
        (finding) =>
          finding.reviewer_agent_run_id === selectedAgent.id ||
          finding.remediation_owner_agent_run_id === selectedAgent.id,
      )
    : findings

  return (
    <div
      className={`page-view office-view office-workspace office-structure-v2 ${isMaximized ? 'office-maximized' : ''}`}
    >
      <OfficeCommandRail
        title="Agent Office"
        projectName={project?.name ?? run.project_id}
        statusLabel={run.status}
        meta={`${agents.length} AgentRun${agents.length === 1 ? '' : 's'} · ${stages.length} stage${stages.length === 1 ? '' : 's'}`}
        actions={
          <>
            <AgentOfficeScopeSwitcher
              projectId={project?.id ?? run.project_id}
              runId={run.id}
              activeScope={officeMode}
              floor={selectedFloor}
              onLive={() => {
                setOfficeMode('live')
                setReplayStartedAt(null)
                setReplayRangeSnapshot(null)
                setReplayElapsed(null)
                navigate(
                  `/runs/${run.id}/office?floor=${selectedFloor}`,
                )
              }}
              onReplay={() => {
                const range = officeReplayRange(agents, events)
                setReplayRangeSnapshot(range)
                setReplayStartedAt(performance.now())
                setReplayElapsed(0)
                setOfficeMode('replay')
                setMotionPaused(false)
                setReplayNonce((current) => current + 1)
                navigate(
                  `/runs/${run.id}/office?floor=${selectedFloor}&mode=replay`,
                )
              }}
            />
            <span className="office-live-state" role="status">
              <span
                className={`status-dot ${liveState === 'connected' ? 'connected' : 'disconnected'}`}
                aria-hidden="true"
              />
              {officeMode === 'replay'
                ? 'Historical events'
                : liveState === 'connected'
                  ? 'Events connected'
                  : liveState === 'unsupported'
                    ? 'Manual refresh'
                    : 'Events disconnected'}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setIsCreateTaskOpen(true)}
            >
              + Task
            </button>
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

      <div
        className={`office-workspace-scene office-context-layout ${contextCollapsed ? 'context-collapsed' : ''}`}
      >
        <div className="office-workspace-stage">
          <OfficeHud
            agents={agents}
            events={recentSignals}
            executors={executors}
            review={review}
            reviewAvailable={reviewAvailable}
            taskId={run.task_id}
            runId={run.id}
            compact
          />
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
                navigate(
                  officeMode === 'replay'
                    ? `/runs/${run.id}/office?floor=${floor}&mode=replay`
                    : `/runs/${run.id}/office?floor=${floor}`,
                )
              }}
              operationalFloorCounts={operationalFloorCounts}
            />
          </OfficeRendererBoundary>
        </div>

        <ContextualOperationsRail
          eyebrow={selectedAgent ? 'Selected AgentRun' : 'Run context'}
          title={selectedProfile?.name ?? selectedAgent?.agent_profile_key ?? `Run ${run.id.slice(0, 8)}`}
          status={
            selectedAgent
              ? `${selectedAgent.status} · ${selectedStage?.status ?? selectedAgent.stage_key}`
              : `${run.status} · ${officeMode === 'replay' ? 'Historical Replay' : 'Live'}`
          }
          collapsed={contextCollapsed}
          onToggleCollapsed={() => setContextCollapsed((current) => !current)}
          discussion={
            <div className="office-context-stack">
              <OfficeFocusCard
                taskId={run.task_id}
                taskTitle={tasks.find((task) => task.id === run.task_id)?.title ?? null}
                run={run}
                stages={stages}
                agent={selectedAgent}
                agentProfileName={selectedProfile?.name ?? null}
              />
              <div className="office-context-callout">
                <strong>
                  {selectedAgent ? 'Factual agent activity' : 'Factual Run activity'}
                </strong>
                <span>
                  Live/Replay discussion is projected from canonical Events. Ad-hoc messages do not mutate an in-flight AgentRun.
                </span>
              </div>
              <div className="office-context-discussion">
                {contextualEvents.length === 0 ? (
                  <div className="office-context-empty">No canonical Event is available for this context.</div>
                ) : (
                  contextualEvents.slice(0, 16).reverse().map((event) => (
                    <article key={event.id}>
                      <div>
                        <strong>
                          {event.agent_run_id
                            ? profileByKey.get(
                                agents.find((agent) => agent.id === event.agent_run_id)?.agent_profile_key ?? '',
                              )?.name ?? event.source
                            : event.source}
                        </strong>
                        <time dateTime={event.occurred_at}>
                          {new Date(event.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </time>
                      </div>
                      <p>
                        {event.event_type.replace(/[._-]+/g, ' ')}
                        {typeof event.payload.summary === 'string' ? ` · ${event.payload.summary}` : ''}
                      </p>
                    </article>
                  ))
                )}
              </div>
              {taskActionMessage && (
                <span className="office-context-feedback" role="status">
                  {taskActionMessage}
                </span>
              )}
            </div>
          }
          details={
            <div className="office-context-stack">
              <dl className="office-context-facts">
                <div><dt>Run</dt><dd>{run.id.slice(0, 8)} · {run.status}</dd></div>
                <div><dt>Project</dt><dd>{project?.name ?? run.project_id}</dd></div>
                <div><dt>Task</dt><dd>{run.task_id.slice(0, 8)}</dd></div>
                <div><dt>AgentRun</dt><dd>{selectedAgent ? selectedAgent.id.slice(0, 8) : 'All agents'}</dd></div>
                <div><dt>Executor</dt><dd>{selectedExecutor?.name ?? selectedAgent?.executor_id ?? run.resolved_executor_id ?? 'Unavailable'}</dd></div>
                <div><dt>Workspace</dt><dd>{selectedWorkspace ? `${selectedWorkspace.kind} · ${selectedWorkspace.status}` : 'Unavailable'}</dd></div>
                <div><dt>Branch</dt><dd>{selectedWorkspace?.git_branch ?? 'Unavailable'}</dd></div>
                <div><dt>Findings</dt><dd>{contextualFindings.length}</dd></div>
                <div><dt>Evidence</dt><dd>{contextualEvidence.length}</dd></div>
              </dl>
              {selectedEvent && (
                <div className="office-context-callout">
                  <strong>Latest factual activity</strong>
                  <span>{selectedEvent.event_type.replace(/[._-]+/g, ' ')} · {new Date(selectedEvent.occurred_at).toLocaleString()}</span>
                </div>
              )}
            </div>
          }
          files={
            selectedWorkspaceStatus?.change_summary || contextualEvidence.length > 0 ? (
            <div className="office-context-stack">
              {selectedWorkspaceStatus?.change_summary ? (
                <div className="office-context-file-group">
                  <div className="office-context-file-summary">
                    <strong>{selectedWorkspaceStatus.change_summary.files_changed} changed files</strong>
                    <span>
                      +{selectedWorkspaceStatus.change_summary.insertions ?? '—'} / -{selectedWorkspaceStatus.change_summary.deletions ?? '—'}
                    </span>
                  </div>
                  {[
                    ...selectedWorkspaceStatus.change_summary.added_paths.map((path) => ['Added', path] as const),
                    ...selectedWorkspaceStatus.change_summary.modified_paths.map((path) => ['Modified', path] as const),
                    ...selectedWorkspaceStatus.change_summary.deleted_paths.map((path) => ['Deleted', path] as const),
                    ...selectedWorkspaceStatus.change_summary.untracked_paths.map((path) => ['Untracked', path] as const),
                  ].map(([kind, path]) => (
                    <article key={`${kind}:${path}`} className="office-context-file">
                      <div><strong>{path}</strong><span>{kind}</span></div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="office-context-empty">Workspace change summary unavailable for this context.</div>
              )}

              <div className="office-context-section-title">Evidence</div>
              {contextualEvidence.length === 0 ? (
                <div className="office-context-empty">No persisted Evidence exists for this context.</div>
              ) : (
                contextualEvidence.map((item) => (
                  <article key={item.id} className="office-context-file">
                    <div><strong>{item.summary}</strong><span>{item.kind}</span></div>
                    <p>{item.status} · {item.id.slice(0, 8)}</p>
                  </article>
                ))
              )}
              <div className="office-context-callout">
                <strong>Content access is gated</strong>
                <span>
                  Agent Office currently exposes workspace path summaries and Evidence metadata, but no bounded Artifact content/download API. Preview and download stay unavailable rather than reading arbitrary filesystem paths.
                </span>
              </div>
            </div>
            ) : null
          }
          logs={
            contextualEvents.length > 0 || auditRecords.length > 0 ? (
            <div className="office-context-stack">
              <div className="office-context-log">
                {contextualEvents.map((event) => (
                  <article key={event.id}>
                    <time dateTime={event.occurred_at}>
                      {new Date(event.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </time>
                    <div>
                      <strong>{event.source}</strong>
                      <span>{event.event_type.replace(/[._-]+/g, ' ')}</span>
                    </div>
                  </article>
                ))}
              </div>
              {auditRecords.length > 0 && (
                <>
                  <div className="office-context-section-title">Audit</div>
                  <div className="office-context-log">
                    {auditRecords.slice().reverse().slice(0, 20).map((record) => (
                      <article key={record.id}>
                        <time dateTime={record.occurred_at}>
                          {new Date(record.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </time>
                        <div>
                          <strong>{record.actor_type}</strong>
                          <span>{record.action} · {record.target_type}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </div>
            ) : null
          }
        />
      </div>

      <BottomOperationsDock
        events={recentSignals}
        agents={agents}
        profiles={profiles}
        selectedAgentId={selectedAgentId}
        onSelectAgent={(agentId) => selectOperationalAgent(agentId)}
        tasks={tasks.filter((task) => task.id === run.task_id)}
        runs={[run]}
        modeLabel={officeMode === 'replay' ? 'Replay' : 'Live Run'}
        forceCollapsed={isMaximized}
      />

      {isCreateTaskOpen && (
        <CreateTaskModal
          key={`run-office-create-task-${run.project_id}`}
          isOpen
          projects={project ? [project] : []}
          initialProjectId={run.project_id}
          onClose={() => setIsCreateTaskOpen(false)}
          onCreate={createFollowUpTask}
          onSuccess={() => setIsCreateTaskOpen(false)}
        />
      )}

      <p className="office-workspace-note">
        Agent Office is showing the canonical Run scope. Planning, Live Run,
        and Replay share one 3D office experience while preserving different
        truth sources. Run detail remains authoritative for execution controls,
        Findings, Evidence, approvals, and integration state.
      </p>
    </div>
  )
}
