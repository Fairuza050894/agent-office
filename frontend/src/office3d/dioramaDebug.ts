import type { OfficePresenceMember } from './livingOffice'

export const OFFICE_DIORAMA_FIXTURE_KEY = 'diorama'
export const OFFICE_DIORAMA_TIME_ZONE = 'Asia/Jakarta'
export const OFFICE_DIORAMA_DEFAULT_TIME = '2026-10-05T04:00:00.000Z'

export type OfficeDioramaPilotMode = 'primitive' | 'kit'

export interface OfficeDioramaDebugConfig {
  fixture: typeof OFFICE_DIORAMA_FIXTURE_KEY
  now: Date
  debugTime: string
  timeZone: string
  pilot: OfficeDioramaPilotMode
  members: OfficePresenceMember[]
}

const MEMBERS: OfficePresenceMember[] = [
  {
    id: 'diorama-commons-product-manager',
    agent_profile_key: 'product-manager',
    name: 'Simulated Product Manager',
    status: 'AVAILABLE',
    behavior: 'AVAILABLE',
    floor: 'commons',
    zone: 'lounge',
    placementIndex: 0,
    truth: 'AMBIENT',
  },
  {
    id: 'diorama-commons-system-analyst',
    agent_profile_key: 'system-analyst',
    name: 'Simulated System Analyst',
    status: 'AVAILABLE',
    behavior: 'AVAILABLE',
    floor: 'commons',
    zone: 'coffee-bar',
    placementIndex: 1,
    truth: 'AMBIENT',
  },
  {
    id: 'diorama-commons-technical-writer',
    agent_profile_key: 'technical-writer',
    name: 'Simulated Technical Writer',
    status: 'AVAILABLE',
    behavior: 'AVAILABLE',
    floor: 'commons',
    zone: 'quiet-room',
    placementIndex: 2,
    truth: 'AMBIENT',
  },
  {
    id: 'diorama-build-backend',
    agent_profile_key: 'backend-developer',
    name: 'Simulated Backend Developer',
    status: 'AVAILABLE',
    behavior: 'AVAILABLE',
    floor: 'build',
    zone: 'engineering-pod',
    placementIndex: 0,
    truth: 'AMBIENT',
  },
  {
    id: 'diorama-build-frontend',
    agent_profile_key: 'frontend-developer',
    name: 'Simulated Frontend Developer',
    status: 'AVAILABLE',
    behavior: 'AVAILABLE',
    floor: 'build',
    zone: 'engineering-pod',
    placementIndex: 1,
    truth: 'AMBIENT',
  },
  {
    id: 'diorama-build-qa',
    agent_profile_key: 'qa-reviewer',
    name: 'Simulated QA Reviewer',
    status: 'AVAILABLE',
    behavior: 'AVAILABLE',
    floor: 'build',
    zone: 'qa-bench',
    placementIndex: 0,
    truth: 'AMBIENT',
  },
  {
    id: 'diorama-build-docs',
    agent_profile_key: 'documentation-writer',
    name: 'Simulated Documentation Writer',
    status: 'AVAILABLE',
    behavior: 'AVAILABLE',
    floor: 'build',
    zone: 'docs-desk',
    placementIndex: 0,
    truth: 'AMBIENT',
  },
  {
    id: 'diorama-strategy-architect',
    agent_profile_key: 'architect',
    name: 'Simulated Architect',
    status: 'AVAILABLE',
    behavior: 'AVAILABLE',
    floor: 'strategy',
    zone: 'architecture-wall',
    placementIndex: 0,
    truth: 'AMBIENT',
  },
  {
    id: 'diorama-strategy-explorer',
    agent_profile_key: 'explorer',
    name: 'Simulated Explorer',
    status: 'AVAILABLE',
    behavior: 'AVAILABLE',
    floor: 'strategy',
    zone: 'planning-table',
    placementIndex: 0,
    truth: 'AMBIENT',
  },
  {
    id: 'diorama-strategy-designer',
    agent_profile_key: 'product-designer',
    name: 'Simulated Product Designer',
    status: 'AVAILABLE',
    behavior: 'AVAILABLE',
    floor: 'strategy',
    zone: 'decision-room',
    placementIndex: 0,
    truth: 'AMBIENT',
  },
]

function parseTime(raw: string | null): Date {
  const candidate = new Date(raw ?? OFFICE_DIORAMA_DEFAULT_TIME)
  return Number.isNaN(candidate.getTime())
    ? new Date(OFFICE_DIORAMA_DEFAULT_TIME)
    : candidate
}

export function officeDioramaDebugConfig(
  search: string,
  development = import.meta.env.DEV,
): OfficeDioramaDebugConfig | null {
  if (!development) return null

  const params = new URLSearchParams(search)
  if (params.get('fixture') !== OFFICE_DIORAMA_FIXTURE_KEY) return null

  const now = parseTime(params.get('debugTime'))
  const pilot: OfficeDioramaPilotMode =
    params.get('pilot') === 'kit' ? 'kit' : 'primitive'
  return {
    fixture: OFFICE_DIORAMA_FIXTURE_KEY,
    now,
    debugTime: now.toISOString(),
    timeZone: OFFICE_DIORAMA_TIME_ZONE,
    pilot,
    members: MEMBERS.map((member) => ({ ...member })),
  }
}

export function appendOfficeDioramaDebugParams(
  params: URLSearchParams,
  config: OfficeDioramaDebugConfig | null,
): URLSearchParams {
  if (!config) return params

  params.set('fixture', config.fixture)
  params.set('debugTime', config.debugTime)
  params.set('pilot', config.pilot)
  return params
}
