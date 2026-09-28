import type {
  AgentProfile,
  ComposerThread,
  TeamProposal,
} from '../api'

export type OfficeFloorKey = 'commons' | 'build' | 'strategy'

export type OfficePresenceState =
  | 'ARRIVING'
  | 'AVAILABLE'
  | 'WORKING'
  | 'PLANNING'
  | 'WAITING_USER'
  | 'LUNCH_BREAK'
  | 'COFFEE_BREAK'
  | 'PRAYER_BREAK'
  | 'SOCIAL_BREAK'
  | 'OFFLINE'

export type OfficeZoneKey =
  | 'entrance'
  | 'coffee-bar'
  | 'pantry'
  | 'lounge'
  | 'game-corner'
  | 'quiet-room'
  | 'engineering-pod'
  | 'qa-bench'
  | 'review-wall'
  | 'docs-desk'
  | 'planning-table'
  | 'architecture-wall'
  | 'decision-room'

export interface OfficeFloorDefinition {
  key: OfficeFloorKey
  shortLabel: string
  label: string
  purpose: string
}

export interface OfficePresenceMember {
  id: string
  agent_profile_key: string
  name: string
  status: OfficePresenceState
  floor: OfficeFloorKey
  zone: OfficeZoneKey
  truth: 'PLANNING' | 'AMBIENT'
}

export interface OfficeAmbientWindow {
  key:
    | 'arrival'
    | 'focus'
    | 'lunch'
    | 'afternoon'
    | 'coffee'
    | 'wrap-up'
    | 'after-hours'
    | 'scheduled'
  label: string
  floor: OfficeFloorKey
  zone: OfficeZoneKey
  presence: OfficePresenceState
}

export interface OfficeScheduledEvent {
  id: string
  label: string
  startsAt: string
  endsAt: string
  floor: OfficeFloorKey
  zone: OfficeZoneKey
  presence: OfficePresenceState
  priority: number
  maxParticipants?: number
  roleKeys?: string[]
}

export const OFFICE_FLOORS: OfficeFloorDefinition[] = [
  {
    key: 'commons',
    shortLabel: 'L1',
    label: 'Commons',
    purpose: 'Arrival, pantry, lounge, quiet room, and social breaks.',
  },
  {
    key: 'build',
    shortLabel: 'L2',
    label: 'Build',
    purpose: 'Engineering desks, QA bench, review wall, and documentation.',
  },
  {
    key: 'strategy',
    shortLabel: 'L3',
    label: 'Strategy',
    purpose: 'Planning, architecture review, decisions, and project alignment.',
  },
]

export const LIVING_OFFICE_CORE_ROLES = [
  'product-manager',
  'system-analyst',
  'principal-engineer',
  'product-designer',
  'backend-engineer',
  'frontend-engineer',
  'qa-engineer',
  'security-reviewer',
  'technical-writer',
] as const

const ROLE_HOME_ZONE: Record<
  (typeof LIVING_OFFICE_CORE_ROLES)[number],
  { floor: OfficeFloorKey; zone: OfficeZoneKey }
> = {
  'product-manager': { floor: 'strategy', zone: 'planning-table' },
  'system-analyst': { floor: 'strategy', zone: 'architecture-wall' },
  'principal-engineer': { floor: 'strategy', zone: 'architecture-wall' },
  'product-designer': { floor: 'strategy', zone: 'decision-room' },
  'backend-engineer': { floor: 'build', zone: 'engineering-pod' },
  'frontend-engineer': { floor: 'build', zone: 'engineering-pod' },
  'qa-engineer': { floor: 'build', zone: 'qa-bench' },
  'security-reviewer': { floor: 'build', zone: 'review-wall' },
  'technical-writer': { floor: 'build', zone: 'docs-desk' },
}

function ambientWindowForHour(hour: number): OfficeAmbientWindow {
  if (hour >= 7 && hour < 9) {
    return {
      key: 'arrival',
      label: 'Arrival window',
      floor: 'commons',
      zone: 'entrance',
      presence: 'ARRIVING',
    }
  }
  if (hour >= 9 && hour < 12) {
    return {
      key: 'focus',
      label: 'Focus work',
      floor: 'build',
      zone: 'engineering-pod',
      presence: 'WORKING',
    }
  }
  if (hour >= 12 && hour < 13) {
    return {
      key: 'lunch',
      label: 'Lunch / quiet break',
      floor: 'commons',
      zone: 'pantry',
      presence: 'LUNCH_BREAK',
    }
  }
  if (hour >= 13 && hour < 15) {
    return {
      key: 'afternoon',
      label: 'Afternoon work',
      floor: 'build',
      zone: 'engineering-pod',
      presence: 'WORKING',
    }
  }
  if (hour >= 15 && hour < 16) {
    return {
      key: 'coffee',
      label: 'Coffee break',
      floor: 'commons',
      zone: 'coffee-bar',
      presence: 'COFFEE_BREAK',
    }
  }
  if (hour >= 16 && hour < 18) {
    return {
      key: 'wrap-up',
      label: 'Wrap-up',
      floor: 'build',
      zone: 'review-wall',
      presence: 'AVAILABLE',
    }
  }
  return {
    key: 'after-hours',
    label: 'After hours',
    floor: 'commons',
    zone: 'lounge',
    presence: 'SOCIAL_BREAK',
  }
}

