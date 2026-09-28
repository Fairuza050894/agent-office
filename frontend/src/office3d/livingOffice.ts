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

export type OfficeBehaviorKey =
  | 'ARRIVAL'
  | 'AVAILABLE'
  | 'DESK_FOCUS'
  | 'PLANNING_MEETING'
  | 'WAITING_DECISION'
  | 'COFFEE_CHAT'
  | 'LUNCH'
  | 'SOCIAL_CHAT'
  | 'GAME_BREAK'
  | 'PRAYER_QUIET'
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
  behavior: OfficeBehaviorKey
  floor: OfficeFloorKey
  zone: OfficeZoneKey
  placementIndex: number
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

const ROLE_AMBIENT_ZONES: Record<
  (typeof LIVING_OFFICE_CORE_ROLES)[number],
  {
    coffee: OfficeZoneKey[]
    lunch: OfficeZoneKey[]
    afterHours: OfficeZoneKey[]
  }
> = {
  'product-manager': {
    coffee: ['coffee-bar', 'lounge'],
    lunch: ['pantry', 'lounge'],
    afterHours: ['lounge', 'coffee-bar'],
  },
  'system-analyst': {
    coffee: ['coffee-bar', 'quiet-room'],
    lunch: ['pantry', 'quiet-room'],
    afterHours: ['lounge', 'quiet-room'],
  },
  'principal-engineer': {
    coffee: ['coffee-bar', 'lounge'],
    lunch: ['pantry', 'lounge'],
    afterHours: ['lounge', 'game-corner'],
  },
  'product-designer': {
    coffee: ['coffee-bar', 'lounge'],
    lunch: ['pantry', 'lounge'],
    afterHours: ['lounge', 'game-corner'],
  },
  'backend-engineer': {
    coffee: ['coffee-bar', 'game-corner'],
    lunch: ['pantry', 'lounge'],
    afterHours: ['game-corner', 'lounge'],
  },
  'frontend-engineer': {
    coffee: ['coffee-bar', 'game-corner'],
    lunch: ['pantry', 'lounge'],
    afterHours: ['game-corner', 'coffee-bar'],
  },
  'qa-engineer': {
    coffee: ['coffee-bar', 'lounge'],
    lunch: ['pantry', 'lounge'],
    afterHours: ['lounge', 'game-corner'],
  },
  'security-reviewer': {
    coffee: ['coffee-bar', 'quiet-room'],
    lunch: ['pantry', 'quiet-room'],
    afterHours: ['quiet-room', 'lounge'],
  },
  'technical-writer': {
    coffee: ['coffee-bar', 'lounge'],
    lunch: ['pantry', 'quiet-room'],
    afterHours: ['lounge', 'quiet-room'],
  },
}

export const OFFICE_AMBIENT_ZONE_CAPACITY: Partial<
  Record<OfficeZoneKey, number>
> = {
  'coffee-bar': 2,
  pantry: 2,
  lounge: 2,
  'game-corner': 2,
  'quiet-room': 2,
}

const OFFICE_BEHAVIOR_LABELS: Record<OfficeBehaviorKey, string> = {
  ARRIVAL: 'Arriving',
  AVAILABLE: 'Available',
  DESK_FOCUS: 'Focus',
  PLANNING_MEETING: 'Planning',
  WAITING_DECISION: 'Waiting for you',
  COFFEE_CHAT: 'Coffee break',
  LUNCH: 'Lunch break',
  SOCIAL_CHAT: 'Social break',
  GAME_BREAK: 'Game break',
  PRAYER_QUIET: 'Prayer break',
  OFFLINE: 'Offline',
}

function stableRoleHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function ambientBeat(now: Date): number {
  return Math.floor(now.getTime() / (10 * 60 * 1000))
}

function pickAmbientZone(
  roleKey: (typeof LIVING_OFFICE_CORE_ROLES)[number],
  candidates: OfficeZoneKey[],
  now: Date,
): OfficeZoneKey {
  const index =
    (stableRoleHash(roleKey) + ambientBeat(now)) % candidates.length
  return candidates[index]
}

function pickAmbientZoneWithCapacity(
  roleKey: (typeof LIVING_OFFICE_CORE_ROLES)[number],
  candidates: OfficeZoneKey[],
  now: Date,
  occupied: Map<OfficeZoneKey, number>,
): OfficeZoneKey | null {
  const preferredOffset =
    (stableRoleHash(roleKey) + ambientBeat(now)) % candidates.length

  for (let offset = 0; offset < candidates.length; offset += 1) {
    const zone = candidates[(preferredOffset + offset) % candidates.length]
    const capacity = OFFICE_AMBIENT_ZONE_CAPACITY[zone]
    const used = occupied.get(zone) ?? 0
    if (capacity !== undefined && used >= capacity) continue
    occupied.set(zone, used + 1)
    return zone
  }

  return null
}

