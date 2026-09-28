# Agent Office Current Milestone

## Current checkpoint

Current base:

```text
main@21afb8e
Phase 10A PR #11 merged
```

Current work:

```text
branch: phase-10b-presence-behavior
code checkpoint: 3755fe3
phase: Phase 10B — Living Office Presence Behavior
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
  - Phase 10B IN PROGRESS — code green; rendered review pending

Phase 10B remains a presentation slice. It may project durable planning truth and
ambient schedule state, but it may not fabricate operational execution.

## Phase 10B implemented scope

Current Phase 10B provides:

- explicit Office behavior vocabulary
  - ARRIVAL
  - AVAILABLE
  - DESK_FOCUS
  - PLANNING_MEETING
  - WAITING_DECISION
  - COFFEE_CHAT
  - LUNCH
  - SOCIAL_CHAT
  - GAME_BREAK
  - PRAYER_QUIET
  - OFFLINE
- deterministic role-specific ambient preferences
- staggered arrival by role
- bounded daily coffee participation
- bounded daily lunch participation
- bounded after-hours occupancy
- planning roles excluded from ambient duplication
- deterministic ten-minute ambience beats
- per-member placement indices
- collision-conscious zone slot reservation
- movement through the existing shared Three.js path loop
- compact selected-member inspector
- explicit Planning truth vs Ambient presentation label
- selected-floor behavior summary
- morning / day / evening / night lighting profiles
- behavior-aware character runtime with safe local-clip fallback
- ambient-zone capacity enforcement
- priority scheduled-event capacity reservation
- scheduled participant clamping to physical zone capacity
- semantic capacity parity tests against actual 3D zone slots
- cross-floor stale inspector protection
- local-calendar daily role rotation
- existing Run Office compatibility

## Truthfulness boundary

Canonical planning truth remains:

```text
ComposerThread
ComposerMessage
TeamProposal
PlanningArtifact
RequirementCandidate
PlanningEvent
```

Canonical operational truth remains:

```text
Task
Run
AgentRun
Workspace
Event
Finding
Evidence
```

Living Office presentation state includes:

```text
OfficeFloor
OfficeZone
OfficePresenceMember
OfficeBehaviorKey
OfficeScheduledEvent
placementIndex
lighting profile
```

Rules:

- animation is never evidence
- presence is not execution
- ambient behavior may not claim repository-changing work
- planning presence is not AgentRun
- AVAILABLE is not rendered as active execution
- DEFERRED / EXCLUDED planning roles are not active planning workers
- missing animation capability must fall back safely rather than be simulated

## Character-animation compatibility finding

Phase 10B audited the CC0 Quaternius Universal Animation Library:

```text
J-Ponzo/gltf-universal-animation-library
commit e24c23cf2a1323488a3faa226ea7ea21f644b73e
```

Useful free clips exist, including sitting and talking loops.

A strict build-time compatibility check rejected the library against the five
current Agent Office character variants because the animation library targets a
newer `DEF-*` skeleton while the current character assets use a different rig.

The attempted integration was fully rolled back.

Current policy:

- ship only the already verified character assets
- guarantee Idle / Walk / Run only
- behavior-specific clip lookup falls back to Idle
- no runtime retargeting hack
- no seated props at active character anchors until compatible animation exists

## Current quality gate

Implementation checkpoint:

```text
3755fe3 test: reserve priority event zone capacity
```

GitHub Actions run `36455559684` is GREEN:

```text
backend pytest      657 passed
ruff                passed
ruff format         203 files already formatted
mypy                0 issues / 136 source files
frontend vitest     18 files / 99 tests passed
frontend typecheck  passed
frontend lint       0 errors / 2 existing warnings
frontend build      passed
repository check    passed
```

The two frontend warnings are the pre-existing `ThreeOfficeScene`
`startLoop` exhaustive-deps warnings.

## Phase 10B hardening audit

The final code audit closed five non-visual edge cases before rendered review:

- lunch/coffee zone over-subscription
- scheduled-event capacity races with baseline ambience
- scheduled participant counts larger than target-zone capacity
- selected inspector persisting after a member leaves the visible floor
- UTC-based daily role rotation

These are covered by the `3755fe3` checkpoint and the 99-test frontend suite.

## Phase 10B rendered gate

Pending local visual review of:

- night lighting readability
- after-hours role-specific placement on L1
- selected-member inspector
- ambient movement across a ten-minute boundary
- TDP planning behavior on L3
- AWAITING_USER / Waiting for you state
- furniture/path clipping during movement
- quiet L2 behavior without execution truth
- Composer / Operations Dock compatibility

## Design and verification records

```text
docs/product/LIVING_3D_AGENT_OFFICE_PRD.md
docs/architecture/LIVING_OFFICE_TECHNICAL_DESIGN.md
docs/product/PHASE_10A_VERIFICATION.md
docs/product/PHASE_10B_VERIFICATION.md
```

## Deferred intentionally

Not implemented in Phase 10B:

- compatible real seated / typing / talking animation pipeline
- runtime skeleton retargeting
- persistent Office timezone / working-hour settings
- production prayer-time provider
- factual operational Activity Interpreter
- rooftop floor
- user-configurable ambience density
- role-scoped persistent memory / Phase 9D runtime work

Keep the Phase 10B pull request Draft until rendered Living Office behavior
review passes. Merge remains manual only.
