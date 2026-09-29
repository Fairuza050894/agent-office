# Phase 10D Verification — Unified Agent Office

Status: IMPLEMENTED / AUTOMATED RUNNER HOLD / RENDERED REVIEW PENDING
Date: 2026-09-29
Branch: `phase-10d-unified-agent-office`

## Goal

Turn Workspace, Live Run, and Historical Replay into scopes of one Agent Office
experience while simplifying chrome and making the building more spatially
coherent and less repetitive.

## Implemented

### Unified scope rail

```text
Workspace | Live | Replay
```

- Workspace links to the selected Project.
- Live links to the selected/latest Run.
- Replay links to the same Run with historical playback mode.
- unavailable Live / Replay scopes are visibly disabled.

### Route continuity

Floor is a first-class presentation parameter:

```text
floor=commons
floor=build
floor=strategy
```

Scope switching carries the selected floor forward.

Workspace Project changes update route state so refresh does not silently return
to an older Project.

Explicit floor deep links remain authoritative over asynchronous planning-thread
restoration.

### Operational simplification

Live / Replay no longer render an inert Universal Composer.

Operational scopes contain:

- one Agent Office command rail
- shared 3D scene
- transient Agent inspector
- Bottom Operations Dock
- compact Run controls

Planning remains in Workspace and is one scope switch away.

### Navigation simplification

Primary navigation remains:

- Office
- Projects
- Runs

Engineering / observability / control registries remain under `More tools`.

### Shared-building continuity

- one semantic lift core per floor
- same lift location across Commons / Build / Strategy
- duplicate lift-core render bug removed
- floor-specific semantic detail groups

### Richer floor identity

Commons gains:

- acoustic phone / focus pods
- lockers
- snack / hydration utility

Build gains:

- sprint board
- charging utility
- print / artifact station
- standing incident huddle point

Strategy gains:

- reference library
- prototype / decision plinths
- presentation support furniture

These additions remain outside canonical truth.

## Regression coverage added

- accepted Office floor deep-link values
- Workspace floor deep-link restoration
- Run / Replay floor continuity
- Workspace link preserves selected floor
- operational scope does not render Universal Composer
- exactly one semantic lift core exists per floor
- only the correct floor-detail semantic group exists on each floor

## Bugs closed during Phase 10D audit

1. duplicate lift core rendered twice per floor
2. project selection could leave stale Workspace URL state
3. selected floor was lost between Workspace / Live / Replay
4. asynchronous planning restore could override an explicit floor deep link
5. operational Run scope carried an inert Composer
6. scope test contract still expected obsolete `Live Run` wording
7. unavailable scope controls visually looked clickable
8. Replay EventSource status could read like live activity

## Automated verification state

GitHub Actions currently terminates before assigning runners.

Latest observed shape:

```text
runner_id: 0 / none
runner_name: empty
steps: null
frontend/backend/repository finish as failure before execution
```

Do not claim automated green until GitHub assigns a runner and executes the
actual steps.

A sandbox clone was also attempted for independent verification, but the
execution sandbox has no outbound DNS access to github.com.

## Rendered acceptance required

1. Workspace -> Live -> Replay feels like one Agent Office rather than three
   unrelated pages.
2. selected floor survives every scope transition.
3. selected Project survives return to Workspace.
4. Live / Replay contain no disabled/inert Composer.
5. floor switching does not trigger unnecessary data reload.
6. exactly one lift is visible on every floor.
7. lift remains in the same physical location between floors.
8. new Commons / Build / Strategy micro-zones do not obstruct character paths.
9. Live movement remains correct.
10. Historical Replay movement remains correct.
11. scope controls remain usable in normal and Maximize layouts.
12. unavailable scopes look disabled rather than clickable.
13. Operations Dock and inspector remain usable.
14. no ambient behavior leaks into canonical Live / Replay truth.

## Deferred intentionally

- real elevator ride / cross-floor character transition animation
- persisted camera pose across browser sessions
- real seated / typing / talking retargeted clips
- rooftop floor
- production prayer/calendar providers
- operational Activity Interpreter
- Phase 9D role-scoped memory
- Phase 9E planning -> execution promotion

