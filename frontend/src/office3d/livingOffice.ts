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

export function officeAmbientWindow(
  now = new Date(),
  scheduledEvents: OfficeScheduledEvent[] = [],
): OfficeAmbientWindow {
  const activeScheduled = scheduledEvents
    .filter((event) => {
      const startsAt = new Date(event.startsAt).getTime()
      const endsAt = new Date(event.endsAt).getTime()
      const current = now.getTime()
      return Number.isFinite(startsAt) && Number.isFinite(endsAt) && current >= startsAt && current < endsAt
    })
    .sort((left, right) => right.priority - left.priority)[0]

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
): OfficePresenceMember[] {
  const window = officeAmbientWindow(now, scheduledEvents)
  const known = profileByKey(profiles)

  return LIVING_OFFICE_CORE_ROLES.flatMap((roleKey, index) => {
    const profile = known.get(roleKey)
    if (!profile || profile.status !== 'ACTIVE') return []

    const home = ROLE_HOME_ZONE[roleKey]
    const afterHours = window.key === 'after-hours'
    if (afterHours && index > 1) return []

    const useAmbientZone =
      window.key === 'arrival' ||
      window.key === 'lunch' ||
      window.key === 'coffee' ||
      window.key === 'after-hours' ||
      window.key === 'scheduled'

    return [
      {
        id: `ambient:${roleKey}`,
        agent_profile_key: roleKey,
        name: profile.name,
        status: useAmbientZone ? window.presence : 'AVAILABLE',
        floor: useAmbientZone ? window.floor : home.floor,
        zone: useAmbientZone
          ? window.key === 'scheduled'
            ? window.zone
            : index % 2 === 0
              ? window.zone
              : window.key === 'after-hours'
                ? 'game-corner'
                : 'lounge'
          : home.zone,
        truth: 'AMBIENT',
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
  return planning.length > 0
    ? planning
    : ambientOfficeMembers(profiles, now, scheduledEvents)
}