function activeScheduledEvent(
  now: Date,
  scheduledEvents: OfficeScheduledEvent[],
): OfficeScheduledEvent | null {
  const current = now.getTime()
  return (
    scheduledEvents
      .filter((event) => {
        const startsAt = new Date(event.startsAt).getTime()
        const endsAt = new Date(event.endsAt).getTime()
        return (
          Number.isFinite(startsAt) &&
          Number.isFinite(endsAt) &&
          current >= startsAt &&
          current < endsAt
        )
      })
      .sort((left, right) => right.priority - left.priority)[0] ?? null
  )
}

export function officeAmbientWindow(
  now = new Date(),
  scheduledEvents: OfficeScheduledEvent[] = [],
): OfficeAmbientWindow {
  const activeScheduled = activeScheduledEvent(now, scheduledEvents)

  if (activeScheduled) {
    return {
      key: 'scheduled',
      label: activeScheduled.label,
      floor: activeScheduled.floor,
      zone: activeScheduled.zone,
      presence: activeScheduled.presence,
    }
  }

  return ambientWindowForHour(now.getHours())
}

function profileByKey(profiles: AgentProfile[]): Map<string, AgentProfile> {
  return new Map(profiles.map((profile) => [profile.key, profile]))
}

export function planningPresenceMembers(
  thread: ComposerThread | null,
  proposal: TeamProposal | null,
  profiles: AgentProfile[],
): OfficePresenceMember[] {
  if (!thread || !proposal) return []

  const names = profileByKey(profiles)
  const waitingForUser = thread.status === 'AWAITING_USER'

  return proposal.members
    .filter((member) => member.disposition === 'INCLUDED')
    .map((member, index) => ({
      id: `planning:${thread.id}:${member.role_key}`,
      agent_profile_key: member.role_key,
      name: names.get(member.role_key)?.name ?? member.role_key,
      status: waitingForUser ? 'WAITING_USER' : 'PLANNING',
      floor: 'strategy',
      zone: index < 4 ? 'planning-table' : 'architecture-wall',
      truth: 'PLANNING',
    }))
}

export function ambientOfficeMembers(
  profiles: AgentProfile[],
  now = new Date(),
  scheduledEvents: OfficeScheduledEvent[] = [],
  excludedRoleKeys: ReadonlySet<string> = new Set(),
): OfficePresenceMember[] {
  const baseline = ambientWindowForHour(now.getHours())
  const scheduled = activeScheduledEvent(now, scheduledEvents)
  const known = profileByKey(profiles)
  let scheduledParticipants = 0
  let afterHoursParticipants = 0

  return LIVING_OFFICE_CORE_ROLES.flatMap((roleKey, index) => {
    const profile = known.get(roleKey)
    if (
      !profile ||
      profile.status !== 'ACTIVE' ||
      excludedRoleKeys.has(roleKey)
    ) {
      return []
    }

    const targeted =
      scheduled !== null &&
      (scheduled.roleKeys === undefined || scheduled.roleKeys.includes(roleKey)) &&
      scheduledParticipants < (scheduled.maxParticipants ?? 2)

    if (targeted) {
      scheduledParticipants += 1
      return [
        {
          id: `ambient:${roleKey}`,
          agent_profile_key: roleKey,
          name: profile.name,
          status: scheduled.presence,
          floor: scheduled.floor,
          zone: scheduled.zone,
          truth: 'AMBIENT' as const,
        },
      ]
    }

    const home = ROLE_HOME_ZONE[roleKey]
    const afterHours = baseline.key === 'after-hours'
    if (afterHours) {
      if (afterHoursParticipants >= 2) return []
      afterHoursParticipants += 1
    }

    const wrapUpCommons =
      baseline.key === 'wrap-up' &&
      (roleKey === 'product-manager' || roleKey === 'technical-writer')

    if (wrapUpCommons) {
      return [
        {
          id: `ambient:${roleKey}`,
          agent_profile_key: roleKey,
          name: profile.name,
          status: 'AVAILABLE',
          floor: 'commons',
          zone: roleKey === 'product-manager' ? 'lounge' : 'coffee-bar',
          truth: 'AMBIENT' as const,
        },
      ]
    }

    const useAmbientZone =
      baseline.key === 'arrival' ||
      baseline.key === 'lunch' ||
      baseline.key === 'coffee' ||
      baseline.key === 'after-hours'

    return [
      {
        id: `ambient:${roleKey}`,
        agent_profile_key: roleKey,
        name: profile.name,
        status: useAmbientZone ? baseline.presence : 'AVAILABLE',
        floor: useAmbientZone ? baseline.floor : home.floor,
        zone: useAmbientZone
          ? index % 2 === 0
            ? baseline.zone
            : baseline.key === 'after-hours'
              ? 'game-corner'
              : 'lounge'
          : home.zone,
        truth: 'AMBIENT' as const,
      },
    ]
  })
}

export function livingOfficeMembers(
  thread: ComposerThread | null,
  proposal: TeamProposal | null,
  profiles: AgentProfile[],
  now = new Date(),
  scheduledEvents: OfficeScheduledEvent[] = [],
): OfficePresenceMember[] {
  const planning = planningPresenceMembers(thread, proposal, profiles)
  const planningRoleKeys = new Set(
    planning.map((member) => member.agent_profile_key),
  )
  const ambient = ambientOfficeMembers(
    profiles,
    now,
    scheduledEvents,
    planningRoleKeys,
  )

  return [...planning, ...ambient]
}
