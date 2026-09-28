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

export interface OfficeWorldContext {
  mode: OfficeModeKey
  modeLabel: string
  dayKind: OfficeDayKind
  isOfficeOpen: boolean
  ambientOccupancyCap: number
  planningFreshMinutes: number
  clockLabel: string
  timeZone: string
  timeZoneLabel: string
  dayLabel: string
  localMinuteOfDay: number
  localDateKey: number
  weekdayIndex: number
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

interface OfficeLocalTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekdayIndex: number
  timeZoneLabel: string
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
    ambientOccupancyCap: 7,
    planningFreshMinutes: 75,
    isOfficeOpen: true,
  },
  {
    key: 'EVENING',
    label: 'Evening overtime',
    startMinute: 18 * 60,
    ambientOccupancyCap: 2,
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

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

function resolvedTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function normalizeOfficeTimeZone(timeZone?: string | null): string {
  const candidate = timeZone?.trim() || resolvedTimeZone()
  try {
    new Intl.DateTimeFormat('en', { timeZone: candidate }).format(new Date())
    return candidate
  } catch {
    return resolvedTimeZone()
  }
}

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPart['type'],
): string {
  return parts.find((candidate) => candidate.type === type)?.value ?? ''
}

function timeZoneLabel(now: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('id-ID', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(now)
    return part(parts, 'timeZoneName') || timeZone
  } catch {
    return timeZone
  }
}

function localTime(now: Date, timeZone: string): OfficeLocalTime {
  const normalized = normalizeOfficeTimeZone(timeZone)
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: normalized,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'short',
    }).formatToParts(now)

    const weekday = part(parts, 'weekday')
    return {
      year: Number(part(parts, 'year')),
      month: Number(part(parts, 'month')),
      day: Number(part(parts, 'day')),
      hour: Number(part(parts, 'hour')),
      minute: Number(part(parts, 'minute')),
      second: Number(part(parts, 'second')),
      weekdayIndex: WEEKDAY_INDEX[weekday] ?? now.getDay(),
      timeZoneLabel: timeZoneLabel(now, normalized),
    }
  } catch {
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
      second: now.getSeconds(),
      weekdayIndex: now.getDay(),
      timeZoneLabel: timeZoneLabel(now, normalized),
    }
  }
}

function minuteOfDay(local: OfficeLocalTime): number {
  return local.hour * 60 + local.minute
}

function isWeekend(local: OfficeLocalTime): boolean {
  return local.weekdayIndex === 0 || local.weekdayIndex === 6
}

function modeForWeekday(local: OfficeLocalTime): OfficeModeDefinition {
  const minute = minuteOfDay(local)
  let selected = WEEKDAY_MODES[0]

  for (const candidate of WEEKDAY_MODES) {
    if (candidate.startMinute <= minute) selected = candidate
  }

  return selected
}

function formatClock(local: OfficeLocalTime): string {
  return [
    String(local.hour).padStart(2, '0'),
    String(local.minute).padStart(2, '0'),
    String(local.second).padStart(2, '0'),
  ].join(':')
}

function formatDay(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en', {
      timeZone,
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

function nextWeekdayArrival(local: OfficeLocalTime): {
  minutes: number
  label: string
} {
  const current = minuteOfDay(local)
  let daysAhead = 1

  while (daysAhead <= 7) {
    const weekday = (local.weekdayIndex + daysAhead) % 7
    if (weekday !== 0 && weekday !== 6) {
      return {
        minutes: daysAhead * 24 * 60 - current + 7 * 60,
        label: formatMinute(7 * 60),
      }
    }
    daysAhead += 1
  }

  return { minutes: 7 * 24 * 60, label: formatMinute(7 * 60) }
}

function nextWeekdayEvent(local: OfficeLocalTime): {
  label: string
  timeLabel: string
  minutes: number
} {
  if (isWeekend(local)) {
    const next = nextWeekdayArrival(local)
    return {
      label: 'Next weekday arrival',
      timeLabel: next.label,
      minutes: next.minutes,
    }
  }

  const current = minuteOfDay(local)
  const future = WEEKDAY_MODES.find(
    (candidate, index) =>
      index > 0 &&
      candidate.startMinute > current &&
      !(candidate.key === 'NIGHT_QUIET' && candidate.startMinute === 0),
  )

  if (future) {
    return {
      label: NEXT_EVENT_LABELS[future.key] ?? future.label,
      timeLabel: formatMinute(future.startMinute),
      minutes: future.startMinute - current,
    }
  }

  const next = nextWeekdayArrival(local)
  return {
    label: 'Morning arrival',
    timeLabel: next.label,
    minutes: next.minutes,
  }
}

export function officeWorldContext(
  now = new Date(),
  requestedTimeZone?: string | null,
): OfficeWorldContext {
  const timeZone = normalizeOfficeTimeZone(requestedTimeZone)
  const local = localTime(now, timeZone)
  const dayKind: OfficeDayKind = isWeekend(local) ? 'WEEKEND' : 'WEEKDAY'
  const mode = dayKind === 'WEEKEND' ? WEEKEND_MODE : modeForWeekday(local)
  const next = nextWeekdayEvent(local)

  return {
    mode: mode.key,
    modeLabel: mode.label,
    dayKind,
    isOfficeOpen: mode.isOfficeOpen,
    ambientOccupancyCap: mode.ambientOccupancyCap,
    planningFreshMinutes: mode.planningFreshMinutes,
    clockLabel: formatClock(local),
    timeZone,
    timeZoneLabel: local.timeZoneLabel,
    dayLabel: formatDay(now, timeZone),
    localMinuteOfDay: minuteOfDay(local),
    localDateKey: local.year * 10_000 + local.month * 100 + local.day,
    weekdayIndex: local.weekdayIndex,
    nextEventLabel: next.label,
    nextEventTimeLabel: next.timeLabel,
    minutesUntilNextEvent: next.minutes,
  }
}

export function isPlanningPresenceFresh(
  updatedAt: string,
  now = new Date(),
  timeZone?: string | null,
): boolean {
  const updated = new Date(updatedAt).getTime()
  if (!Number.isFinite(updated)) return false

  const ageMinutes = Math.max(0, (now.getTime() - updated) / 60_000)
  return ageMinutes <= officeWorldContext(now, timeZone).planningFreshMinutes
}
