import { describe, expect, it } from 'vitest'

import type { AgentProfile, AgentRun } from '../api'
import type { OfficePresenceMember } from './livingOffice'
import { officeSceneMembers } from './runtimeProjection'

const profile: AgentProfile = {
  id: 'profile-1',
  key: 'backend-developer',
  name: 'Backend Developer',
  description: 'Backend role',
  role: 'IMPLEMENTER',
  status: 'ACTIVE',
  created_at: '2026-10-02T00:00:00Z',
  updated_at: '2026-10-02T00:00:00Z',
}

const agent: AgentRun = {
  id: 'agent-1',
  run_id: 'run-1',
  stage_key: 'IMPLEMENTATION',
  agent_profile_key: 'backend-developer',
  executor_id: 'executor-1',
  status: 'RUNNING',
  workspace_id: null,
  started_at: '2026-10-02T01:00:00Z',
  completed_at: null,
  created_at: '2026-10-02T01:00:00Z',
  updated_at: '2026-10-02T01:00:00Z',
}

const ambient: OfficePresenceMember = {
  id: 'ambient:architect',
  agent_profile_key: 'architect',
  name: 'Architect',
  status: 'AVAILABLE',
  behavior: 'DESK_FOCUS',
  floor: 'strategy',
  zone: 'planning-table',
  placementIndex: 0,
  truth: 'AMBIENT',
}

describe('officeSceneMembers', () => {
  it('projects operational and workspace members through one renderer-neutral shape', () => {
    const build = officeSceneMembers(
      [agent],
      [profile],
      [ambient],
      'build',
    )

    expect(build).toEqual([
      expect.objectContaining({
        id: 'agent-1',
        name: 'Backend Developer',
        status: 'RUNNING',
        stageKey: 'IMPLEMENTATION',
      }),
    ])

    const strategy = officeSceneMembers(
      [],
      [profile],
      [ambient],
      'strategy',
    )

    expect(strategy).toEqual([
      expect.objectContaining({
        id: 'ambient:architect',
        name: 'Architect',
        behavior: 'DESK_FOCUS',
        zone: 'planning-table',
      }),
    ])
  })
})
