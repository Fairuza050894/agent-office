# Agent Office Current Milestone

## Current checkpoint

Current base:

```text
main@60fd03c
Phase 10B PR #12 merged
```

Current work:

```text
branch: phase-10c-time-context
checkpoint: def6ad4
phase: Phase 10C — Office World Time Context & Realistic Occupancy
```

## Status

- Phase 0–8 CLOSED
- Phase 9 vNext
  - Phase 9A CLOSED
  - Phase 9B CLOSED
  - Phase 9C CLOSED / MERGED
  - Phase 9D not started
  - Phase 9E not started
  - Phase 9F operational Activity Interpreter remains future work
- Phase 10 Living 3D Agent Office
  - Phase 10A CLOSED / MERGED
  - Phase 10B CLOSED / MERGED
  - Phase 10C IMPLEMENTED — automated runner hold; rendered review pending

Phase 10C remains presentation-only. It may affect clock, lighting, occupancy,
ambient presence, floor selection, and visual environment, but it may not create
or mutate operational execution truth.

## Phase 10C implemented scope

- explicit Office-world clock
- project/thread timezone -> browser timezone -> UTC fallback
- localized timezone badge
- live HH:MM:SS clock
- weekday/weekend schedule evaluation in Office timezone
- Office mode status
- next Office event + countdown
- truthful L1/L2/L3 occupancy badges
- realistic time-based ambient occupancy caps
- zero ambient occupancy after 22:00
- zero default weekend ambience
- planning-presence freshness windows
- stale durable planning records no longer keep virtual people physically present
- CLOSED office suppresses even fresh planning as physical presence; planning remains remote/durable
- explicit building lifecycle: Closed / Opening up / Open / Winding down
- mode-driven dynamic floor props and scene cues
- 1-second HUD clock with minute-level presence recalculation
- lighting synchronized to Office timezone
- polished Office scene command strip
  - workspace context separated from controls
  - clock / mode / presence / next-event hierarchy
  - concise active-floor summary
  - responsive and Maximize-safe layout
- richer Commons floor:
  - reception
  - community wall
  - collaboration hub
  - pantry / coffee
  - lounge
  - quiet room
  - game corner
  - parcel/personal lockers
  - snack/hydration storage
- richer Build floor:
  - engineering pod
  - dedicated QA lab
  - pairing island
  - documentation nook
  - ops/server rack
  - review wall
  - sprint board
  - charging/utility station
- richer Strategy floor:
  - planning table
  - meeting room
  - roadmap wall
  - decision pods
  - architecture/review area
  - breakout area
  - reference library
  - presentation sideboard
  - floor lamp
- floor-specific shell accents for Commons / Build / Strategy
- corrected rigged-character movement facing without changing station yaw
- specialist zone anchors aligned to the richer environment
- world occupancy cap enforced across baseline modes
- scheduled events reserve capacity before baseline ambience
- all zone capacities locked to actual 3D placement slots
- threadless/new-thread workspace resets to the correct ambient floor

## Time / truth boundary

Office mode is schedule context, not execution.

Examples:

```text
Night quiet != planning data disappears
Planning remains durable, but physical Office presence is suppressed while CLOSED.

Late office != factual overtime
No Run/AgentRun means no execution claim.

Weekend quiet != planning history deleted
Durable planning remains available in Composer/Dock.
```

Ambient occupancy:

```text
00:00–07:00  0
07:00–09:00  up to 9
09:00–12:00  up to 9
12:00–13:00  up to 9
13:00–15:00  up to 9
15:00–16:00  up to 9
16:00–18:00  up to 7
18:00–20:00  up to 2
20:00–22:00  up to 1
22:00–24:00  0
weekend       0 by default
```

Scheduled-event providers remain the explicit exception path and are still
capacity-bounded.

## Automated verification state

GitHub Actions currently cannot assign a runner to this branch.

Observed repeatedly:

```text
runner_id: 0
runner_name: ""
steps: []
frontend/backend/repository jobs terminate within seconds
latest confirmed: run 36464809996 on d8f3f53
```

This is an infrastructure/runner availability failure, not a test assertion.

Do not claim automated green until a run receives an actual runner and executes
the verification steps.

The code adds regression tests for:

- explicit timezone clock/mode
- same instant across different timezones
- evening -> late -> night occupancy reduction
- weekend quiet
- planning freshness by Office time
- invalid timezone fallback
- explicit timezone occupancy
- Office-world HUD
- richer specialist-zone placement

## Phase 10C rendered gate

Pending local visual review of:

- clock / timezone correctness
- Office mode correctness
- next-event correctness
- midnight/night occupancy
- stale vs recent planning persistence
- closed-office remote planning label
- building lifecycle label
- dynamic scene cues by Office mode
- timezone-synchronized lighting
- L1/L2/L3 visual differentiation
- QA / docs / roadmap / decision areas
- polished command-strip hierarchy and copy
- normal + Maximize command-strip layout
- Commons/Build/Strategy support-prop differentiation
- Composer and Operations Dock compatibility
- furniture/path clipping
- character travel direction vs visual facing

## Design and verification records

```text
docs/product/LIVING_3D_AGENT_OFFICE_PRD.md
docs/architecture/LIVING_OFFICE_TECHNICAL_DESIGN.md
docs/architecture/OFFICE_WORLD_SIMULATION.md
docs/product/PHASE_10A_VERIFICATION.md
docs/product/PHASE_10B_VERIFICATION.md
docs/product/PHASE_10C_VERIFICATION.md
```

## Deferred intentionally

Not implemented in Phase 10C:

- persistent Office settings in backend/database
- production prayer-time provider
- calendar integration
- compatible real seated / typing / talking animation pipeline
- factual operational Activity Interpreter
- rooftop floor
- weather-aware ambience
- user-configurable ambience density
- role-scoped persistent memory / Phase 9D runtime work

Keep the Phase 10C pull request Draft while automated verification is blocked
and rendered review is pending. Merge remains manual only.
