import { useEffect, useMemo, useState } from 'react'

import {
  api,
  type AgentProfile,
  type ComposerMessage,
  type ComposerPreparation,
  type ComposerThread,
  type Executor,
  type IntentResolution,
  type PlanningArtifact,
  type PlanningEvent,
  type Project,
  type RequirementCandidate,
  type Run,
  type TeamProposal,
} from '../api'
import { BottomOperationsDock } from '../components/office/BottomOperationsDock'
import { OfficeCommandRail } from '../components/office/OfficeCommandRail'
import { AgentOfficeScopeSwitcher } from '../components/office/AgentOfficeScopeSwitcher'
import {
  UniversalComposerShell,
  type ComposerSubmitPayload,
} from '../components/office/UniversalComposerShell'
import { OfficeRendererBoundary } from '../components/OfficeRendererBoundary'
import { OfficeScene } from '../components/OfficeScene'
import { useRouter } from '../router/useRouter'
import {
  livingOfficeMembers,
  officeAmbientWindow,
  officeFloorFromParam,
  officeBehaviorLabel,
  type OfficeFloorKey,
} from '../office3d/livingOffice'
import {
  isPlanningPresenceFresh,
  officeWorldContext,
} from '../office3d/officeWorld'

function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function composerTitle(instruction: string): string {
  const compact = instruction.replace(/\s+/g, ' ').trim()
  return compact.length <= 96 ? compact : `${compact.slice(0, 93)}…`
}

function initialFloorForThread(
  thread: ComposerThread,
  team: TeamProposal | null,
  now = new Date(),
): OfficeFloorKey {
  if (
    team &&
    isPlanningPresenceFresh(thread.updated_at, now, thread.timezone)
  ) {
    return 'strategy'
  }

  return officeAmbientWindow(now, [], thread.timezone).floor
}

async function loadPlanningSnapshot(thread: ComposerThread) {
  const [loadedMessages, teams, artifacts, requirements, eventPage] = await Promise.all([
    api.listComposerMessages(thread.id),
    api.listTeamProposals(thread.id),
    api.listPlanningArtifacts(thread.id),
    api.listRequirementCandidates(thread.id),
    api.listPlanningEvents(thread.id),
  ])

  return {
    messages: loadedMessages,
    team: teams.length > 0 ? teams[teams.length - 1] : null,
    artifacts,
    requirements,
    events: eventPage.events,
  }
}