function ambientPlacementIndex(roleKey: string, now: Date): number {
  return (stableRoleHash(roleKey) + ambientBeat(now)) % 8
}

function localCalendarDayBucket(now: Date): number {
  return (
    now.getFullYear() * 10_000 +
    (now.getMonth() + 1) * 100 +
    now.getDate()
  )
}

function selectDailyRoles(
  roles: readonly (typeof LIVING_OFFICE_CORE_ROLES)[number][],
  count: number,
  dayBucket: number,
  salt: string,
): Set<(typeof LIVING_OFFICE_CORE_ROLES)[number]> {
  return new Set(
    [...roles]
      .sort(
        (left, right) =>
          ((stableRoleHash(`${salt}:${left}`) + dayBucket) % 997) -
          ((stableRoleHash(`${salt}:${right}`) + dayBucket) % 997),
      )
      .slice(0, Math.min(count, roles.length)),
  )
}

function availableAtHome(
  roleKey: (typeof LIVING_OFFICE_CORE_ROLES)[number],
  profile: AgentProfile,
  now: Date,
): OfficePresenceMember {
  const home = ROLE_HOME_ZONE[roleKey]
  return {
    id: `ambient:${roleKey}`,
    agent_profile_key: roleKey,
    name: profile.name,
    status: 'AVAILABLE',
    behavior: 'AVAILABLE',
    floor: home.floor,
    zone: home.zone,
    placementIndex: ambientPlacementIndex(roleKey, now),
    truth: 'AMBIENT',
  }
}

export function officeBehaviorFor(
  status: OfficePresenceState,
  zone: OfficeZoneKey,
  truth: OfficePresenceMember['truth'],
): OfficeBehaviorKey {
  if (truth === 'PLANNING') {
    return status === 'WAITING_USER'
      ? 'WAITING_DECISION'
      : 'PLANNING_MEETING'
  }

  switch (status) {
    case 'ARRIVING':
      return 'ARRIVAL'
    case 'WORKING':
      return 'DESK_FOCUS'
    case 'COFFEE_BREAK':
      return 'COFFEE_CHAT'
    case 'LUNCH_BREAK':
      return 'LUNCH'
    case 'PRAYER_BREAK':
      return 'PRAYER_QUIET'
    case 'SOCIAL_BREAK':
      return zone === 'game-corner' ? 'GAME_BREAK' : 'SOCIAL_CHAT'
    case 'OFFLINE':
      return 'OFFLINE'
    default:
      return 'AVAILABLE'
  }
}

