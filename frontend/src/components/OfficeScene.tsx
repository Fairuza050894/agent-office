import {
  lazy,
  Suspense,
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react'

import type { AgentProfile, AgentRun, RunStage } from '../api'
import {
  officeCameraViews,
  type OfficeCameraView,
  type OfficeCameraViewKey,
} from '../office3d/camera'
import type { OfficeReplayRange } from '../office3d/replay'
import type { OfficeWorldContext } from '../office3d/officeWorld'
import {
  OFFICE_FLOORS,
  officeBehaviorLabel,
  type OfficeFloorKey,
  type OfficePresenceMember,
} from '../office3d/livingOffice'
import type {
  OfficeDioramaPilotMode,
  OfficeDioramaRendererMode,
} from '../office3d/dioramaDebug'
import { officeAgentState } from '../officeProjection'
import { OfficeSceneRendererBoundary } from './OfficeSceneRendererBoundary'
import { ThreeOfficeScene } from './ThreeOfficeScene'

const R3FOfficeScene = lazy(() => import('./R3FOfficeScene'))

export interface OfficeSceneProps {
  stages: RunStage[]
  agents: AgentRun[]
  profiles: AgentProfile[]
  selectedAgentId: string | null
  onSelectAgent: (agentId: string) => void
  motionPaused: boolean
  mode: 'live' | 'replay'
  replayNonce: number
  replayStartedAt: number | null
  replayRange: OfficeReplayRange | null
  showRoster?: boolean
  presentation?: 'operational' | 'workspace'
  floor?: OfficeFloorKey
  workspaceMembers?: OfficePresenceMember[]
  onFloorChange?: (floor: OfficeFloorKey) => void
  presenceLabel?: string | null
  officeHour?: number
  worldContext?: OfficeWorldContext | null
  totalPresence?: number
  operationalFloorCounts?: Record<OfficeFloorKey, number>
  dioramaPilot?: OfficeDioramaPilotMode
  dioramaRenderer?: OfficeDioramaRendererMode
}

const EMPTY_WORKSPACE_MEMBERS: OfficePresenceMember[] = []

function profileName(
  agent: AgentRun,
  profiles: Map<string, AgentProfile>,
): string {
  return profiles.get(agent.agent_profile_key)?.name ?? agent.agent_profile_key
}

function nextEventCountdown(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes))
  if (safeMinutes < 60) return `in ${safeMinutes}m`

  const hours = Math.floor(safeMinutes / 60)
  const remainingMinutes = safeMinutes % 60
  if (hours < 24) {
    return remainingMinutes > 0
      ? `in ${hours}h ${remainingMinutes}m`
      : `in ${hours}h`
  }

  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours > 0
    ? `in ${days}d ${remainingHours}h`
    : `in ${days}d`
}

interface SceneControlsProps {
  views: readonly [OfficeCameraView, OfficeCameraView, OfficeCameraView]
  activeView: OfficeCameraViewKey
  labelsVisible: boolean
  onSelectView: (view: OfficeCameraViewKey) => void
  onToggleLabels: () => void
}

function SceneControls({
  views,
  activeView,
  labelsVisible,
  onSelectView,
  onToggleLabels,
}: SceneControlsProps) {
  return (
    <details className="office-scene-controls">
      <summary>Controls</summary>
      <div className="office-scene-control-panel">
        <div className="office-camera-preset-group">
          <small>Camera</small>
          <div role="group" aria-label="Camera view">
            {views.map((view) => (
              <button
                key={view.key}
                type="button"
                className={view.key === activeView ? 'active' : ''}
                aria-pressed={view.key === activeView}
                aria-keyshortcuts={view.shortcut}
                onClick={() => onSelectView(view.key)}
              >
                <span>{view.label}</span>
                <kbd>{view.shortcut}</kbd>
              </button>
            ))}
          </div>
        </div>
        <div className="office-scene-control-hints">
          <span><kbd>1–3</kbd> snap view</span>
          <span><kbd>Click</kbd> focus agent</span>
          <span><kbd>Wheel</kbd> bounded zoom</span>
        </div>
        <button
          type="button"
          className="office-label-toggle"
          aria-pressed={labelsVisible}
          aria-keyshortcuts="L"
          onClick={onToggleLabels}
        >
          <span>Labels</span>
          <strong>{labelsVisible ? 'On' : 'Off'}</strong>
          <kbd>L</kbd>
        </button>
      </div>
    </details>
  )
}

