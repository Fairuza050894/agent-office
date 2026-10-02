import { useEffect, useMemo, useRef, useState } from 'react'

import {
  api,
  type AgentProfile,
  type AgentRun,
  type ComposerMessage,
  type ComposerPreparation,
  type ComposerThread,
  type CreateTaskRequest,
  type Executor,
  type IntentResolution,
  type PlanningArtifact,
  type PlanningEvent,
  type Project,
  type RequirementCandidate,
  type Run,
  type Task,
  type TeamProposal,
} from '../api'
import { BottomOperationsDock } from '../components/office/BottomOperationsDock'
import { ContextualOperationsRail } from '../components/office/ContextualOperationsRail'
import { OfficeCommandRail } from '../components/office/OfficeCommandRail'
import { AgentOfficeScopeSwitcher } from '../components/office/AgentOfficeScopeSwitcher'
import {
  UniversalComposerShell,
  type ComposerSubmitPayload,
} from '../components/office/UniversalComposerShell'
import { CreateTaskModal } from '../components/CreateTaskModal'
import { OfficeRendererBoundary } from '../components/OfficeRendererBoundary'
import { OfficeScene } from '../components/OfficeScene'
import { useRouter } from '../router/useRouter'
import {
  livingOfficeMembers,
  officeAmbientWindow,
  officeFloorFromParam,
  officeBehaviorLabel,
  officePresenceStatusLabel,
  type OfficeFloorKey,
  type OfficeWorkAssignment,
} from '../office3d/livingOffice'
import {
  isPlanningPresenceFresh,
  officeWorldContext,
} from '../office3d/officeWorld'
import { officeDioramaDebugConfig } from '../office3d/dioramaDebug'

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
  const dioramaDebug = useMemo(
    () =>
      import.meta.env.DEV
        ? officeDioramaDebugConfig(currentSearch, true)
        : null,
    [currentSearch],
  )
  const requestedProjectId = useMemo(
    () => new URLSearchParams(currentSearch).get('project'),
    [currentSearch],
  )
  const requestedFloor = useMemo(
    () => officeFloorFromParam(new URLSearchParams(currentSearch).get('floor')),
    [currentSearch],
  )
  const requestedFloorRef = useRef<OfficeFloorKey | null>(requestedFloor)
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
  const [projectRuns, setProjectRuns] = useState<Run[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [workAssignments, setWorkAssignments] = useState<OfficeWorkAssignment[]>([])
  const [taskActionBusy, setTaskActionBusy] = useState(false)
  const [taskActionMessage, setTaskActionMessage] = useState<string | null>(null)
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false)
  const [contextCollapsed, setContextCollapsed] = useState(false)

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
    requestedFloorRef.current = requestedFloor
  }, [requestedFloor])

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

    Promise.allSettled([
      api.listProjects(),
      api.listExecutors(),
      api.listAgentProfiles(),
    ]).then(([projectResult, executorResult, profileResult]) => {
      if (!active) return

      const loadedProjects =
        projectResult.status === 'fulfilled' ? projectResult.value : []
      const loadedExecutors =
        executorResult.status === 'fulfilled' ? executorResult.value : []
      const loadedProfiles =
        profileResult.status === 'fulfilled' ? profileResult.value : []
      const failedRegistries = [
        projectResult.status === 'rejected' ? 'Projects unavailable' : null,
        executorResult.status === 'rejected' ? 'Executors unavailable' : null,
        profileResult.status === 'rejected' ? 'Agent profiles unavailable' : null,
      ].filter((label): label is string => label !== null)

      const requestedProject = requestedProjectId
        ? loadedProjects.find(
            (project) =>
              project.id === requestedProjectId &&
              project.status === 'ACTIVE',
          )
        : undefined
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
      setRegistryError(
        failedRegistries.length > 0 ? failedRegistries.join(' · ') : null,
      )
      setIsLoading(false)
    })

    return () => {
      active = false
    }
  }, [requestedProjectId])

  useEffect(() => {
    let active = true

    if (!selectedProjectId) {
      return () => {
        active = false
      }
    }

    let refreshing = false
    const loadLatestRun = async () => {
      if (refreshing) return
      refreshing = true
      try {
        const loadedTasks = await api.listTasks(selectedProjectId)
        const runGroups = await Promise.all(
          loadedTasks.map((task) => api.listRuns(task.id)),
        )
        const allRuns = runGroups.flat()
        const activeRuns = allRuns.filter(
          (run) =>
            !['COMPLETED', 'FAILED', 'CANCELLED'].includes(
              run.status.toUpperCase(),
            ),
        )
        const agentRunGroups = await Promise.all(
          activeRuns.map(async (run) => {
            try {
              return {
                run,
                agents: await api.getRunAgents(run.id),
              }
            } catch {
              return { run, agents: [] as AgentRun[] }
            }
          }),
        )
        if (!active) return

        const taskById = new Map(loadedTasks.map((task) => [task.id, task]))
        const assignments: OfficeWorkAssignment[] = agentRunGroups.flatMap(
          ({ run, agents }) => {
            const task = taskById.get(run.task_id)
            if (!task) return []

            return agents
              .filter(
                (agent) =>
                  !['COMPLETED', 'FAILED', 'CANCELLED'].includes(
                    agent.status.toUpperCase(),
                  ),
              )
              .map((agent) => ({
                taskId: task.id,
                taskTitle: task.title,
                runId: run.id,
                runStatus: run.status,
                agentRunId: agent.id,
                agentRunStatus: agent.status,
                agentProfileKey: agent.agent_profile_key,
                stageKey: agent.stage_key,
                updatedAt: agent.updated_at,
              }))
          },
        )

        setTasks(loadedTasks)
        setProjectRuns(allRuns)
        setWorkAssignments(assignments)
        const latest =
          allRuns
            .slice()
            .sort((left, right) =>
              right.updated_at.localeCompare(left.updated_at),
            )[0] ?? null
        setLatestProjectRun(latest)
      } catch {
        if (active) {
          setTasks([])
          setProjectRuns([])
          setWorkAssignments([])
          setLatestProjectRun(null)
        }
      } finally {
        refreshing = false
      }
    }

    void loadLatestRun()
    const timer = window.setInterval(() => {
      void loadLatestRun()
    }, 15_000)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [selectedProjectId])

  useEffect(() => {
    if (!requestedFloor) return

    let active = true
    void Promise.resolve().then(() => {
      if (!active) return
      setSelectedFloor(requestedFloor)
      setSelectedOfficeMemberId(null)
    })

    return () => {
      active = false
    }
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
          if (!requestedFloorRef.current) {
            setSelectedFloor(
              officeAmbientWindow(new Date(), [], localTimezone()).floor,
            )
          }
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
        if (!requestedFloorRef.current) {
          setSelectedFloor(initialFloorForThread(latest, snapshot.team))
        }
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

  const createWorkspaceTask = async (
    payload: { title: string; objective: string },
  ): Promise<Task | null> => {
    if (!selectedProjectId) {
      setTaskActionMessage('Select a Project before creating a Task.')
      return null
    }

    setTaskActionBusy(true)
    setTaskActionMessage(null)
    try {
      const created = await api.createTask(selectedProjectId, {
        title: payload.title,
        objective: payload.objective,
        requested_executor_id: activeThread?.executor_id ?? selectedExecutorId,
        requested_workflow_id: activeThread?.workflow_id ?? null,
      })
      setTasks((current) => [
        created,
        ...current.filter((task) => task.id !== created.id),
      ])
      setTaskActionMessage(`Task ${created.id.slice(0, 8)} created. Execution is still gated by the canonical Run workflow.`)
      return created
    } catch (reason) {
      setTaskActionMessage(
        reason instanceof Error ? reason.message : 'Unable to create Task.',
      )
      return null
    } finally {
      setTaskActionBusy(false)
    }
  }

  const createTaskFromModal = async (
    projectId: string,
    data: CreateTaskRequest,
  ): Promise<Task> => {
    const created = await api.createTask(projectId, data)
    setTasks((current) => [
      created,
      ...current.filter((task) => task.id !== created.id),
    ])
    setTaskActionMessage(
      `Task ${created.id.slice(0, 8)} created. Execution remains gated by canonical Run promotion.`,
    )
    return created
  }

  const createTaskFromApprovedRequirements = async () => {
    const approved = planningRequirements.filter(
      (requirement) => requirement.status === 'APPROVED',
    )
    if (approved.length === 0) {
      setTaskActionMessage('Approve at least one RequirementCandidate first.')
      return
    }

    const title =
      approved.length === 1
        ? approved[0].title
        : activeThread?.title ?? 'Approved planning scope'
    const objective = approved
      .map((requirement) => requirement.requirement)
      .join('\n')
    const acceptance = approved
      .map((requirement) => requirement.acceptance_hint)
      .filter((value): value is string => Boolean(value))
      .join(' · ')

    const created = await createWorkspaceTask({
      title,
      objective,
    })

    if (created && acceptance) {
      setTaskActionMessage(
        `Task created from ${approved.length} approved requirement${approved.length === 1 ? '' : 's'}. Acceptance: ${acceptance}`,
      )
    }
  }

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
    setTaskActionMessage(null)
    setTasks([])
    setProjectRuns([])
    setWorkAssignments([])
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
  const effectiveOfficeNow = dioramaDebug?.now ?? officeNow
  const effectiveOfficeClockNow = dioramaDebug?.now ?? officeClockNow
  const officeTimeZone =
    dioramaDebug?.timeZone ?? activeThread?.timezone ?? localTimezone()
  const officeWorld = useMemo(
    () => officeWorldContext(effectiveOfficeClockNow, officeTimeZone),
    [effectiveOfficeClockNow, officeTimeZone],
  )
  const workspaceMembers = useMemo(
    () =>
      dioramaDebug?.members ??
      livingOfficeMembers(
        activeThread,
        planningTeam,
        profiles,
        effectiveOfficeNow,
        [],
        officeTimeZone,
        workAssignments,
      ),
    [
      activeThread,
      dioramaDebug,
      effectiveOfficeNow,
      officeTimeZone,
      planningTeam,
      profiles,
      workAssignments,
    ],
  )
  const selectedFloorMembers = workspaceMembers.filter(
    (member) => member.floor === selectedFloor,
  )
  const selectedOfficeMember =
    workspaceMembers.find((member) => member.id === selectedOfficeMemberId) ?? null
  const selectedFloorHasWork = selectedFloorMembers.some(
    (member) => member.truth === 'WORK',
  )
  const selectedFloorWorkCount = selectedFloorMembers.filter(
    (member) => member.truth === 'WORK',
  ).length
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
          effectiveOfficeClockNow,
          officeTimeZone,
        ),
    )
  const officePresenceLabel = selectedFloorHasWork
    ? `${selectedFloorWorkCount} working${selectedFloorHasPlanning ? ' + planning' : ''}${selectedFloorHasAmbient ? ' + ambient' : ''}`
    : selectedFloorHasPlanning
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
    if (import.meta.env.DEV && dioramaDebug) {
      params.set('fixture', dioramaDebug.fixture)
      params.set('debugTime', dioramaDebug.debugTime)
      params.set('pilot', dioramaDebug.pilot)
      params.set('renderer', dioramaDebug.renderer)
    }
    navigate(`/office?${params.toString()}`)
  }

  const selectOfficeMember = (memberId: string) => {
    setSelectedOfficeMemberId((current) =>
      current === memberId ? null : memberId,
    )
  }

  return (
    <div
      className={`page-view office-workspace office-structure-v2 ${isMaximized ? 'office-maximized' : ''}`}
    >
      {import.meta.env.DEV && dioramaDebug && (
        <div
          className="office-workspace-note office-live-state"
          data-office-diorama-debug="simulated"
          role="status"
        >
          <strong>Simulated</strong>
          <span>
            Development-only Diorama fixture · {dioramaDebug.pilot === 'kit' ? 'Kenney kit pilot' : 'primitive control'} · frozen {officeWorld.clockLabel} · {officeWorld.timeZoneLabel}
          </span>
        </div>
      )}

      <OfficeCommandRail
        title="Agent Office"
        projectName={
          import.meta.env.DEV && dioramaDebug
            ? 'Office Diorama fixture'
            : selectedProject?.name ?? 'No Project selected'
        }
        modeLabel={
          import.meta.env.DEV && dioramaDebug
            ? dioramaDebug.pilot === 'kit'
              ? 'SIMULATED · KIT PILOT'
              : 'SIMULATED · PRIMITIVE'
            : planningMode ?? undefined
        }
        statusLabel={
          import.meta.env.DEV && dioramaDebug
            ? `${workspaceMembers.length} simulated ambient roles`
            : isLoading
              ? 'Loading registries'
              : workAssignments.length > 0
              ? `${workAssignments.length} active work assignment${workAssignments.length === 1 ? '' : 's'}`
              : activeThread
                ? `${activeThread.status} planning thread`
                : 'Planning workspace'
        }
        meta={
          import.meta.env.DEV && dioramaDebug
            ? 'Development-only visual evidence'
            : registryError
              ? `Registry degraded · ${registryError}`
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
              onClick={() => setIsCreateTaskOpen(true)}
              disabled={projects.length === 0}
            >
              + Task
            </button>
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
          <OfficeRendererBoundary operationalHref="/overview">
            <OfficeScene
              stages={[]}
              agents={[]}
              profiles={profiles}
              selectedAgentId={selectedOfficeMemberId}
              onSelectAgent={selectOfficeMember}
              motionPaused={Boolean(dioramaDebug)}
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
              dioramaPilot={dioramaDebug?.pilot}
              dioramaRenderer={dioramaDebug?.renderer}
            />
          </OfficeRendererBoundary>
        </div>

        <ContextualOperationsRail
          eyebrow={
            selectedOfficeMember
              ? selectedOfficeMember.truth === 'WORK'
                ? 'Canonical work presence'
                : selectedOfficeMember.truth === 'PLANNING'
                  ? 'Planning role'
                  : 'Ambient office presence'
              : 'Planning workspace'
          }
          title={
            selectedOfficeMember?.name ??
            selectedProject?.name ??
            'Agent Office'
          }
          status={
            selectedOfficeMember
              ? `${officePresenceStatusLabel(selectedOfficeMember.status)} · ${selectedOfficeMember.zone.replaceAll('-', ' ')}`
              : activeThread
                ? `${activeThread.status} · ${planningMode ?? 'PLANNING'}`
                : 'No active planning thread'
          }
          collapsed={contextCollapsed}
          onToggleCollapsed={() => setContextCollapsed((current) => !current)}
          discussion={
            <div className="office-context-stack">
              {selectedOfficeMember &&
                selectedOfficeMember.truth === 'WORK' && (
                  <div className="office-context-callout">
                    <strong>
                      {selectedOfficeMember.taskTitle ??
                        selectedOfficeMember.taskId ??
                        'Canonical work assignment'}
                    </strong>
                    <span>
                      {officePresenceStatusLabel(selectedOfficeMember.status)}
                      {' · '}
                      {selectedOfficeMember.stageKey ?? 'Unknown stage'}
                      {' · Run '}
                      {selectedOfficeMember.runId?.slice(0, 8) ?? 'Unavailable'}
                    </span>
                  </div>
                )}
              {selectedOfficeMember &&
                selectedOfficeMember.truth === 'WORK' &&
                ['LUNCH', 'COFFEE_BREAK'].includes(officeWorld.mode) &&
                selectedOfficeMember.status === 'WORKING' && (
                  <div className="office-context-callout">
                    <strong>Break window is open, but execution is still active.</strong>
                    <span>
                      Agent Office keeps this role at work because the canonical AgentRun has not reached a safe waiting/checkpoint state. No executor pause is being fabricated.
                    </span>
                  </div>
                )}
              {selectedOfficeMember && selectedOfficeMember.truth === 'AMBIENT' && (
                <div className="office-context-callout">
                  <strong>Ambient presence is not an active agent.</strong>
                  <span>
                    Start or reopen a planning thread before treating this role as project work.
                  </span>
                </div>
              )}
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
                  selectedOfficeMember?.truth === 'PLANNING'
                    ? `Role focus · ${selectedOfficeMember.name}`
                    : registryError
                      ? `Registry degraded: ${registryError}. Available registries remain usable.`
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
              {planningRequirements.some((requirement) => requirement.status === 'APPROVED') && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm office-context-wide-action"
                  disabled={taskActionBusy}
                  onClick={() => void createTaskFromApprovedRequirements()}
                >
                  Create task from approved requirements
                </button>
              )}
              {taskActionMessage && (
                <span className="office-context-feedback" role="status">
                  {taskActionMessage}
                </span>
              )}
            </div>
          }
          details={
            selectedProject || selectedOfficeMember || activeThread || tasks.length > 0 || latestProjectRun ? (
            <div className="office-context-stack">
              <dl className="office-context-facts">
                <div><dt>Project</dt><dd>{selectedProject?.name ?? 'Unavailable'}</dd></div>
                <div><dt>Repository</dt><dd>{selectedProject?.repository.name ?? 'Unavailable'}</dd></div>
                <div><dt>Branch</dt><dd>{selectedProject?.default_branch ?? 'Unavailable'}</dd></div>
                <div><dt>Thread</dt><dd>{activeThread ? activeThread.id.slice(0, 8) : 'None'}</dd></div>
                <div><dt>Tasks</dt><dd>{tasks.length}</dd></div>
                <div><dt>Latest Run</dt><dd>{latestProjectRun ? `${latestProjectRun.id.slice(0, 8)} · ${latestProjectRun.status}` : 'None'}</dd></div>
              </dl>
              {selectedOfficeMember && (
                <div className="office-context-callout">
                  <strong>{selectedOfficeMember.name}</strong>
                  <span>
                    {selectedOfficeMember.truth} · {officePresenceStatusLabel(selectedOfficeMember.status)} · {selectedOfficeMember.zone.replaceAll('-', ' ')}
                  </span>
                  {selectedOfficeMember.truth === 'WORK' && (
                    <span>
                      Task {selectedOfficeMember.taskTitle ?? selectedOfficeMember.taskId} · Run {selectedOfficeMember.runId?.slice(0, 8)} · {selectedOfficeMember.stageKey}
                    </span>
                  )}
                </div>
              )}
            </div>
            ) : null
          }
          files={
            planningArtifacts.length > 0 ? (
            <div className="office-context-stack">
              {planningArtifacts.length === 0 ? (
                <div className="office-context-empty">No planning artifact exists in this thread.</div>
              ) : (
                planningArtifacts.map((artifact) => (
                  <article key={artifact.id} className="office-context-file">
                    <div><strong>{artifact.title}</strong><span>{artifact.artifact_type}</span></div>
                    <p>{artifact.status} · {artifact.author_role_key ?? 'system'}</p>
                  </article>
                ))
              )}
              <div className="office-context-callout">
                <strong>Preview/download boundary</strong>
                <span>
                  Planning artifacts are structured records, not filesystem artifacts. File preview/download will only be enabled when a bounded Artifact content endpoint exists.
                </span>
              </div>
            </div>
            ) : null
          }
          logs={
            planningEvents.length > 0 ? (
            <div className="office-context-log">
              {planningEvents.length === 0 ? (
                <div className="office-context-empty">No durable PlanningEvent is available.</div>
              ) : (
                planningEvents
                  .slice()
                  .sort((left, right) => right.sequence - left.sequence)
                  .map((event) => (
                    <article key={event.id}>
                      <time dateTime={event.occurred_at}>
                        {new Date(event.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </time>
                      <div>
                        <strong>{event.role_key ?? 'planning'}</strong>
                        <span>{event.event_type.replace(/[._-]+/g, ' ')}</span>
                      </div>
                    </article>
                  ))
              )}
            </div>
            ) : null
          }
        />
      </div>

      <BottomOperationsDock
        key={activeThread?.id ?? 'idle-workspace'}
        events={[]}
        agents={[]}
        profiles={profiles}
        selectedAgentId={null}
        onSelectAgent={() => undefined}
        tasks={tasks}
        runs={projectRuns}
        modeLabel={
          activeThread && planningMode
            ? `${planningMode} · ${activeThread.status}`
            : 'Planning'
        }
        defaultState="normal"
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

      {isCreateTaskOpen && (
        <CreateTaskModal
          key={`office-create-task-${selectedProjectId || 'all'}`}
          isOpen
          projects={projects}
          initialProjectId={selectedProjectId}
          onClose={() => setIsCreateTaskOpen(false)}
          onCreate={createTaskFromModal}
          onSuccess={() => setIsCreateTaskOpen(false)}
        />
      )}

      <p className="office-workspace-note">
        {workAssignments.length > 0
          ? 'Planning scope is projecting canonical Task / Run / AgentRun work alongside separate planning and ambient truth layers.'
          : 'Composer planning is durable and separate from operational Run truth. Implementation roles remain inactive until approved requirements pass the later execution-promotion gate.'}
      </p>
    </div>
  )
}
