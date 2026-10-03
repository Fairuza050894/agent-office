import type { AgentProfile, AgentRun } from '../api'
import {
  type OfficeCharacterSource,
  type RuntimeAgent,
  type StationPlacement,
} from './character'
import {
  buildOfficePath,
  buildWorkspaceOfficePath,
  incidentPosition,
  waitingPosition,
} from './environment'
import {
  officeRoleHomeLocation,
  type OfficeFloorKey,
  type OfficePresenceMember,
  type OfficeZoneKey,
} from './livingOffice'
import { applyOfficeLaneSeparation } from './navigationPolicy'

export interface OfficeSceneMember extends OfficeCharacterSource {
  name: string
  zone?: OfficeZoneKey
  placementIndex?: number
  stageKey?: string
}

export function officeSceneMembers(
  agents: AgentRun[],
  profiles: AgentProfile[],
  workspaceMembers: OfficePresenceMember[],
  floor: OfficeFloorKey,
): OfficeSceneMember[] {
  const profileByKey = new Map(
    profiles.map((profile) => [profile.key, profile]),
  )
  const visibleWorkspaceMembers = workspaceMembers.filter(
    (member) => member.floor === floor,
  )

  return [
    ...agents.map((agent) => {
      const home = officeRoleHomeLocation(agent.agent_profile_key)
      return {
        id: agent.id,
        agent_profile_key: agent.agent_profile_key,
        name:
          profileByKey.get(agent.agent_profile_key)?.name ??
          agent.agent_profile_key,
        status: agent.status,
        stageKey: agent.stage_key,
        zone:
          floor !== 'build' && home.floor === floor
            ? home.zone
            : undefined,
      }
    }),
    ...visibleWorkspaceMembers.map((member) => ({
      id: member.id,
      agent_profile_key: member.agent_profile_key,
      name: member.name,
      status: member.status,
      behavior: member.behavior,
      zone: member.zone,
      placementIndex: member.placementIndex,
    })),
  ]
}

export function officeRuntimeStateTarget(
  runtime: RuntimeAgent,
  status: string,
  index: number,
): StationPlacement {
  switch (status.toUpperCase()) {
    case 'WAITING':
      return {
        position: waitingPosition(index),
        yaw: Math.PI * 0.5,
      }
    case 'BLOCKED':
    case 'FAILED':
      return {
        position: incidentPosition(index),
        yaw: Math.PI * 0.5,
      }
    default:
      return {
        position: runtime.station.clone(),
        yaw: runtime.stationYaw,
      }
  }
}

export function moveOfficeRuntime(
  runtime: RuntimeAgent,
  target: StationPlacement,
  workspaceFloor?: OfficeFloorKey,
): void {
  runtime.target.copy(target.position)
  runtime.targetYaw = target.yaw

  if (workspaceFloor) {
    const semanticPath = buildWorkspaceOfficePath(
      runtime.root.position,
      target.position,
      workspaceFloor,
    )
    runtime.path = applyOfficeLaneSeparation(
      semanticPath,
      runtime.agentId,
      workspaceFloor,
    )
  } else {
    runtime.path = buildOfficePath(runtime.root.position, target.position)
  }

  runtime.moving = runtime.path.length > 0
}
