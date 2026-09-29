# Agent Office Current Milestone

## Current checkpoint

Current base:

```text
main@a0dea88
Phase 10C PR #13 merged
```

Current work:

```text
branch: phase-10d-unified-agent-office
checkpoint: b17dbde
phase: Phase 10D — Unified Agent Office Experience
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
  - Phase 10C CLOSED / MERGED
  - Phase 10D IMPLEMENTED — automated runner hold; rendered review pending

## One Agent Office model

Agent Office is one experience with three truth scopes:

```text
WORKSPACE
  planning + ambient Office world

LIVE
  canonical Run / AgentRun projection

REPLAY
  historical canonical Run / AgentRun / Event projection
```

Routes remain compatible deep-link entry points:

```text
/office
/runs/:runId/office
/runs/:runId/office?mode=replay
```

They are not separate products.

Shared presentation infrastructure includes:

- L1 Commons / L2 Build / L3 Strategy
- Three.js environment and character runtime
- camera language
- Agent Office command rail
- Operations Dock
- shared lift core
- floor identity and presentation vocabulary

Truth sources remain strictly separated.

## Phase 10D implemented scope

### Experience continuity

- unified scope rail: Workspace / Live / Replay
- selected floor survives scope transitions through route state
- selected Project survives Workspace refresh through route state
- explicit floor deep links remain authoritative over async planning restore
- Live / Replay URL and visual scope stay synchronized
- latest Project Run is directly reachable from Workspace
- one shared lift core occupies the same location on every floor

### UX simplification

Primary navigation:

```text
Office
Projects
Runs
```

Specialist Engineering / Observability / Control surfaces remain available under
`More tools`.

Operational Live / Replay no longer render an inert Universal Composer.

Planning remains in Workspace.

Run secondary actions are consolidated under a compact Run controls menu.

The duplicate wall clock was removed from the top command rail. Workspace keeps
the Office-world clock as the authoritative temporal context.

### Building identity

Commons:

- reception / arrival
- pantry and coffee
- lounge / collaboration
- quiet room
- game area
- parcel / personal lockers
- snack / hydration utility
- acoustic phone / focus pods

Build:

- engineering pod
- QA lab
- pairing island
- documentation nook
- review wall
- ops/server rack
- sprint board
- charging utility
- print / artifact station
- standing incident huddle point

Strategy:

- planning table
- meeting room
- roadmap wall
- architecture / review
- decision pods
- breakout area
- reference library
- presentation sideboard
- floor lamp
- prototype / decision plinths

Each floor has one semantic floor-detail group and one shared lift core.

## Bugs closed in Phase 10D

1. duplicate lift geometry could be rendered twice on each floor
2. Workspace Project selection could leave stale URL state
3. selected floor could be lost when switching Workspace / Live / Replay
4. async planning restore could override an explicit floor deep link
5. Run scope carried an inert disabled Composer
6. unavailable scopes looked interactive
7. Replay connection copy could imply live EventSource activity
8. floor changes could unnecessarily trigger unrelated data work

Replay movement-facing fix from Phase 10C remains rendered PASS.

## Truth boundary

```text
Workspace presence != execution
Animation != Evidence
Live / Replay require canonical Run truth
Ambient personas never become AgentRuns
Replay changes playback presentation, not historical truth
```

## Automated verification state

GitHub Actions still cannot assign a runner on the Phase 10D branch.

Latest confirmed shape:

```text
frontend/backend/repository
runner: none
steps: null
jobs terminate before verification executes
```

This is not an assertion result.

Do not claim automated green until a runner actually executes:

- backend pytest
- Ruff
- Ruff format
- MyPy
- frontend Vitest
- typecheck
- lint
- production build
- repository whitespace checks

An independent sandbox clone was attempted but the execution sandbox cannot
resolve github.com, so local verification is not available from this environment.

## Phase 10D rendered gate

Pending local verification:

- Workspace -> Live -> Replay feels like one persistent Agent Office
- selected floor survives every scope transition
- Project context survives return to Workspace
- Live / Replay contain no inert Composer
- exactly one lift appears on every floor
- lift stays in the same physical location on L1/L2/L3
- new micro-zones do not obstruct movement
- Commons / Build / Strategy are immediately distinguishable
- unavailable scopes read as disabled
- Live movement remains correct
- Replay movement remains correct
- inspector and Operations Dock remain usable
- normal / collapsed-navigation / Maximize layouts remain clean
- no ambient state leaks into canonical Live or Replay truth

## Design and verification records

```text
docs/architecture/UNIFIED_AGENT_OFFICE.md
docs/product/PHASE_10D_VERIFICATION.md
docs/product/LIVING_3D_AGENT_OFFICE_PRD.md
docs/architecture/LIVING_OFFICE_TECHNICAL_DESIGN.md
docs/architecture/OFFICE_WORLD_SIMULATION.md
```

## Deferred intentionally

- actual elevator ride / cross-floor character animation
- persisted camera pose across browser sessions
- validated seated / typing / talking animation retargeting pipeline
- rooftop floor
- production prayer-time/calendar providers
- factual operational Activity Interpreter
- Phase 9D role-scoped memory
- Phase 9E planning-to-execution promotion

Keep Phase 10D Draft while automated verification is blocked and rendered
review is pending. Merge remains manual only.