export function OfficeWorkspacePage() {
  const { currentSearch, navigate } = useRouter()
  const requestedProjectId = useMemo(
    () => new URLSearchParams(currentSearch).get('project'),
    [currentSearch],
  )
  const requestedFloor = useMemo(
    () => officeFloorFromParam(new URLSearchParams(currentSearch).get('floor')),
    [currentSearch],
  )
  const [projects, setProjects] = useState<Project[]>([])
  const [executors, setExecutors] = useState<Executor[]>([])
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isMaximized, setIsMaximized] = useState(false)
  const [selectedFloor, setSelectedFloor] = useState<OfficeFloorKey>(
    () =>
      requestedFloor ??
      officeAmbientWindow(new Date(), [], localTimezone()).floor,
  )
  const [officeNow, setOfficeNow] = useState(() => new Date())
  const [officeClockNow, setOfficeClockNow] = useState(() => new Date())
  const [selectedOfficeMemberId, setSelectedOfficeMemberId] = useState<
    string | null
  >(null)
  const [registryError, setRegistryError] = useState<string | null>(null)
  const [latestProjectRun, setLatestProjectRun] = useState<Run | null>(null)

  const [planningThreads, setPlanningThreads] = useState<ComposerThread[]>([])
  const [activeThread, setActiveThread] = useState<ComposerThread | null>(null)
  const [resolution, setResolution] = useState<IntentResolution | null>(null)
  const [messages, setMessages] = useState<ComposerMessage[]>([])
  const [planningTeam, setPlanningTeam] = useState<TeamProposal | null>(null)
  const [planningArtifacts, setPlanningArtifacts] = useState<PlanningArtifact[]>([])
  const [planningRequirements, setPlanningRequirements] = useState<
    RequirementCandidate[]
  >([])
  const [planningEvents, setPlanningEvents] = useState<PlanningEvent[]>([])
  const [isPreparing, setIsPreparing] = useState(false)
  const [isRestoringThread, setIsRestoringThread] = useState(false)
  const [planningDecisionBusy, setPlanningDecisionBusy] = useState(false)
  const [planningActionBusy, setPlanningActionBusy] = useState(false)
  const [composerError, setComposerError] = useState<string | null>(null)

  useEffect(() => {
    let lastMinute = Math.floor(Date.now() / 60_000)
    const timer = window.setInterval(() => {
      const now = new Date()
      setOfficeClockNow(now)

      const minute = Math.floor(now.getTime() / 60_000)
      if (minute !== lastMinute) {
        lastMinute = minute
        setOfficeNow(now)
      }
    }, 1_000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true

    Promise.all([
      api.listProjects(),
      api.listExecutors(),
      api.listAgentProfiles(),
    ])
      .then(([loadedProjects, loadedExecutors, loadedProfiles]) => {
        if (!active) return
        const requestedProject =
          requestedProjectId &&
          loadedProjects.find(
            (project) =>
              project.id === requestedProjectId &&
              project.status === 'ACTIVE',
          )
        const initialProjectId =
          requestedProject?.id ??
          loadedProjects.find((project) => project.status === 'ACTIVE')?.id ??
          loadedProjects[0]?.id ??
          ''

        setProjects(loadedProjects)
        setExecutors(loadedExecutors)
        setProfiles(loadedProfiles)
        setSelectedProjectId(initialProjectId)
        setIsRestoringThread(Boolean(initialProjectId))
        setRegistryError(null)
      })
      .catch((reason) => {
        if (!active) return
        setRegistryError(
          reason instanceof Error
            ? reason.message
            : 'Office workspace registries are unavailable.',
        )
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [requestedProjectId])

  useEffect(() => {
    let active = true

    if (!selectedProjectId) {
      setLatestProjectRun(null)
      return () => {
        active = false
      }
    }

    const loadLatestRun = async () => {
      try {
        const tasks = await api.listTasks(selectedProjectId)
        const runGroups = await Promise.all(
          tasks.map((task) => api.listRuns(task.id)),
        )
        if (!active) return

        const latest =
          runGroups
            .flat()
            .slice()
            .sort((left, right) =>
              right.updated_at.localeCompare(left.updated_at),
            )[0] ?? null
        setLatestProjectRun(latest)
      } catch {
        if (active) setLatestProjectRun(null)
      }
    }

    void loadLatestRun()

    return () => {
      active = false
    }
  }, [selectedProjectId])

  useEffect(() => {
    if (!requestedFloor) return
    setSelectedFloor(requestedFloor)
    setSelectedOfficeMemberId(null)
  }, [requestedFloor])

  useEffect(() => {
    let active = true

    if (!selectedProjectId) {
      return () => {
        active = false
      }
    }

    api
      .listProjectComposerThreads(selectedProjectId)
      .then(async (threads) => {
        if (!active) return
        setPlanningThreads(threads)

        const latest = threads[0]
        if (!latest) {
          setActiveThread(null)
          setResolution(null)
          setMessages([])
          setPlanningTeam(null)
          setPlanningArtifacts([])
          setPlanningRequirements([])
          setPlanningEvents([])
          setSelectedFloor(
            requestedFloor ??
              officeAmbientWindow(new Date(), [], localTimezone()).floor,
          )
          return
        }

        const snapshot = await loadPlanningSnapshot(latest)
        if (!active) return

        setActiveThread(latest)
        setResolution(null)
        setMessages(snapshot.messages)
        setPlanningTeam(snapshot.team)
        setPlanningArtifacts(snapshot.artifacts)
        setPlanningRequirements(snapshot.requirements)
        setPlanningEvents(snapshot.events)
        setSelectedFloor(
          requestedFloor ?? initialFloorForThread(latest, snapshot.team),
        )
      })
      .catch((reason) => {
        if (!active) return
        setComposerError(
          reason instanceof Error
            ? reason.message
            : 'Unable to restore persisted planning history.',
        )
      })
      .finally(() => {
        if (active) setIsRestoringThread(false)
      })

    return () => {
      active = false
    }
  }, [selectedProjectId])

  useEffect(() => {
    if (!isMaximized) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMaximized(false)
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isMaximized])

  const selectedProject = useMemo(
    () =>
      projects.find((project) => project.id === selectedProjectId) ??
      null,
    [projects, selectedProjectId],
  )

  const selectedExecutorId =
    selectedProject?.preferred_executor_id ??
    executors.find((executor) => executor.status === 'AVAILABLE')?.id ??
    executors[0]?.id ??
    null

  const resetPlanningView = (projectId: string) => {
    const nextFloor = officeAmbientWindow(
      new Date(),
      [],
      localTimezone(),
    ).floor
    navigate(
      projectId
        ? `/office?project=${projectId}&floor=${nextFloor}`
        : `/office?floor=${nextFloor}`,
    )
    setSelectedProjectId(projectId)
    setIsRestoringThread(Boolean(projectId))
    setPlanningThreads([])
    setActiveThread(null)
    setResolution(null)
    setMessages([])
    setPlanningTeam(null)
    setPlanningArtifacts([])
    setPlanningRequirements([])
    setPlanningEvents([])
    setSelectedOfficeMemberId(null)
    setSelectedFloor(nextFloor)
    setComposerError(null)
    setLatestProjectRun(null)
  }

  const openPlanningThread = async (threadId: string) => {
    setComposerError(null)
    setResolution(null)
    setSelectedOfficeMemberId(null)

    if (!threadId) {
      setActiveThread(null)
      setMessages([])
      setPlanningTeam(null)
      setPlanningArtifacts([])
      setPlanningRequirements([])
      setPlanningEvents([])
      setSelectedFloor(
        officeAmbientWindow(new Date(), [], localTimezone()).floor,
      )
      return
    }

    const thread = planningThreads.find((candidate) => candidate.id === threadId)
    if (!thread) {
      setComposerError('The selected planning thread is no longer available.')
      return
    }

    setIsRestoringThread(true)
    try {
      const snapshot = await loadPlanningSnapshot(thread)
      setActiveThread(thread)
      setMessages(snapshot.messages)
      setPlanningTeam(snapshot.team)
      setPlanningArtifacts(snapshot.artifacts)
      setPlanningRequirements(snapshot.requirements)
      setPlanningEvents(snapshot.events)
      setSelectedFloor(initialFloorForThread(thread, snapshot.team))
    } catch (reason) {
      setComposerError(
        reason instanceof Error
          ? reason.message
          : 'Unable to restore the selected planning thread.',
      )
    } finally {
      setIsRestoringThread(false)
    }
  }

  const preparePlanning = async (payload: ComposerSubmitPayload) => {
    if (!selectedProjectId) {
      setComposerError('Select a registered Project before starting project planning.')
      return
    }

    setIsPreparing(true)
    setComposerError(null)

    try {
      const reusableThread =
        activeThread &&
        activeThread.project_id === selectedProjectId &&
        activeThread.status === 'OPEN' &&
        activeThread.requested_intent === payload.intent &&
        messages.length === 0
          ? activeThread
          : null

      const thread =
        reusableThread ??
        (await api.createComposerThread({
          project_id: selectedProjectId,
          requested_intent: payload.intent,
          timezone: localTimezone(),
          title: composerTitle(payload.instruction),
          executor_id: payload.executorId,
        }))
      const message = await api.postComposerMessage(thread.id, payload.instruction)
      const prepared: ComposerPreparation = await api.prepareComposerThread(thread.id)

      setPlanningThreads((current) => [
        prepared.thread,
        ...current.filter((candidate) => candidate.id !== prepared.thread.id),
      ])
      setActiveThread(prepared.thread)
      setResolution(prepared.resolution)
      setMessages([message])
      setPlanningTeam(prepared.team_proposal)
      setPlanningArtifacts(prepared.artifacts)
      setPlanningRequirements(prepared.requirements)
      setSelectedOfficeMemberId(null)
      setSelectedFloor('strategy')

      try {
        const eventPage = await api.listPlanningEvents(thread.id)
        setPlanningEvents(eventPage.events)
      } catch {
        setPlanningEvents([])
        setComposerError(
          'Planning was prepared, but its activity timeline could not be loaded.',
        )
      }
    } catch (reason) {
      setComposerError(
        reason instanceof Error
          ? reason.message
          : 'Unable to prepare the planning thread.',
      )
    } finally {
      setIsPreparing(false)
    }
  }

  const decideTeam = async (decision: 'accept' | 'reject') => {
    if (!planningTeam) return

    setPlanningDecisionBusy(true)
    setComposerError(null)
    try {
      const updated =
        decision === 'accept'
          ? await api.acceptTeamProposal(planningTeam.id)
          : await api.rejectTeamProposal(planningTeam.id)
      setPlanningTeam(updated)
      if (activeThread) {
        const eventPage = await api.listPlanningEvents(activeThread.id)
        setPlanningEvents(eventPage.events)
      }
    } catch (reason) {
      setComposerError(
        reason instanceof Error
          ? reason.message
          : 'Unable to record the planning-team decision.',
      )
    } finally {
      setPlanningDecisionBusy(false)
    }
  }

  const resolvePlanningQuestion = async (
    artifactId: string,
    selectedOption: string,
  ) => {
    if (!activeThread) return

    setPlanningActionBusy(true)
    setComposerError(null)
    try {
      const result = await api.resolvePlanningQuestion(
        artifactId,
        selectedOption,
      )
      setPlanningArtifacts((current) => [
        ...current.map((artifact) =>
          artifact.id === result.question.id ? result.question : artifact,
        ),
        result.decision,
      ])

      const [thread, eventPage] = await Promise.all([
        api.getComposerThread(activeThread.id),
        api.listPlanningEvents(activeThread.id),
      ])
      setActiveThread(thread)
      setPlanningEvents(eventPage.events)
    } catch (reason) {
      setComposerError(
        reason instanceof Error
          ? reason.message
          : 'Unable to record the planning decision.',
      )
    } finally {
      setPlanningActionBusy(false)
    }
  }

  const decideRequirement = async (
    requirementId: string,
    decision: 'approve' | 'reject' | 'defer',
  ) => {
    if (!activeThread) return

    setPlanningActionBusy(true)
    setComposerError(null)
    try {
      const updated =
        decision === 'approve'
          ? await api.approveRequirement(requirementId)
          : decision === 'reject'
            ? await api.rejectRequirement(requirementId)
            : await api.deferRequirement(requirementId)

      setPlanningRequirements((current) =>
        current.map((requirement) =>
          requirement.id === updated.id ? updated : requirement,
        ),
      )
      const eventPage = await api.listPlanningEvents(activeThread.id)
      setPlanningEvents(eventPage.events)
    } catch (reason) {
      setComposerError(
        reason instanceof Error
          ? reason.message
          : 'Unable to record the requirement decision.',
      )
    } finally {
      setPlanningActionBusy(false)
    }
  }

  const planningMode =
    resolution?.resolved_intent ?? activeThread?.resolved_intent ?? null
  const officeTimeZone = activeThread?.timezone ?? localTimezone()
  const officeWorld = useMemo(
    () => officeWorldContext(officeClockNow, officeTimeZone),
    [officeClockNow, officeTimeZone],
  )
  const workspaceMembers = useMemo(
    () =>
      livingOfficeMembers(
        activeThread,
        planningTeam,
        profiles,
        officeNow,
        [],
        officeTimeZone,
      ),
    [activeThread, officeNow, officeTimeZone, planningTeam, profiles],
  )
  const selectedFloorMembers = workspaceMembers.filter(
    (member) => member.floor === selectedFloor,
  )
  const selectedFloorHasPlanning = selectedFloorMembers.some(
    (member) => member.truth === 'PLANNING',
  )
  const selectedFloorHasAmbient = selectedFloorMembers.some(
    (member) => member.truth === 'AMBIENT',
  )
  const ambientBehaviorLabels = [
    ...new Set(
      selectedFloorMembers
        .filter((member) => member.truth === 'AMBIENT')
        .map((member) => officeBehaviorLabel(member.behavior)),
    ),
  ]
  const ambientPresenceLabel =
    ambientBehaviorLabels.length > 0
      ? `${ambientBehaviorLabels.slice(0, 2).join(' + ')} · ambient`
      : 'Ambient'
  const remotePlanning =
    selectedFloor === 'strategy' &&
    Boolean(activeThread && planningTeam) &&
    !officeWorld.allowsPhysicalPlanningPresence &&
    Boolean(
      activeThread &&
        isPlanningPresenceFresh(
          activeThread.updated_at,
          officeClockNow,
          officeTimeZone,
        ),
    )
  const officePresenceLabel = selectedFloorHasPlanning
    ? selectedFloorHasAmbient
      ? `${activeThread?.status === 'AWAITING_USER' ? 'Waiting for you' : 'Planning'} + ambient`
      : `${activeThread?.status === 'AWAITING_USER' ? 'Waiting for you' : 'Planning'} presence`
    : selectedFloorHasAmbient
      ? ambientPresenceLabel
      : remotePlanning
        ? 'Planning remote · office closed'
        : 'Quiet floor · no presence'

  const changeOfficeFloor = (floor: OfficeFloorKey) => {
    setSelectedFloor(floor)
    setSelectedOfficeMemberId(null)
    const params = new URLSearchParams()
    if (selectedProjectId) params.set('project', selectedProjectId)
    params.set('floor', floor)
    navigate(`/office?${params.toString()}`)
  }

  const selectOfficeMember = (memberId: string) => {
    setSelectedOfficeMemberId((current) =>
      current === memberId ? null : memberId,
    )
  }

  return (
    <div
      className={`page-view office-workspace ${isMaximized ? 'office-maximized' : ''}`}
    >
      <OfficeCommandRail
        title="Agent Office"
        projectName={selectedProject?.name ?? 'No Project selected'}
        modeLabel={
          planningMode && planningMode !== 'AUTO'
            ? `Workspace · ${planningMode}`
            : 'Workspace'
        }
        statusLabel={
          isLoading
            ? 'Loading registries'
            : activeThread
              ? `${activeThread.status} planning thread`
              : 'Project workspace'
        }
        meta={
          registryError
            ? 'Registry degraded'
            : `${projects.length} Project${projects.length === 1 ? '' : 's'}`
        }
        actions={
          <>
            <AgentOfficeScopeSwitcher
              projectId={selectedProject?.id ?? null}
              runId={latestProjectRun?.id ?? null}
              activeScope="workspace"
              floor={selectedFloor}
            />
            {latestProjectRun && (
              <span
                className="office-command-meta"
                title={`Latest Run ${latestProjectRun.id}`}
              >
                Run {latestProjectRun.id.slice(0, 8)} · {latestProjectRun.status}
              </span>
            )}
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
        <OfficeRendererBoundary operationalHref="/overview">
          <OfficeScene
            stages={[]}
            agents={[]}
            profiles={profiles}
            selectedAgentId={selectedOfficeMemberId}
            onSelectAgent={selectOfficeMember}
            motionPaused={false}
            mode="live"
            replayNonce={0}
            replayStartedAt={null}
            replayRange={null}
            showRoster={false}
            presentation="workspace"
            floor={selectedFloor}
            workspaceMembers={workspaceMembers}
            onFloorChange={changeOfficeFloor}
            presenceLabel={officePresenceLabel}
            officeHour={Math.floor(officeWorld.localMinuteOfDay / 60)}
            worldContext={officeWorld}
            totalPresence={workspaceMembers.length}
          />
        </OfficeRendererBoundary>
      </div>

      <UniversalComposerShell
        key={`${selectedProjectId || 'unscoped'}:${activeThread?.id ?? 'new'}`}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onProjectChange={resetPlanningView}
        threads={planningThreads}
        selectedThreadId={activeThread?.id ?? ''}
        onThreadChange={openPlanningThread}
        isThreadLoading={isRestoringThread}
        executors={executors}
        selectedExecutorId={selectedExecutorId}
        contextLabel={
          registryError
            ? 'Registry data is degraded; planning may be unavailable.'
            : selectedProject
              ? `${selectedProject.repository.name} · ${selectedProject.default_branch}`
              : 'Register a Project before repository-scoped work.'
        }
        onSubmit={preparePlanning}
        isSubmitting={isPreparing}
        activeThread={activeThread}
        resolution={resolution}
        messages={messages}
        error={composerError}
      />

      <BottomOperationsDock
        key={activeThread?.id ?? 'idle-workspace'}
        events={[]}
        agents={[]}
        profiles={profiles}
        selectedAgentId={null}
        onSelectAgent={() => undefined}
        modeLabel={
          activeThread && planningMode
            ? `${planningMode} · ${activeThread.status}`
            : 'Workspace'
        }
        defaultState={activeThread ? 'normal' : 'collapsed'}
        forceCollapsed={isMaximized}
        planningThread={activeThread}
        planningTeam={planningTeam}
        planningArtifacts={planningArtifacts}
        planningRequirements={planningRequirements}
        planningEvents={planningEvents}
        onAcceptPlanningTeam={() => decideTeam('accept')}
        onRejectPlanningTeam={() => decideTeam('reject')}
        onResolvePlanningQuestion={resolvePlanningQuestion}
        onApproveRequirement={(requirementId) =>
          decideRequirement(requirementId, 'approve')
        }
        onRejectRequirement={(requirementId) =>
          decideRequirement(requirementId, 'reject')
        }
        onDeferRequirement={(requirementId) =>
          decideRequirement(requirementId, 'defer')
        }
        planningDecisionBusy={planningDecisionBusy}
        planningActionBusy={planningActionBusy}
      />

      <p className="office-workspace-note">
        Composer planning is durable and separate from operational Run truth.
        Implementation roles remain inactive until approved requirements pass the
        later execution-promotion gate.
      </p>
    </div>
  )
}
