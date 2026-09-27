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
  type Project,
  type RequirementCandidate,
  type TeamProposal,
} from '../api'
import { BottomOperationsDock } from '../components/office/BottomOperationsDock'
import { OfficeCommandRail } from '../components/office/OfficeCommandRail'
import {
  UniversalComposerShell,
  type ComposerSubmitPayload,
} from '../components/office/UniversalComposerShell'
import { OfficeRendererBoundary } from '../components/OfficeRendererBoundary'
import { OfficeScene } from '../components/OfficeScene'

function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function composerTitle(instruction: string): string {
  const compact = instruction.replace(/\s+/g, ' ').trim()
  return compact.length <= 96 ? compact : `${compact.slice(0, 93)}…`
}

export function OfficeWorkspacePage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [executors, setExecutors] = useState<Executor[]>([])
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isMaximized, setIsMaximized] = useState(false)
  const [registryError, setRegistryError] = useState<string | null>(null)

  const [activeThread, setActiveThread] = useState<ComposerThread | null>(null)
  const [resolution, setResolution] = useState<IntentResolution | null>(null)
  const [messages, setMessages] = useState<ComposerMessage[]>([])
  const [planningTeam, setPlanningTeam] = useState<TeamProposal | null>(null)
  const [planningArtifacts, setPlanningArtifacts] = useState<PlanningArtifact[]>([])
  const [planningRequirements, setPlanningRequirements] = useState<
    RequirementCandidate[]
  >([])
  const [isPreparing, setIsPreparing] = useState(false)
  const [planningDecisionBusy, setPlanningDecisionBusy] = useState(false)
  const [composerError, setComposerError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    Promise.all([
      api.listProjects(),
      api.listExecutors(),
      api.listAgentProfiles(),
    ])
      .then(([loadedProjects, loadedExecutors, loadedProfiles]) => {
        if (!active) return
        setProjects(loadedProjects)
        setExecutors(loadedExecutors)
        setProfiles(loadedProfiles)
        setSelectedProjectId((current) => {
          if (current && loadedProjects.some((project) => project.id === current)) {
            return current
          }
          return (
            loadedProjects.find((project) => project.status === 'ACTIVE')?.id ??
            loadedProjects[0]?.id ??
            ''
          )
        })
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
  }, [])

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
    setSelectedProjectId(projectId)
    setActiveThread(null)
    setResolution(null)
    setMessages([])
    setPlanningTeam(null)
    setPlanningArtifacts([])
    setPlanningRequirements([])
    setComposerError(null)
  }

  const preparePlanning = async (payload: ComposerSubmitPayload) => {
    if (!selectedProjectId) {
      setComposerError('Select a registered Project before starting project planning.')
      return
    }

    setIsPreparing(true)
    setComposerError(null)

    try {
      const thread = await api.createComposerThread({
        project_id: selectedProjectId,
        requested_intent: payload.intent,
        timezone: localTimezone(),
        title: composerTitle(payload.instruction),
        executor_id: payload.executorId,
      })
      const message = await api.postComposerMessage(thread.id, payload.instruction)
      const prepared: ComposerPreparation = await api.prepareComposerThread(thread.id)

      setActiveThread(prepared.thread)
      setResolution(prepared.resolution)
      setMessages([message])
      setPlanningTeam(prepared.team_proposal)
      setPlanningArtifacts(prepared.artifacts)
      setPlanningRequirements(prepared.requirements)
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

  const planningMode =
    resolution?.resolved_intent ?? activeThread?.resolved_intent ?? null

  return (
    <div
      className={`page-view office-workspace ${isMaximized ? 'office-maximized' : ''}`}
    >
      <OfficeCommandRail
        title="Office"
        projectName={selectedProject?.name ?? 'No Project selected'}
        modeLabel={planningMode ?? 'Workspace'}
        statusLabel={
          isLoading
            ? 'Loading registries'
            : activeThread
              ? `${activeThread.status} planning thread`
              : 'No active Run selected'
        }
        meta={
          registryError
            ? 'Registry degraded'
            : `${projects.length} Project${projects.length === 1 ? '' : 's'}`
        }
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setIsMaximized((current) => !current)}
          >
            {isMaximized ? 'Exit maximize' : 'Maximize'}
          </button>
        }
      />

      <div className="office-workspace-scene">
        <OfficeRendererBoundary operationalHref="/overview">
          <OfficeScene
            stages={[]}
            agents={[]}
            profiles={profiles}
            selectedAgentId={null}
            onSelectAgent={() => undefined}
            motionPaused={false}
            mode="live"
            replayNonce={0}
            replayStartedAt={null}
            replayRange={null}
            showRoster={false}
            presentation="workspace"
          />
        </OfficeRendererBoundary>
      </div>

      <UniversalComposerShell
        key={selectedProjectId || 'unscoped'}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onProjectChange={resetPlanningView}
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
        onAcceptPlanningTeam={() => decideTeam('accept')}
        onRejectPlanningTeam={() => decideTeam('reject')}
        planningDecisionBusy={planningDecisionBusy}
      />

      <p className="office-workspace-note">
        Composer planning is durable and separate from operational Run truth.
        Implementation roles remain inactive until approved requirements pass the
        later execution-promotion gate.
      </p>
    </div>
  )
}
