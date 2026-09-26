import { useMemo } from 'react'

import type { AgentProfile, AgentRun, RunStage } from '../api'
import type { OfficeReplayRange } from '../office3d/replay'
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
}: OfficeSceneProps) {
  const profileByKey = useMemo(
    () => new Map(profiles.map((profile) => [profile.key, profile])),
    [profiles],
  )

  return (
    <section className="office-renderer" aria-label="Run office 3D projection">
      <div className="office-scene-heading">
        <div>
          <strong>Live office</strong>
          <span>
            Canonical AgentRun state · drag to orbit · right-drag to pan · wheel
            to zoom
          </span>
        </div>
        <span className="office-render-mode">
          {mode === 'replay'
            ? 'Historical replay · factual timestamps compressed'
            : 'Live state'}
        </span>
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
      />

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
    </section>
  )
}
