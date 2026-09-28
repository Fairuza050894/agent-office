export type OfficeDayKind = 'WEEKDAY' | 'WEEKEND'

export type OfficeModeKey =
  | 'NIGHT_QUIET'
  | 'ARRIVAL'
  | 'CORE_WORK'
  | 'LUNCH'
  | 'AFTERNOON_FOCUS'
  | 'COFFEE_BREAK'
  | 'WRAP_UP'
  | 'EVENING'
  | 'LATE_EVENING'
  | 'WEEKEND_QUIET'

export interface OfficeWorldEvent {
  key: OfficeModeKey
  label: string
  minuteOfDay: number
}

export interface OfficeWorldContext {
  mode: OfficeModeKey
  modeLabel: string
  dayKind: OfficeDayKind
  isOfficeOpen: boolean
  ambientOccupancyCap: number
  planningFreshMinutes: number
  clockLabel: string
  dayLabel: string
  nextEventLabel: string
  nextEventTimeLabel: string
  minutesUntilNextEvent: number
}

interface OfficeModeDefinition {
  key: OfficeModeKey
  label: string
  startMinute: number
  ambientOccupancyCap: number
  planningFreshMinutes: number
  isOfficeOpen: boolean
}

const WEEKDAY_MODES: OfficeModeDefinition[] = [
  {
    key: 'NIGHT_QUIET',
    label: 'Night quiet',
    startMinute: 0,
    ambientOccupancyCap: 0,
    planningFreshMinutes: 20,
    isOfficeOpen: false,
  },
  {
    key: 'ARRIVAL',
    label: 'Morning arrival',
    startMinute: 7 * 60,
    ambientOccupancyCap: 4,
    planningFreshMinutes: 45,
    isOfficeOpen: true,
  },
  {
    key: 'CORE_WORK',
    label: 'Core work hours',
    startMinute: 9 * 60,
    ambientOccupancyCap: 9,
    planningFreshMinutes: 90,
    isOfficeOpen: true,
  },
  {
    key: 'LUNCH',
    label: 'Lunch & quiet break',
    startMinute: 12 * 60,
    ambientOccupancyCap: 9,
    planningFreshMinutes: 75,
    isOfficeOpen: true,
  },
  {
    key: 'AFTERNOON_FOCUS',
    label: 'Afternoon focus',
    startMinute: 13 * 60,
    ambientOccupancyCap: 9,
    planningFreshMinutes: 90,
    isOfficeOpen: true,
  },
  {
    key: 'COFFEE_BREAK',
    label: 'Coffee break',
    startMinute: 15 * 60,
    ambientOccupancyCap: 9,
    planningFreshMinutes: 75,
    isOfficeOpen: true,
  },
  {
    key: 'WRAP_UP',
    label: 'Wrap-up',
    startMinute: 16 * 60,
    ambientOccupancyCap: 8,
    planningFreshMinutes: 75,
    isOfficeOpen: true,
  },
  {
    key: 'EVENING',
    label: 'Evening overtime',
    startMinute: 18 * 60,
    ambientOccupancyCap: 3,
    planningFreshMinutes: 45,
    isOfficeOpen: true,
  },
  {
    key: 'LATE_EVENING',
    label: 'Late overtime',
    startMinute: 20 * 60,
    ambientOccupancyCap: 1,
    planningFreshMinutes: 30,
    isOfficeOpen: true,
  },
  {
    key: 'NIGHT_QUIET',
    label: 'Night quiet',
    startMinute: 22 * 60,
    ambientOccupancyCap: 0,
    planningFreshMinutes: 20,
    isOfficeOpen: false,
  },
]

const WEEKEND_MODE: OfficeModeDefinition = {
  key: 'WEEKEND_QUIET',
  label: 'Weekend quiet',
  startMinute: 0,
  ambientOccupancyCap: 0,
  planningFreshMinutes: 20,
  isOfficeOpen: false,
}

