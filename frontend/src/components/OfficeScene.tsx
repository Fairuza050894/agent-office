import { useMemo, useState } from 'react'

import type { AgentProfile, AgentRun, RunStage } from '../api'
import type { OfficeReplayRange } from '../office3d/replay'
import type { OfficeWorldContext } from '../office3d/officeWorld'
import {
  OFFICE_FLOORS,
  officeBehaviorLabel,
  type OfficeFloorKey,
  type OfficePresenceMember,
} from '../office3d/livingOffice'
import { officeAgentState } from '../officeProjection'
import { ThreeOfficeScene } from './ThreeOfficeScene'

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
}

function profileName(
  agent: AgentRun,
  profiles: Map<string, AgentProfile>,
): string {
  return profiles.get(agent.agent_profile_key)?.name ?? agent.agent_profile_key
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
  workspaceMembers = [],
  onFloorChange,
  presenceLabel = null,
  officeHour,
  worldContext = null,
  totalPresence = 0,
}: OfficeSceneProps) {
  const profileByKey = useMemo(
    () => new Map(profiles.map((profile) => [profile.key, profile])),
    [profiles],
  )
  const [cameraResetNonce, setCameraResetNonce] = useState(0)
  const selectedWorkspaceMember =
    presentation === 'workspace' && selectedAgentId
      ? workspaceMembers.find(
          (member) =>
            member.id === selectedAgentId && member.floor === floor,
        ) ?? null
      : null

  const changeFloor = (nextFloor: OfficeFloorKey) => {
    onFloorChange?.(nextFloor)
    setCameraResetNonce((current) => current + 1)
  }

  return (
    <section
      className="office-renderer"
      aria-label={
        presentation === 'workspace'
          ? 'Office workspace 3D environment'
          : 'Run office 3D projection'
      }
    >
      <div className="office-scene-heading">
        <div>
          <strong>
            {presentation === 'workspace' ? 'Office workspace' : 'Operational office'}
          </strong>
          <span>
            {presentation === 'workspace'
              ? 'No factual Run selected · drag to orbit · right-drag to pan · wheel to zoom'
              : 'Canonical AgentRun state · drag to orbit · right-drag to pan · wheel to zoom'}
          </span>
          {presentation === 'workspace' && worldContext && (
            <div className="office-world-hud" aria-label="Office world status">
              <span className="office-world-clock">{worldContext.clockLabel}</span>
              <span className="office-world-day">{worldContext.dayLabel}</span>
              <strong>{worldContext.modeLabel}</strong>
              <span>
                {totalPresence} present
                {' · '}
                next {worldContext.nextEventLabel.toLowerCase()} at{' '}
                {worldContext.nextEventTimeLabel}
              </span>
            </div>
          )}
        </div>
        <div className="office-scene-meta">
          {presentation === 'workspace' && onFloorChange && (
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
                </button>
              ))}
            </div>
          )}
          <span className="office-render-mode">
            {presentation === 'workspace'
              ? [
                  `${OFFICE_FLOORS.find((candidate) => candidate.key === floor)?.label ?? 'Office'} floor`,
                  presenceLabel,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : mode === 'replay'
                ? 'Historical replay · factual timestamps compressed'
                : 'Canonical state'}
          </span>
          {presentation === 'workspace' && (
            <button
              type="button"
              className="office-camera-reset"
              onClick={() => setCameraResetNonce((current) => current + 1)}
            >
              Reset view
            </button>
          )}
        </div>
      </div>

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
        officeHour={officeHour}
      />

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
                {selectedWorkspaceMember.truth === 'PLANNING'
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
