import { describe, expect, it } from 'vitest'

import type {
  AgentProfile,
  ComposerThread,
  TeamProposal,
} from '../api'
import {
  OFFICE_FLOORS,
  ambientOfficeMembers,
  officeAmbientWindow,
  planningPresenceMembers,
} from './livingOffice'

const profiles: AgentProfile[] = [
  {
    id: 'pm',
    key: 'product-manager',
    name: 'Product Manager',
    description: 'Planning',
    default_access_mode: 'READ_ONLY',
    version: 1,
    status: 'ACTIVE',
  },
  {
    id: 'sa',
    key: 'system-analyst',
    name: 'System Analyst',
    description: 'Analysis',
    default_access_mode: 'READ_ONLY',
    version: 1,
    status: 'ACTIVE',
  },
  {
    id: 'be',
    key: 'backend-engineer',
    name: 'Backend Engineer',
    description: 'Backend',
    default_access_mode: 'WRITE',
    version: 1,
    status: 'ACTIVE',
  },
]

const thread: ComposerThread = {
  id: 'thread-1',
  project_id: 'project-1',
  requested_intent: 'PLAN',
  resolved_intent: 'PLAN',
  status: 'ACTIVE',
  title: 'Plan project',
  timezone: 'Asia/Jakarta',
  executor_id: null,
  workflow_id: null,
  created_at: '2026-09-27T08:00:00Z',
  updated_at: '2026-09-27T08:00:00Z',
  completed_at: null,
}

const proposal: TeamProposal = {
  id: 'team-1',
  thread_id: thread.id,
  phase: 'PLANNING',
  status: 'ACCEPTED',
  rationale_summary: 'Small planning cell.',
  created_at: '2026-09-27T08:00:00Z',
  decided_at: '2026-09-27T08:01:00Z',
  members: [
    {
      role_key: 'product-manager',
      disposition: 'INCLUDED',
      reason: 'Own scope.',
      order_hint: 0,
    },
    {
      role_key: 'system-analyst',
      disposition: 'INCLUDED',
      reason: 'Separate facts from assumptions.',
      order_hint: 1,
    },
    {
      role_key: 'backend-engineer',
      disposition: 'DEFERRED',
      reason: 'Implementation waits.',
      order_hint: 2,
    },
  ],
}

describe('living office model', () => {
  it('defines a multi-floor startup office', () => {
    expect(OFFICE_FLOORS.map((floor) => floor.key)).toEqual([
      'commons',
      'build',
      'strategy',
    ])
  })

  it('maps accepted planning roles to factual planning presence', () => {
    const members = planningPresenceMembers(thread, proposal, profiles)

    expect(members).toHaveLength(2)
    expect(members.every((member) => member.floor === 'strategy')).toBe(true)
    expect(members.every((member) => member.truth === 'PLANNING')).toBe(true)
    expect(members.map((member) => member.agent_profile_key)).not.toContain(
      'backend-engineer',
    )
  })

  it('maps an awaiting-user thread to a waiting presence state', () => {
    const members = planningPresenceMembers(
      { ...thread, status: 'AWAITING_USER' },
      proposal,
      profiles,
    )

    expect(members.every((member) => member.status === 'WAITING_USER')).toBe(true)
  })

  it('uses deterministic daytime ambient windows without claiming execution', () => {
    expect(officeAmbientWindow(new Date(2026, 8, 27, 15, 15)).key).toBe('coffee')

    const members = ambientOfficeMembers(
      profiles,
      new Date(2026, 8, 27, 15, 15),
    )

    expect(members.length).toBeGreaterThan(0)
    expect(members.every((member) => member.truth === 'AMBIENT')).toBe(true)
    expect(members.every((member) => member.status === 'COFFEE_BREAK')).toBe(true)
  })

  it('accepts provider-supplied scheduled ambience without hard-coded prayer times', () => {
    const now = new Date('2026-09-27T15:15:00+07:00')
    const scheduled = [
      {
        id: 'prayer-asr',
        label: 'Asr prayer window',
        startsAt: '2026-09-27T15:05:00+07:00',
        endsAt: '2026-09-27T15:35:00+07:00',
        floor: 'commons' as const,
        zone: 'quiet-room' as const,
        presence: 'PRAYER_BREAK' as const,
        priority: 80,
        maxParticipants: 2,
      },
    ]

    const window = officeAmbientWindow(now, scheduled)
    const members = ambientOfficeMembers(profiles, now, scheduled)

    expect(window.key).toBe('scheduled')
    expect(window.presence).toBe('PRAYER_BREAK')
    expect(window.zone).toBe('quiet-room')
    expect(
      members.filter((member) => member.status === 'PRAYER_BREAK'),
    ).toHaveLength(2)
    expect(
      members.filter((member) => member.zone === 'quiet-room'),
    ).toHaveLength(2)
    expect(members.some((member) => member.status !== 'PRAYER_BREAK')).toBe(true)
  })

  it('reduces ambient occupancy after hours instead of fabricating work', () => {
    const members = ambientOfficeMembers(
      profiles,
      new Date(2026, 8, 27, 22, 30),
    )

    expect(members).toHaveLength(2)
    expect(members.every((member) => member.status === 'SOCIAL_BREAK')).toBe(true)
  })
})
