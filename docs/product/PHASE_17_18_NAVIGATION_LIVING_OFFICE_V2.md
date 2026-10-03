# Phase 17–18 — Navigation Hardening & Living Office V2

## Status

Stacked implementation checkpoint after Phase 15–16.

## Why these phases are combined

The repository already has a mature Living Office truth model: stage-aware work zones, bounded ambient occupancy, scheduled-event capacity, deterministic breaks, planning presence, work presence, right-of-way behavior, and time-zone-aware world modes. A separate large “Living Office rewrite” would duplicate accepted behavior.

Phase 17–18 therefore focuses on the remaining production gap: movement quality in the R3F production path while preserving that existing behavior engine.

## Delivered

### Deterministic corridor lane separation

`navigationPolicy.ts` adds renderer-neutral lane separation for Workspace/Living Office movement.

- each agent receives a deterministic left/right travel lane from stable identity;
- intermediate corridor waypoints receive a small lateral offset;
- the factual destination/station is never offset;
- points are clamped to the Office shell;
- duplicate and effectively-collinear micro-waypoints are removed;
- semantic room/path generation still comes from the existing environment graph.

This reduces exact head-on path overlap without introducing a physics engine, random steering, or non-deterministic simulation.

### Shared runtime integration

`moveOfficeRuntime()` now applies lane separation to `buildWorkspaceOfficePath()` output. Both current and future R3F consumers therefore inherit the same deterministic navigation policy rather than implementing renderer-specific movement logic.

### Living Office V2 truth retained

The accepted behavior engine already provides:

- Product, Analysis, Principal Engineering, Design, Backend, Frontend, QA, Security, and Technical Writing role homes;
- stage-aware routing to planning, architecture, QA, review, documentation, and engineering zones;
- canonical work presence from AgentRun assignments;
- lunch/coffee/scheduled breaks only when work state can truthfully leave the desk;
- planning presence separate from execution truth;
- bounded social-zone capacity and scheduled-event reservation;
- deterministic ambient role participation;
- after-hours occupancy limits;
- local-office time modes.

Phase 18 does not fabricate “busy” behavior to make the Office look active.

## Why no full physics engine

Rapier/Cannon-style rigid-body simulation is intentionally not introduced. The Office is an operational visualization, not a physics sandbox. Deterministic path policy is cheaper, testable, repeatable in Replay, and easier to keep consistent with business truth.

## Acceptance gates

```text
navigation policy tests
existing Living Office tests
frontend tests / typecheck / lint / build
backend pytest / Ruff / format / MyPy
production Office guard
Chromium Planning / Live / Replay R3F smoke
repository whitespace verification
```
