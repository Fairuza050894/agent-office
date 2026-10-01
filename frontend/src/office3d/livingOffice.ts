import type {
  AgentProfile,
  ComposerThread,
  TeamProposal,
} from '../api'
import {
  isPlanningPresenceFresh,
  officeWorldContext,
} from './officeWorld'

export type OfficeFloorKey = 'commons' | 'build' | 'strategy'

export type OfficePresenceState =
  | 'ARRIVING'
  | 'AVAILABLE'
  | 'WORKING'
  | 'PLANNING'
  | 'WAITING_USER'
  | 'WAITING_WORK'
  | 'LUNCH_BREAK'
  | 'COFFEE_BREAK'
  | 'PRAYER_BREAK'
  | 'SOCIAL_BREAK'
  | 'OFFLINE'

export function officePresenceStatusLabel(
  status: OfficePresenceState,
): string {
  switch (status) {
    case 'WAITING_WORK':
      return 'Waiting'
    case 'WAITING_USER':
      return 'Waiting for you'
    case 'LUNCH_BREAK':
      return 'Lunch break'
    case 'COFFEE_BREAK':
      return 'Coffee break'
    case 'PRAYER_BREAK':
      return 'Prayer / quiet break'
    case 'SOCIAL_BREAK':
      return 'Social break'
    case 'WORKING':
      return 'Working'
    case 'PLANNING':
      return 'Planning'
    case 'AVAILABLE':
      return 'Available'
    case 'ARRIVING':
      return 'Arriving'
    case 'OFFLINE':
      return 'Offline'
  }
}

export type OfficeBehaviorKey =
  | 'ARRIVAL'
  | 'AVAILABLE'
  | 'DESK_FOCUS'
  | 'PLANNING_MEETING'
  | 'WAITING_DECISION'
  | 'WORK_WAITING'
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
  truth: 'PLANNING' | 'AMBIENT' | 'WORK'
  taskId?: string
  taskTitle?: string
  runId?: string
  runStatus?: string
  agentRunId?: string
  agentRunStatus?: string
  stageKey?: string
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


