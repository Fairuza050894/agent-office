# Office World Simulation — Technical Design

Status: Phase 10C implementation contract  
Branch: `phase-10c-time-context`

## Purpose

Phase 10C adds a deterministic office-world clock and realistic occupancy layer
to the Living 3D Agent Office.

The world layer explains **when** the office is open, quiet, in lunch/coffee
mode, or in a late session. It does not create operational work.

Core rule:

> Office schedule is presentation context. Run / AgentRun remain the source of
> operational truth.

## Timezone model

The Office always resolves an explicit IANA timezone.

Priority:

1. active ComposerThread timezone
2. browser-local timezone
3. UTC fallback when the runtime cannot resolve a local timezone

All of these must use the same resolved office timezone:

- clock badge
- weekday/weekend detection
- office mode
- occupancy cap
- staggered arrival
- daily role rotation
- planning freshness window
- time-of-day lighting

This prevents a UI where the clock says morning while the 3D scene still renders
night lighting.

Invalid timezones fall back safely and never throw during rendering.

## Office modes

Weekday baseline:

```text
00:00–07:00  NIGHT_QUIET       ambient cap 0
07:00–09:00  ARRIVAL           ambient cap 9
09:00–12:00  CORE_WORK         ambient cap 9
12:00–13:00  LUNCH             ambient cap 9
13:00–15:00  AFTERNOON_FOCUS   ambient cap 9
15:00–16:00  COFFEE_BREAK      ambient cap 9
16:00–18:00  WRAP_UP           ambient cap 7
18:00–20:00  EVENING           ambient cap 2
20:00–22:00  LATE_EVENING      ambient cap 1
22:00–24:00  NIGHT_QUIET       ambient cap 0
```

Weekend baseline:

```text
WEEKEND_QUIET
ambient cap 0
```

The terms "Evening wind-down" and "Late office" are intentional. Ambient
presentation must not label people as working overtime unless future canonical
execution truth supports that claim.

## Planning freshness

Durable planning records are not automatically physical office presence forever.

The selected planning thread may render planning presence only while its
`updated_at` timestamp is within the current mode's freshness window.

Typical thresholds:

```text
night quiet      20 minutes
arrival          45 minutes
core work        90 minutes
lunch            75 minutes
afternoon focus  90 minutes
coffee           75 minutes
wrap-up          75 minutes
evening          45 minutes
late evening     30 minutes
weekend          20 minutes
```

A stale planning record remains durable in Composer/Operations Dock but does not
keep virtual people in the building indefinitely.

## Occupancy truth

Ambient occupancy is capped by the office mode.

Examples:

- after 22:00 -> zero ambient people
- 20:00–22:00 -> at most one ambient person
- 18:00–20:00 -> at most two ambient people
- weekend -> zero ambient people unless an explicit scheduled event exists

Recent planning truth may still render during a quiet office window. This is
different from ambient occupancy and remains labeled as planning truth.

## Scheduled events

Existing `OfficeScheduledEvent` remains the extension point for future
calendar, prayer, or organization-specific schedules.

Scheduled events:

- use absolute `startsAt` / `endsAt` timestamps
- have explicit priority
- can target role keys
- have bounded participant count
- cannot exceed physical zone capacity
- reserve target-zone capacity before lower-priority baseline ambience

Prayer times are deliberately **not hard-coded**. A future prayer schedule
provider can emit scheduled events into the same resolver.

## Live clock architecture

The visual clock updates every second.

3D presence does **not** recompute every second.

```text
1-second clock tick
  -> OfficeWorldContext / HUD only

minute boundary
  -> Living Office presence recalculation
  -> potential movement / occupancy transition
```

This keeps the clock alive without rebuilding the scene continuously.

## World HUD

Workspace Office exposes four compact status cards:

- timezone + HH:MM:SS + date
- Office mode
- total presence across floors
- next event + countdown

The HUD is explanatory state, not telemetry evidence.

## Floor identity

Phase 10C also increases visual differentiation between floors.

### L1 Commons

Adds:

- reception corner
- community / announcement wall
- existing lounge
- pantry / coffee
- quiet room
- game corner
- collaboration hub

### L2 Build

Adds:

- engineering workstations
- dedicated QA lab
- pairing island
- documentation nook
- ops/server rack
- review wall

### L3 Strategy

Adds:

- planning table
- meeting room
- roadmap wall
- decision pods
- architecture/review area
- breakout/focus area

Specialist presence anchors are aligned with these spaces rather than pointing
back to generic central desks.

## Safety invariants

- animation is never evidence
- presence is not execution
- office mode is not execution status
- "available" must not be rendered as factual active work
- night/weekend ambience must not invent overtime
- stale planning truth stays in planning history but may leave the physical scene
- all Office zones have an explicit semantic capacity equal to their physical 3D slot count
- scheduled ambience cannot exceed physical zone capacity
- scheduled + baseline ambience stays within the current Office-mode population cap, except during a closed-office explicit event where the scheduled event is the only allowed presence
- changing floor/timezone must never create Task, Run, AgentRun, or repository mutation