const NEXT_EVENT_LABELS: Partial<Record<OfficeModeKey, string>> = {
  ARRIVAL: 'Morning arrival',
  CORE_WORK: 'Core work',
  LUNCH: 'Lunch & quiet break',
  AFTERNOON_FOCUS: 'Afternoon focus',
  COFFEE_BREAK: 'Coffee break',
  WRAP_UP: 'Wrap-up',
  EVENING: 'Evening overtime',
  LATE_EVENING: 'Late overtime',
  NIGHT_QUIET: 'Night quiet',
}

function minuteOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes()
}

function isWeekend(now: Date): boolean {
  const day = now.getDay()
  return day === 0 || day === 6
}

function modeForWeekday(now: Date): OfficeModeDefinition {
  const minute = minuteOfDay(now)
  let selected = WEEKDAY_MODES[0]

  for (const candidate of WEEKDAY_MODES) {
    if (candidate.startMinute <= minute) selected = candidate
  }

  return selected
}

function formatClock(now: Date): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    })
      .format(now)
      .replace('.', ':')
  } catch {
    return now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }
}

function formatDay(now: Date): string {
  try {
    return new Intl.DateTimeFormat('en', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    }).format(now)
  } catch {
    return now.toDateString()
  }
}

function formatMinute(minute: number): string {
  const normalized = ((minute % (24 * 60)) + 24 * 60) % (24 * 60)
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function nextWeekdayArrival(now: Date): { minutes: number; label: string } {
  const current = minuteOfDay(now)
  let daysAhead = 1

  while (daysAhead <= 7) {
    const candidate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + daysAhead,
    )
    if (!isWeekend(candidate)) {
      const minutes = daysAhead * 24 * 60 - current + 7 * 60
      return { minutes, label: formatMinute(7 * 60) }
    }
    daysAhead += 1
  }

  return { minutes: 7 * 24 * 60, label: formatMinute(7 * 60) }
}

function nextWeekdayEvent(now: Date): {
  label: string
  timeLabel: string
  minutes: number
} {
  if (isWeekend(now)) {
    const next = nextWeekdayArrival(now)
    return {
      label: 'Next weekday arrival',
      timeLabel: next.label,
      minutes: next.minutes,
    }
  }

  const current = minuteOfDay(now)
  const future = WEEKDAY_MODES.find(
    (candidate, index) =>
      index > 0 &&
      candidate.startMinute > current &&
      !(
        candidate.key === 'NIGHT_QUIET' &&
        candidate.startMinute === 0
      ),
  )

  if (future) {
    return {
      label: NEXT_EVENT_LABELS[future.key] ?? future.label,
      timeLabel: formatMinute(future.startMinute),
      minutes: future.startMinute - current,
    }
  }

  const next = nextWeekdayArrival(now)
  return {
    label: 'Morning arrival',
    timeLabel: next.label,
    minutes: next.minutes,
  }
}

export function officeWorldContext(now = new Date()): OfficeWorldContext {
  const dayKind: OfficeDayKind = isWeekend(now) ? 'WEEKEND' : 'WEEKDAY'
  const mode = dayKind === 'WEEKEND' ? WEEKEND_MODE : modeForWeekday(now)
  const next = nextWeekdayEvent(now)

  return {
    mode: mode.key,
    modeLabel: mode.label,
    dayKind,
    isOfficeOpen: mode.isOfficeOpen,
    ambientOccupancyCap: mode.ambientOccupancyCap,
    planningFreshMinutes: mode.planningFreshMinutes,
    clockLabel: formatClock(now),
    dayLabel: formatDay(now),
    nextEventLabel: next.label,
    nextEventTimeLabel: next.timeLabel,
    minutesUntilNextEvent: next.minutes,
  }
}

export function isPlanningPresenceFresh(
  updatedAt: string,
  now = new Date(),
): boolean {
  const updated = new Date(updatedAt).getTime()
  if (!Number.isFinite(updated)) return false

  const ageMinutes = Math.max(0, (now.getTime() - updated) / 60_000)
  return ageMinutes <= officeWorldContext(now).planningFreshMinutes
}