export function officeBehaviorLabel(behavior: OfficeBehaviorKey): string {
  return OFFICE_BEHAVIOR_LABELS[behavior]
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
      behavior: waitingForUser ? 'WAITING_DECISION' : 'PLANNING_MEETING',
      floor: 'strategy',
      zone: index < 4 ? 'planning-table' : 'architecture-wall',
      placementIndex: index,
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
  const activeRoles = LIVING_OFFICE_CORE_ROLES.filter(
    (roleKey) =>
      known.get(roleKey)?.status === 'ACTIVE' && !excludedRoleKeys.has(roleKey),
  )
  const dayBucket = localCalendarDayBucket(now)
  const afterHoursRoles = selectDailyRoles(
    activeRoles,
    2,
    dayBucket,
    'after-hours',
  )
  const coffeeRoles = selectDailyRoles(activeRoles, 4, dayBucket, 'coffee')
  const lunchRoles = selectDailyRoles(activeRoles, 6, dayBucket, 'lunch')
  const occupiedAmbientZones = new Map<OfficeZoneKey, number>()

  const scheduledCandidates = activeRoles.filter(
    (roleKey) =>
      scheduled !== null &&
      (scheduled.roleKeys === undefined || scheduled.roleKeys.includes(roleKey)),
  )
  const scheduledCapacity = scheduled
    ? OFFICE_AMBIENT_ZONE_CAPACITY[scheduled.zone]
    : undefined
  const scheduledLimit = Math.min(
    scheduled?.maxParticipants ?? 2,
    scheduledCapacity ?? Number.POSITIVE_INFINITY,
  )
  const scheduledRoles = new Set(
    scheduledCandidates.slice(0, scheduledLimit),
  )
  if (scheduled && scheduledRoles.size > 0) {
    occupiedAmbientZones.set(scheduled.zone, scheduledRoles.size)
  }

  return activeRoles.flatMap((roleKey) => {
    const profile = known.get(roleKey)
    if (!profile) return []

    if (scheduled && scheduledRoles.has(roleKey)) {
      const status = scheduled.presence
      const zone = scheduled.zone
      return [
        {
          id: `ambient:${roleKey}`,
          agent_profile_key: roleKey,
          name: profile.name,
          status,
          behavior: officeBehaviorFor(status, zone, 'AMBIENT'),
          floor: scheduled.floor,
          zone,
          placementIndex: ambientPlacementIndex(roleKey, now),
          truth: 'AMBIENT' as const,
        },
      ]
    }

    if (baseline.key === 'after-hours') {
      if (!afterHoursRoles.has(roleKey)) return []
      const zone =
        pickAmbientZoneWithCapacity(
          roleKey,
          ROLE_AMBIENT_ZONES[roleKey].afterHours,
          now,
          occupiedAmbientZones,
        ) ??
        pickAmbientZone(roleKey, ROLE_AMBIENT_ZONES[roleKey].afterHours, now)
      return [
        {
          id: `ambient:${roleKey}`,
          agent_profile_key: roleKey,
          name: profile.name,
          status: 'SOCIAL_BREAK',
          behavior: officeBehaviorFor('SOCIAL_BREAK', zone, 'AMBIENT'),
          floor: 'commons',
          zone,
          placementIndex: ambientPlacementIndex(roleKey, now),
          truth: 'AMBIENT' as const,
        },
      ]
    }

    if (baseline.key === 'coffee') {
      if (!coffeeRoles.has(roleKey)) {
        return [availableAtHome(roleKey, profile, now)]
      }
      const zone = pickAmbientZoneWithCapacity(
        roleKey,
        ROLE_AMBIENT_ZONES[roleKey].coffee,
        now,
        occupiedAmbientZones,
      )
      if (!zone) return [availableAtHome(roleKey, profile, now)]
      return [
        {
          id: `ambient:${roleKey}`,
          agent_profile_key: roleKey,
          name: profile.name,
          status: 'COFFEE_BREAK',
          behavior: officeBehaviorFor('COFFEE_BREAK', zone, 'AMBIENT'),
          floor: 'commons',
          zone,
          placementIndex: ambientPlacementIndex(roleKey, now),
          truth: 'AMBIENT' as const,
        },
      ]
    }

    if (baseline.key === 'lunch') {
      if (!lunchRoles.has(roleKey)) {
        return [availableAtHome(roleKey, profile, now)]
      }
      const zone = pickAmbientZoneWithCapacity(
        roleKey,
        ROLE_AMBIENT_ZONES[roleKey].lunch,
        now,
        occupiedAmbientZones,
      )
      if (!zone) return [availableAtHome(roleKey, profile, now)]
      return [
        {
          id: `ambient:${roleKey}`,
          agent_profile_key: roleKey,
          name: profile.name,
          status: 'LUNCH_BREAK',
          behavior: officeBehaviorFor('LUNCH_BREAK', zone, 'AMBIENT'),
          floor: 'commons',
          zone,
          placementIndex: ambientPlacementIndex(roleKey, now),
          truth: 'AMBIENT' as const,
        },
      ]
    }

    if (baseline.key === 'arrival') {
      const minuteOfDay = now.getHours() * 60 + now.getMinutes()
      const arrivalMinute = 7 * 60 + (stableRoleHash(roleKey) % 100)

      if (minuteOfDay < arrivalMinute) return []
      if (minuteOfDay >= arrivalMinute + 10) {
        return [availableAtHome(roleKey, profile, now)]
      }

      const zone: OfficeZoneKey = 'entrance'
      return [
        {
          id: `ambient:${roleKey}`,
          agent_profile_key: roleKey,
          name: profile.name,
          status: 'ARRIVING',
          behavior: 'ARRIVAL',
          floor: 'commons',
          zone,
          placementIndex: ambientPlacementIndex(roleKey, now),
          truth: 'AMBIENT' as const,
        },
      ]
    }

    const wrapUpCommons =
      baseline.key === 'wrap-up' &&
      (roleKey === 'product-manager' || roleKey === 'technical-writer')

    if (wrapUpCommons) {
      const zone: OfficeZoneKey =
        roleKey === 'product-manager' ? 'lounge' : 'coffee-bar'
      return [
        {
          id: `ambient:${roleKey}`,
          agent_profile_key: roleKey,
          name: profile.name,
          status: 'AVAILABLE',
          behavior: 'AVAILABLE',
          floor: 'commons',
          zone,
          placementIndex: ambientPlacementIndex(roleKey, now),
          truth: 'AMBIENT' as const,
        },
      ]
    }

    return [availableAtHome(roleKey, profile, now)]
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
