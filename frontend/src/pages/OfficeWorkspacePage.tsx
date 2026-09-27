import { useEffect, useMemo, useState } from 'react'

import {
  api,
  type AgentProfile,
  type Executor,
  type Project,
} from '../api'
import { BottomOperationsDock } from '../components/office/BottomOperationsDock'
import { OfficeCommandRail } from '../components/office/OfficeCommandRail'
import { UniversalComposerShell } from '../components/office/UniversalComposerShell'
import { OfficeRendererBoundary } from '../components/OfficeRendererBoundary'
import { OfficeScene } from '../components/OfficeScene'

export function OfficeWorkspacePage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [executors, setExecutors] = useState<Executor[]>([])
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isMaximized, setIsMaximized] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
          return loadedProjects.find((project) => project.status === 'ACTIVE')?.id ??
            loadedProjects[0]?.id ??
            ''
        })
        setError(null)
      })
      .catch((reason) => {
        if (!active) return
        setError(
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

  return (
    <div
      className={`page-view office-workspace ${isMaximized ? 'office-maximized' : ''}`}
    >
      <OfficeCommandRail
        title="Office"
        projectName={selectedProject?.name ?? 'No Project selected'}
        modeLabel="Workspace"
        statusLabel={isLoading ? 'Loading registries' : 'No active Run selected'}
        meta={
          error
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
        projects={projects}
        selectedProjectId={selectedProjectId}
        onProjectChange={setSelectedProjectId}
        executors={executors}
        selectedExecutorId={selectedExecutorId}
        contextLabel={
          error
            ? 'Registry data is degraded; composer actions remain unavailable.'
            : selectedProject
              ? `${selectedProject.repository.name} · ${selectedProject.default_branch}`
              : 'Register a Project before repository-scoped work.'
        }
      />

      <BottomOperationsDock
        events={[]}
        agents={[]}
        profiles={profiles}
        selectedAgentId={null}
        onSelectAgent={() => undefined}
        modeLabel="Workspace"
        defaultState="collapsed"
        forceCollapsed={isMaximized}
      />

      <p className="office-workspace-note">
        Phase 9A establishes the Office-first interaction shell only. No Ambient
        persona, planning record, or repository-changing action is created
        without later Phase 9 domain support.
      </p>
    </div>
  )
}