export function OfficeScene({
  stages,
  agents,
  profiles,
  selectedAgentId,
  onSelectAgent,
  motionPaused,
  mode,
  replayNonce,
  replayStartedAt,
  replayRange,
  showRoster = true,
  presentation = 'operational',
  floor = 'build',
  workspaceMembers = EMPTY_WORKSPACE_MEMBERS,
  onFloorChange,
  officeHour,
  worldContext = null,
  totalPresence = 0,
  operationalFloorCounts,
  dioramaPilot,
  dioramaRenderer,
}: OfficeSceneProps) {
  const profileByKey = useMemo(
    () => new Map(profiles.map((profile) => [profile.key, profile])),
    [profiles],
  )
  const [cameraResetNonce, setCameraResetNonce] = useState(0)
  const [cameraView, setCameraView] = useState<OfficeCameraViewKey>('overview')
  const [labelsVisible, setLabelsVisible] = useState(true)
  const [floorTransition, setFloorTransition] = useState<{
    floor: OfficeFloorKey
    key: number
  } | null>(null)
  const selectedWorkspaceMember =
    presentation === 'workspace' && selectedAgentId
      ? workspaceMembers.find(
          (member) =>
            member.id === selectedAgentId && member.floor === floor,
        ) ?? null
      : null
  const workspaceHasCanonicalWork =
    presentation === 'workspace' &&
    workspaceMembers.some((member) => member.truth === 'WORK')
  const floorPresenceCount = useMemo(
    () =>
      OFFICE_FLOORS.reduce(
        (counts, candidate) => {
          counts[candidate.key] = workspaceMembers.filter(
            (member) => member.floor === candidate.key,
          ).length
          return counts
        },
        {
          commons: 0,
          build: 0,
          strategy: 0,
        } as Record<OfficeFloorKey, number>,
      ),
    [workspaceMembers],
  )

  const effectiveFloorCounts =
    presentation === 'workspace'
      ? floorPresenceCount
      : operationalFloorCounts ?? floorPresenceCount
  const cameraViews = officeCameraViews(floor)

  const selectCameraView = (nextView: OfficeCameraViewKey) => {
    setCameraView(nextView)
    setCameraResetNonce((current) => current + 1)
  }

  const resetCameraView = () => {
    setCameraView('overview')
    setCameraResetNonce((current) => current + 1)
  }

  const changeFloor = (nextFloor: OfficeFloorKey) => {
    if (nextFloor === floor) return

    setCameraView('overview')
    setFloorTransition((current) => ({
      floor: nextFloor,
      key: (current?.key ?? 0) + 1,
    }))
    onFloorChange?.(nextFloor)
    setCameraResetNonce((current) => current + 1)
  }

  const handleSceneKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return

    const target =
      event.target instanceof HTMLElement ? event.target : null
    if (
      target?.closest(
        'input, textarea, select, button, a, summary, [contenteditable="true"]',
      )
    ) {
      return
    }

    const requestedView = cameraViews.find(
      (candidate) => candidate.shortcut === event.key,
    )
    if (requestedView) {
      event.preventDefault()
      selectCameraView(requestedView.key)
      return
    }

    if (event.key.toLowerCase() === 'l') {
      event.preventDefault()
      setLabelsVisible((visible) => !visible)
    }
  }

  const activeFloor =
    OFFICE_FLOORS.find((candidate) => candidate.key === floor) ?? OFFICE_FLOORS[0]
  const rendererMode = dioramaRenderer ?? 'r3f'

  const threeRenderer = (
    <ThreeOfficeScene
      stages={stages}
      agents={agents}
      profiles={profiles}
      selectedAgentId={selectedAgentId}
      onSelectAgent={onSelectAgent}
      motionPaused={motionPaused}
      mode={mode}
      replayNonce={replayNonce}
      replayStartedAt={replayStartedAt}
      replayRange={replayRange}
      floor={floor}
      workspaceMembers={workspaceMembers}
      cameraResetNonce={cameraResetNonce}
      cameraView={cameraView}
      labelsVisible={labelsVisible}
      officeHour={officeHour}
      officeMode={worldContext?.mode ?? null}
      dioramaPilot={dioramaPilot}
    />
  )

  return (
    <section
      className="office-renderer"
      onKeyDown={handleSceneKeyDown}
      aria-label={
        presentation === 'workspace'
          ? 'Planning office 3D environment'
          : 'Agent Office operational 3D projection'
      }
    >
      <div
        className={`office-scene-heading ${
          presentation === 'workspace' ? 'office-scene-heading-workspace' : ''
        }`}
      >
        {presentation === 'workspace' ? (
          <>
            <div className="office-scene-context">
              <div className="office-scene-title-group">
                <strong>Planning Office</strong>
                <span>
                  {workspaceHasCanonicalWork
                    ? 'Planning office view · Canonical work active'
                    : 'Planning office view · No canonical work active'}
                </span>
              </div>
              <SceneControls
                views={cameraViews}
                activeView={cameraView}
                labelsVisible={labelsVisible}
                onSelectView={selectCameraView}
                onToggleLabels={() => setLabelsVisible((visible) => !visible)}
              />
            </div>

            {worldContext && (
              <div
                className={`office-world-hud mode-${worldContext.mode.toLowerCase()}`}
                aria-label="Office world status"
              >
                <div className="office-world-stat office-world-clock-card">
                  <span>Local time</span>
                  <strong>{worldContext.clockLabel}</strong>
                  <small>
                    {worldContext.timeZoneLabel} · {worldContext.dayLabel}
                  </small>
                </div>
                <div className="office-world-stat">
                  <span>Office mode</span>
                  <strong>{worldContext.modeLabel}</strong>
                  <small title={worldContext.occupancyExplanation}>
                    {worldContext.lifecycleLabel}
                  </small>
                </div>
                <div className="office-world-stat">
                  <span>Presence</span>
                  <strong>{totalPresence} in office</strong>
                  <small>
                    Ambient cap {worldContext.ambientOccupancyCap} · all floors
                  </small>
                </div>
                <div className="office-world-stat office-world-next">
                  <span>Next</span>
                  <strong>{worldContext.nextEventLabel}</strong>
                  <small>
                    {worldContext.nextEventTimeLabel}
                    {' · '}
                    {nextEventCountdown(worldContext.minutesUntilNextEvent)}
                  </small>
                </div>
              </div>
            )}

            <div className="office-scene-navigation office-scene-navigation-workspace">
              {onFloorChange && (
                <div
                  className="office-floor-switcher office-floor-switcher-workspace"
                  role="group"
                  aria-label="Office floor"
                >
                  {OFFICE_FLOORS.map((candidate) => (
                    <button
                      key={candidate.key}
                      type="button"
                      className={candidate.key === floor ? 'active' : ''}
                      aria-pressed={candidate.key === floor}
                      title={`${candidate.label} · ${candidate.purpose}`}
                      onClick={() => changeFloor(candidate.key)}
                    >
                      <span className="office-floor-chip-code">
                        {candidate.shortLabel}
                      </span>
                      <strong className="office-floor-chip-name">
                        {candidate.label}
                      </strong>
                      <em
                        className="office-floor-chip-count"
                        aria-label={`${effectiveFloorCounts[candidate.key]} present`}
                      >
                        {effectiveFloorCounts[candidate.key]}
                      </em>
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="office-camera-reset"
                onClick={resetCameraView}
              >
                Reset view
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="office-scene-context">
              <div className="office-scene-title-group">
                <strong>{activeFloor.label}</strong>
                <span>
                  {mode === 'replay'
                    ? 'Historical Run / AgentRun replay'
                    : 'Live canonical Run / AgentRun projection'}
                </span>
              </div>
              <SceneControls
                views={cameraViews}
                activeView={cameraView}
                labelsVisible={labelsVisible}
                onSelectView={selectCameraView}
                onToggleLabels={() => setLabelsVisible((visible) => !visible)}
              />
            </div>
            <div className="office-scene-navigation">
              {onFloorChange && (
                <div className="office-floor-switcher" aria-label="Office floor">
                  {OFFICE_FLOORS.map((candidate) => (
                    <button
                      key={candidate.key}
                      type="button"
                      className={candidate.key === floor ? 'active' : ''}
                      aria-pressed={candidate.key === floor}
                      title={`${candidate.label} · ${candidate.purpose}`}
                      onClick={() => changeFloor(candidate.key)}
                    >
                      <span>{candidate.shortLabel}</span>
                      <strong>{candidate.label}</strong>
                      <em aria-label={`${effectiveFloorCounts[candidate.key]} present`}>
                        {effectiveFloorCounts[candidate.key]}
                      </em>
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="office-camera-reset"
                onClick={resetCameraView}
              >
                Reset view
              </button>
            </div>
          </>
        )}
      </div>

      {rendererMode === 'three' ? (
        threeRenderer
      ) : (
        <OfficeSceneRendererBoundary
          resetKey={[
            presentation,
            mode,
            floor,
            replayNonce,
          ].join(':')}
          fallback={threeRenderer}
        >
          <Suspense
            fallback={
              <div className="office-three-host office-three-fallback" role="status">
                Loading Office renderer…
              </div>
            }
          >
            <R3FOfficeScene
              stages={stages}
              agents={agents}
              profiles={profiles}
              selectedAgentId={selectedAgentId}
              onSelectAgent={onSelectAgent}
              motionPaused={motionPaused}
              mode={mode}
              replayNonce={replayNonce}
              replayStartedAt={replayStartedAt}
              replayRange={replayRange}
              floor={floor}
              workspaceMembers={workspaceMembers}
              cameraResetNonce={cameraResetNonce}
              cameraView={cameraView}
              officeHour={officeHour ?? new Date().getHours()}
              officeMode={worldContext?.mode ?? null}
              dioramaPilot={dioramaPilot}
              labelsVisible={labelsVisible}
            />
          </Suspense>
        </OfficeSceneRendererBoundary>
      )}

      {floorTransition && (
        <div
          key={floorTransition.key}
          className="office-floor-transition-cue"
          aria-hidden="true"
        >
          <span>
            {OFFICE_FLOORS.find(
              (candidate) => candidate.key === floorTransition.floor,
            )?.shortLabel}
          </span>
          <strong>
            {OFFICE_FLOORS.find(
              (candidate) => candidate.key === floorTransition.floor,
            )?.label}
          </strong>
        </div>
      )}

      {selectedWorkspaceMember && (
        <aside
          className="office-member-inspector"
          aria-label="Office member inspector"
        >
          <div className="office-member-inspector-head">
            <div>
              <strong>{selectedWorkspaceMember.name}</strong>
              <span>{officeBehaviorLabel(selectedWorkspaceMember.behavior)}</span>
            </div>
            <button
              type="button"
              aria-label="Close office member inspector"
              onClick={() => onSelectAgent(selectedWorkspaceMember.id)}
            >
              ×
            </button>
          </div>
          <dl>
            <div>
              <dt>Role</dt>
              <dd>{selectedWorkspaceMember.agent_profile_key}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>
                {OFFICE_FLOORS.find(
                  (candidate) => candidate.key === selectedWorkspaceMember.floor,
                )?.label ?? selectedWorkspaceMember.floor}
                {' · '}
                {selectedWorkspaceMember.zone.replaceAll('-', ' ')}
              </dd>
            </div>
            <div>
              <dt>Truth</dt>
              <dd>
                {selectedWorkspaceMember.truth === 'WORK'
                  ? 'Canonical Run / AgentRun work'
                  : selectedWorkspaceMember.truth === 'PLANNING'
                    ? 'Planning truth'
                    : 'Ambient presentation'}
              </dd>
            </div>
          </dl>
        </aside>
      )}

      {showRoster && (
        <div className="office-agent-roster" aria-label="AgentRun roster">
          {agents.length === 0 ? (
            <span className="office-agent-roster-empty">
              No AgentRuns instantiated for this Run.
            </span>
          ) : (
            agents.map((agent) => {
              const state = officeAgentState(agent.status)
              return (
                <button
                  key={agent.id}
                  type="button"
                  className={`office-agent-button ${selectedAgentId === agent.id ? 'selected' : ''}`}
                  aria-label={`${profileName(agent, profileByKey)}, ${state.label}`}
                  aria-pressed={selectedAgentId === agent.id}
                  onClick={() => onSelectAgent(agent.id)}
                >
                  <span
                    className={`office-roster-dot state-${state.key}`}
                    aria-hidden="true"
                  />
                  <span>{profileName(agent, profileByKey)}</span>
                  <small>{state.label}</small>
                </button>
              )
            })
          )}
        </div>
      )}
    </section>
  )
}