export interface OfficeWorkAssignment {
  taskId: string
  taskTitle: string
  runId: string
  runStatus: string
  agentRunId: string
  agentRunStatus: string
  agentProfileKey: string
  stageKey: string
  startedAt?: string | null
  updatedAt: string
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

export function officeFloorFromParam(value: string | null): OfficeFloorKey | null {
  return value === 'commons' || value === 'build' || value === 'strategy'
    ? value
    : null
}


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

export function officeRoleHomeLocation(
  roleKey: string,
): { floor: OfficeFloorKey; zone: OfficeZoneKey } {
  const known = ROLE_HOME_ZONE[
    roleKey as (typeof LIVING_OFFICE_CORE_ROLES)[number]
  ]
  if (known) return known

  const normalized = roleKey.toLowerCase()
  if (
    normalized.includes('architect') ||
    normalized.includes('product') ||
    normalized.includes('analyst') ||
    normalized.includes('design')
  ) {
    return { floor: 'strategy', zone: 'architecture-wall' }
  }

  return { floor: 'build', zone: 'engineering-pod' }
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

export const OFFICE_AMBIENT_ZONE_CAPACITY: Record<
  OfficeZoneKey,
  number
> = {
  entrance: 3,
  'coffee-bar': 2,
  pantry: 2,
  lounge: 2,
  'game-corner': 2,
  'quiet-room': 2,
  'engineering-pod': 8,
  'qa-bench': 2,
  'review-wall': 2,
  'docs-desk': 2,
  'planning-table': 6,
  'architecture-wall': 3,
  'decision-room': 2,
}

const OFFICE_BEHAVIOR_LABELS: Record<OfficeBehaviorKey, string> = {
  ARRIVAL: 'Arriving',
  AVAILABLE: 'Available',
  DESK_FOCUS: 'Focus',
  PLANNING_MEETING: 'Planning',
  WAITING_DECISION: 'Waiting for you',
  WORK_WAITING: 'Waiting',
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
  // Significant ambient relocation should be occasional but observable.
  // Three-minute beats keep the office alive without turning workers into
  // patrol NPCs; canonical WORK members remain task-anchored separately.
  return Math.floor(now.getTime() / (3 * 60 * 1000))
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

  if (truth === 'WORK') {
    if (status === 'COFFEE_BREAK') return 'COFFEE_CHAT'
    if (status === 'LUNCH_BREAK') return 'LUNCH'
    if (status === 'PRAYER_BREAK') return 'PRAYER_QUIET'
    if (status === 'WAITING_USER') return 'WAITING_DECISION'
    if (status === 'WAITING_WORK') return 'WORK_WAITING'
    return 'DESK_FOCUS'
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

function ambientWindowForWorld(
  now: Date,
  timeZone?: string | null,
): OfficeAmbientWindow {
  const world = officeWorldContext(now, timeZone)

  switch (world.mode) {
    case 'ARRIVAL':
      return {
        key: 'arrival',
        label: world.modeLabel,
        floor: 'commons',
        zone: 'entrance',
        presence: 'ARRIVING',
      }
    case 'CORE_WORK':
      return {
        key: 'focus',
        label: world.modeLabel,
        floor: 'build',
        zone: 'engineering-pod',
        presence: 'WORKING',
      }
    case 'LUNCH':
      return {
        key: 'lunch',
        label: world.modeLabel,
        floor: 'commons',
        zone: 'pantry',
        presence: 'LUNCH_BREAK',
      }
    case 'AFTERNOON_FOCUS':
      return {
        key: 'afternoon',
        label: world.modeLabel,
        floor: 'build',
        zone: 'engineering-pod',
        presence: 'WORKING',
      }
    case 'COFFEE_BREAK':
      return {
        key: 'coffee',
        label: world.modeLabel,
        floor: 'commons',
        zone: 'coffee-bar',
        presence: 'COFFEE_BREAK',
      }
    case 'WRAP_UP':
      return {
        key: 'wrap-up',
        label: world.modeLabel,
        floor: 'build',
        zone: 'review-wall',
        presence: 'AVAILABLE',
      }
    default:
      return {
        key: 'after-hours',
        label: world.modeLabel,
        floor: 'commons',
        zone: 'lounge',
        presence: 'SOCIAL_BREAK',
      }
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
  timeZone?: string | null,
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

  return ambientWindowForWorld(now, timeZone)
}

function activeWorkAssignment(
  assignment: OfficeWorkAssignment,
): boolean {
  return !['COMPLETED', 'FAILED', 'CANCELLED'].includes(
    assignment.agentRunStatus.toUpperCase(),
  )
}

function workZoneFor(
  roleKey: string,
  stageKey: string,
): { floor: OfficeFloorKey; zone: OfficeZoneKey } {
  const normalizedStage = stageKey.toLowerCase()
  if (
    normalizedStage.includes('discover') ||
    normalizedStage.includes('plan') ||
    normalizedStage.includes('architect') ||
    normalizedStage.includes('design')
  ) {
    return {
      floor: 'strategy',
      zone: normalizedStage.includes('design')
        ? 'decision-room'
        : normalizedStage.includes('architect')
          ? 'architecture-wall'
          : 'planning-table',
    }
  }

  if (
    normalizedStage.includes('test') ||
    normalizedStage.includes('verify') ||
    normalizedStage.includes('qa')
  ) {
    return { floor: 'build', zone: 'qa-bench' }
  }

  if (
    normalizedStage.includes('review') ||
    normalizedStage.includes('security')
  ) {
    return { floor: 'build', zone: 'review-wall' }
  }

  if (
    normalizedStage.includes('doc') ||
    normalizedStage.includes('release')
  ) {
    return { floor: 'build', zone: 'docs-desk' }
  }

  return officeRoleHomeLocation(roleKey)
}

function breakZoneForWork(
  roleKey: string,
  worldMode: string,
  now: Date,
): { status: OfficePresenceState; floor: OfficeFloorKey; zone: OfficeZoneKey } | null {
  const knownRole = LIVING_OFFICE_CORE_ROLES.includes(
    roleKey as (typeof LIVING_OFFICE_CORE_ROLES)[number],
  )
    ? (roleKey as (typeof LIVING_OFFICE_CORE_ROLES)[number])
    : null

  if (!knownRole) return null

  if (worldMode === 'LUNCH') {
    return {
      status: 'LUNCH_BREAK',
      floor: 'commons',
      zone: pickAmbientZone(knownRole, ROLE_AMBIENT_ZONES[knownRole].lunch, now),
    }
  }

  if (worldMode === 'COFFEE_BREAK') {
    return {
      status: 'COFFEE_BREAK',
      floor: 'commons',
      zone: pickAmbientZone(knownRole, ROLE_AMBIENT_ZONES[knownRole].coffee, now),
    }
  }

  return null
}

export function workPresenceMembers(
  assignments: OfficeWorkAssignment[],
  profiles: AgentProfile[],
  now = new Date(),
  timeZone?: string | null,
  scheduledEvents: OfficeScheduledEvent[] = [],
): OfficePresenceMember[] {
  const world = officeWorldContext(now, timeZone)
  const scheduled = activeScheduledEvent(now, scheduledEvents)
  const names = profileByKey(profiles)

  return assignments
    .filter(activeWorkAssignment)
    .map((assignment, index) => {
      const profile = names.get(assignment.agentProfileKey)
      const home = workZoneFor(
        assignment.agentProfileKey,
        assignment.stageKey,
      )
      const normalizedAgentStatus = assignment.agentRunStatus.toUpperCase()
      const canLeaveDesk =
        normalizedAgentStatus === 'WAITING' ||
        normalizedAgentStatus === 'BLOCKED' ||
        normalizedAgentStatus === 'PENDING'
      const providerBreak =
        canLeaveDesk &&
        scheduled &&
        ['LUNCH_BREAK', 'COFFEE_BREAK', 'PRAYER_BREAK', 'SOCIAL_BREAK'].includes(
          scheduled.presence,
        )
          ? {
              status: scheduled.presence,
              floor: scheduled.floor,
              zone: scheduled.zone,
            }
          : null
      const worldBreak = canLeaveDesk
        ? breakZoneForWork(
            assignment.agentProfileKey,
            world.mode,
            now,
          )
        : null
      const scheduledBreak = providerBreak ?? worldBreak

      const status: OfficePresenceState = scheduledBreak
        ? scheduledBreak.status
        : ['WAITING', 'BLOCKED', 'PENDING'].includes(normalizedAgentStatus)
          ? 'WAITING_WORK'
          : 'WORKING'
      const zone = scheduledBreak?.zone ?? home.zone
      const floor: OfficeFloorKey = scheduledBreak?.floor ?? home.floor

      return {
        id: `work:${assignment.agentRunId}`,
        agent_profile_key: assignment.agentProfileKey,
        name: profile?.name ?? assignment.agentProfileKey,
        status,
        behavior: officeBehaviorFor(status, zone, 'WORK'),
        floor,
        zone,
        placementIndex: index,
        truth: 'WORK' as const,
        taskId: assignment.taskId,
        taskTitle: assignment.taskTitle,
        runId: assignment.runId,
        runStatus: assignment.runStatus,
        agentRunId: assignment.agentRunId,
        agentRunStatus: assignment.agentRunStatus,
        stageKey: assignment.stageKey,
      }
    })
}

function profileByKey(profiles: AgentProfile[]): Map<string, AgentProfile> {
  return new Map(profiles.map((profile) => [profile.key, profile]))
}

export function planningPresenceMembers(
  thread: ComposerThread | null,
  proposal: TeamProposal | null,
  profiles: AgentProfile[],
  now?: Date,
  timeZone?: string | null,
): OfficePresenceMember[] {
  if (!thread || !proposal) return []
  const effectiveTimeZone = timeZone ?? thread.timezone
  if (now) {
    const world = officeWorldContext(now, effectiveTimeZone)
    if (!world.allowsPhysicalPlanningPresence) return []
    if (!isPlanningPresenceFresh(thread.updated_at, now, effectiveTimeZone)) {
      return []
    }
  }

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
  timeZone?: string | null,
): OfficePresenceMember[] {
  const world = officeWorldContext(now, timeZone)
  const baseline = ambientWindowForWorld(now, timeZone)
  const scheduled = activeScheduledEvent(now, scheduledEvents)
  const known = profileByKey(profiles)
  const activeRoles = LIVING_OFFICE_CORE_ROLES.filter(
    (roleKey) =>
      known.get(roleKey)?.status === 'ACTIVE' && !excludedRoleKeys.has(roleKey),
  )
  const dayBucket = world.localDateKey
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

  const baselineCandidates = activeRoles.filter(
    (roleKey) => !scheduledRoles.has(roleKey),
  )
  const baselineLimit = Math.max(
    0,
    world.ambientOccupancyCap - scheduledRoles.size,
  )
  const baselineRoles = selectDailyRoles(
    baselineCandidates,
    baselineLimit,
    dayBucket,
    `world:${world.mode}`,
  )
  const coffeeRoles = selectDailyRoles(
    [...baselineRoles],
    4,
    dayBucket,
    'coffee',
  )
  const lunchRoles = selectDailyRoles(
    [...baselineRoles],
    6,
    dayBucket,
    'lunch',
  )

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

    if (!baselineRoles.has(roleKey)) return []

    if (baseline.key === 'after-hours') {
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
      const arrivalMinute = 7 * 60 + (stableRoleHash(roleKey) % 100)

      if (world.localMinuteOfDay < arrivalMinute) return []
      if (world.localMinuteOfDay >= arrivalMinute + 10) {
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
  timeZone?: string | null,
  workAssignments: OfficeWorkAssignment[] = [],
): OfficePresenceMember[] {
  const effectiveTimeZone = timeZone ?? thread?.timezone
  const work = workPresenceMembers(
    workAssignments,
    profiles,
    now,
    effectiveTimeZone,
    scheduledEvents,
  )
  const workRoleKeys = new Set(
    work.map((member) => member.agent_profile_key),
  )
  const planning = planningPresenceMembers(
    thread,
    proposal,
    profiles,
    now,
    effectiveTimeZone,
  ).filter((member) => !workRoleKeys.has(member.agent_profile_key))
  const occupiedRoleKeys = new Set([
    ...workRoleKeys,
    ...planning.map((member) => member.agent_profile_key),
  ])
  const ambient = ambientOfficeMembers(
    profiles,
    now,
    scheduledEvents,
    occupiedRoleKeys,
    effectiveTimeZone,
  )

  return [...work, ...planning, ...ambient]
}
