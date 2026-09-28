import { describe, expect, it } from 'vitest'

import type {
  AgentProfile,
  ComposerThread,
  TeamProposal,
} from '../api'
import {
  OFFICE_AMBIENT_ZONE_CAPACITY,
  OFFICE_FLOORS,
  ambientOfficeMembers,
  officeAmbientWindow,
  officeBehaviorFor,
  officeBehaviorLabel,
  planningPresenceMembers,
  livingOfficeMembers,
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

const extendedProfiles: AgentProfile[] = [
  ...profiles,
  {
    id: 'pe',
    key: 'principal-engineer',
    name: 'Principal Engineer',
    description: 'Architecture',
    default_access_mode: 'READ_ONLY',
    version: 1,
    status: 'ACTIVE',
  },
  {
    id: 'pd',
    key: 'product-designer',
    name: 'Product Designer',
    description: 'Design',
    default_access_mode: 'READ_ONLY',
    version: 1,
    status: 'ACTIVE',
  },
  {
    id: 'fe',
    key: 'frontend-engineer',
    name: 'Frontend Engineer',
    description: 'Frontend',
    default_access_mode: 'WRITE',
    version: 1,
    status: 'ACTIVE',
  },
  {
    id: 'qa',
    key: 'qa-engineer',
    name: 'QA Engineer',
    description: 'Quality',
    default_access_mode: 'READ_ONLY',
    version: 1,
    status: 'ACTIVE',
  },
  {
    id: 'sr',
    key: 'security-reviewer',
    name: 'Security Reviewer',
    description: 'Security',
    default_access_mode: 'READ_ONLY',
    version: 1,
    status: 'ACTIVE',
  },
  {
    id: 'tw',
    key: 'technical-writer',
    name: 'Technical Writer',
    description: 'Documentation',
    default_access_mode: 'READ_ONLY',
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

  it('keeps the commons visibly occupied during wrap-up without claiming work', () => {
    const members = ambientOfficeMembers(
      profiles,
      new Date(2026, 8, 28, 16, 15),
    )

    const commons = members.filter((member) => member.floor === 'commons')
    expect(commons.length).toBeGreaterThan(0)
    expect(commons.every((member) => member.truth === 'AMBIENT')).toBe(true)
    expect(commons.every((member) => member.status === 'AVAILABLE')).toBe(true)
  })

  it('keeps non-planning roles as ambient presence during an active planning thread', () => {
    const members = livingOfficeMembers(
      thread,
      proposal,
      profiles,
      new Date(2026, 8, 28, 23, 0),
    )

    const planning = members.filter((member) => member.truth === 'PLANNING')
    const ambient = members.filter((member) => member.truth === 'AMBIENT')

    expect(planning.map((member) => member.agent_profile_key)).toEqual([
      'product-manager',
      'system-analyst',
    ])
    expect(ambient.map((member) => member.agent_profile_key)).toContain(
      'backend-engineer',
    )
    expect(ambient.every((member) => member.status === 'SOCIAL_BREAK')).toBe(true)
  })

  it('derives behavior from truth, status, and zone without upgrading ambient truth', () => {
    expect(
      officeBehaviorFor('PLANNING', 'planning-table', 'PLANNING'),
    ).toBe('PLANNING_MEETING')
    expect(
      officeBehaviorFor('WAITING_USER', 'planning-table', 'PLANNING'),
    ).toBe('WAITING_DECISION')
    expect(
      officeBehaviorFor('SOCIAL_BREAK', 'game-corner', 'AMBIENT'),
    ).toBe('GAME_BREAK')
    expect(
      officeBehaviorFor('PRAYER_BREAK', 'quiet-room', 'AMBIENT'),
    ).toBe('PRAYER_QUIET')
    expect(officeBehaviorLabel('GAME_BREAK')).toBe('Game break')
  })

  it('assigns deterministic role-personality behavior during after-hours ambience', () => {
    const now = new Date(2026, 8, 28, 23, 0)
    const first = ambientOfficeMembers(profiles, now)
    const second = ambientOfficeMembers(profiles, now)

    expect(second).toEqual(first)
    expect(first).toHaveLength(2)
    expect(
      first.every((member) =>
        ['SOCIAL_CHAT', 'GAME_BREAK'].includes(member.behavior),
      ),
    ).toBe(true)
    expect(first.every((member) => member.floor === 'commons')).toBe(true)
  })

  it('changes ambient placement deterministically across ten-minute beats', () => {
    const before = ambientOfficeMembers(
      profiles,
      new Date(2026, 8, 28, 15, 1),
    )
    const after = ambientOfficeMembers(
      profiles,
      new Date(2026, 8, 28, 15, 11),
    )

    expect(
      after.some(
        (member) =>
          member.placementIndex !==
            before.find(
              (candidate) =>
                candidate.agent_profile_key === member.agent_profile_key,
            )?.placementIndex ||
          member.zone !==
            before.find(
              (candidate) =>
                candidate.agent_profile_key === member.agent_profile_key,
            )?.zone,
      ),
    ).toBe(true)
  })

  it('staggered arrival completes before the focus window without crowding the entrance', () => {
    const members = ambientOfficeMembers(
      extendedProfiles,
      new Date(2026, 8, 28, 8, 50),
    )

    expect(members).toHaveLength(extendedProfiles.length)
    expect(members.every((member) => member.status === 'AVAILABLE')).toBe(true)
    expect(members.some((member) => member.zone === 'entrance')).toBe(false)
  })

  it('limits coffee and lunch participation instead of moving the whole office at once', () => {
    const coffee = ambientOfficeMembers(
      extendedProfiles,
      new Date(2026, 8, 28, 15, 15),
    )
    const lunch = ambientOfficeMembers(
      extendedProfiles,
      new Date(2026, 8, 28, 12, 15),
    )

    expect(
      coffee.filter((member) => member.status === 'COFFEE_BREAK'),
    ).toHaveLength(4)
    expect(
      coffee.filter((member) => member.status === 'AVAILABLE'),
    ).toHaveLength(5)
    expect(
      lunch.filter((member) => member.status === 'LUNCH_BREAK'),
    ).toHaveLength(6)
    expect(
      lunch.filter((member) => member.status === 'AVAILABLE'),
    ).toHaveLength(3)
  })

  it('never assigns more ambient participants than a social zone can hold', () => {
    const lunch = ambientOfficeMembers(
      extendedProfiles,
      new Date(2026, 8, 28, 12, 15),
    )

    const counts = lunch.reduce(
      (accumulator, member) => {
        if (member.status !== 'LUNCH_BREAK') return accumulator
        accumulator.set(
          member.zone,
          (accumulator.get(member.zone) ?? 0) + 1,
        )
        return accumulator
      },
      new Map<string, number>(),
    )

    counts.forEach((count, zone) => {
      const capacity =
        OFFICE_AMBIENT_ZONE_CAPACITY[
          zone as keyof typeof OFFICE_AMBIENT_ZONE_CAPACITY
        ]
      expect(capacity).toBeDefined()
      expect(count).toBeLessThanOrEqual(capacity ?? 0)
    })
  })

  it('clamps scheduled ambience to the configured zone capacity', () => {
    const now = new Date(2026, 8, 28, 15, 15)
    const members = ambientOfficeMembers(extendedProfiles, now, [
      {
        id: 'scheduled-coffee',
        label: 'Team coffee',
        startsAt: new Date(2026, 8, 28, 15, 0).toISOString(),
        endsAt: new Date(2026, 8, 28, 15, 30).toISOString(),
        floor: 'commons',
        zone: 'coffee-bar',
        presence: 'COFFEE_BREAK',
        priority: 50,
        maxParticipants: 9,
      },
    ])

    expect(
      members.filter(
        (member) =>
          member.status === 'COFFEE_BREAK' &&
          member.zone === 'coffee-bar',
      ),
    ).toHaveLength(2)
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
