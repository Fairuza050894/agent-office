# Agent Office Current Milestone

## Current checkpoint

```text
main@0eff0f4
Phase 10H-1 merged
PR #24 Vocabulary & Structure merged
PR #25 Office 3D experience polish merged
PR #27 Phase 6 Codex test hardening merged
PR #29 Office Diorama V0 merged
PR #30 Office Diorama V1 merged
PR #31 Office Diorama V2 asset pilot merged
PR #32 Office Diorama V3 Build rollout merged
PR #33 Phase 12 R3F renderer pilot merged
PR #35 Phase 13A R3F Planning production migration merged
PR #36 post-Phase-13A milestone sync merged
PR #37 Phase 13B R3F Live production migration merged
PR #38 Phase 13C R3F Replay production migration open
```

Canonical full verification:

```bash
./scripts/verify.sh
```

## Current status

```text
Phase 13C — IN PROGRESS
base: 0eff0f4003750809b7d841f6e111be93a45d260d
branch: phase-13c-r3f-replay-production
PR: #38
```

## Phase 13C checkpoint scope

- Planning Office remains on the accepted R3F production renderer.
- Live operational Office remains on the accepted R3F production renderer.
- Historical Replay moves to R3F production.
- Replay preserves the canonical `officeReplayRange()` / `officeReplayPlan()` factual timing contract.
- Replay preserves hidden/PENDING -> STARTING -> station movement -> RUNNING -> canonical final status presentation.
- Replay movement retains the dedicated replay-facing yaw contract that prevents backwards-walking regressions.
- Planning, Live, and Replay retain the R3F -> Three.js React fallback boundary.
- The outer operational HTML boundary remains available independently of the WebGL renderer.
- Three.js remains fallback code and is not removed in this checkpoint.
- No backend, schema, executor, workflow-truth, fake dialogue, fake tests, fake collaboration, or fake progress change is in scope.
- No large visual redesign, post-processing stack, physics migration, or Unity migration is in scope.

Phase 13C implementation details:

```text
docs/product/PHASE_13C_R3F_REPLAY_PRODUCTION.md
frontend/src/components/R3FOfficeScene.tsx
frontend/src/components/OfficeScene.tsx
frontend/src/components/OfficeScene.test.tsx
frontend/scripts/check-office-r3f-production.mjs
frontend/scripts/check-office-debug-production.mjs
```

Required verification for the exact PR head:

```text
backend pytest / Ruff / format / MyPy
frontend tests / typecheck / lint / build
repository whitespace verification
production Office bundle guard
Chromium production smoke:
  Planning = R3F
  Live = R3F
  Replay = R3F
  Three.js = fallback-only during successful smoke
```

## Phase 13B accepted production state

Merge commit:

```text
0eff0f4003750809b7d841f6e111be93a45d260d
```

Exact PR #37 head and verification:

```text
43af73aacefe2452faf0512faf9e8374678eb576
GitHub Actions verify #1386: SUCCESS
```

Gates:

```text
backend pytest / Ruff / format / MyPy: PASS
frontend tests / typecheck / lint / build: PASS
repository whitespace: PASS
production Office guard: PASS
production renderer split Chromium smoke: PASS
```

Accepted Phase 13B renderer state:

```text
Planning = R3F
Live = R3F
Replay = Three.js
```

Detailed Phase 13B evidence:

```text
docs/product/PHASE_13B_R3F_LIVE_PRODUCTION.md
frontend/src/office3d/runtimeProjection.ts
frontend/src/components/R3FOfficeScene.tsx
frontend/src/components/ThreeOfficeScene.tsx
frontend/scripts/check-office-r3f-production.mjs
```

## Phase 13A accepted production state

- Planning Office uses R3F in normal production rendering.
- Three.js remains the tested Planning fallback.
- Live and Replay remained on the existing Three.js renderer at the Phase 13A acceptance point.
- Task / Run / AgentRun / Event truth remains outside the renderer.
- R3F is a production dependency because Planning consumes it.
- Production bundle guard requires the production R3F Planning path and rejects Diorama/debug leakage.
- Production Chromium smoke verifies Planning R3F loads successfully.
- No visual redesign, post-processing stack, or workflow-truth change was made in Phase 13A.

## Phase 13A final verification

Exact PR head:

```text
0ecabadd2d01834d18b2878bc71d0582068afab4
GitHub Actions verify #1376: SUCCESS
```

Gates:

```text
backend pytest / Ruff / format / MyPy: PASS
frontend tests / typecheck / lint / build: PASS
repository whitespace: PASS
production Office guard: PASS
production R3F Planning Chromium smoke: PASS
```

Detailed Phase 13A evidence:

```text
docs/product/PHASE_13A_R3F_PLANNING_PRODUCTION.md
docs/product/PHASE_13A_R3F_PLANNING_PRODUCTION_VERIFICATION.md
docs/product/PHASE_12_R3F_RENDERER_PILOT_VERIFICATION.md
docs/architecture/ADR-0004-office-renderer-evolution.md
docs/ux/OFFICE_VIEW.md
```

## Truth and safety boundary

Every later renderer/visual checkpoint must preserve:

- canonical execution/replay truth;
- tested Three.js fallback until a separate fallback-retirement decision is accepted;
- accessibility through HTML operational surfaces;
- reduced-motion behavior;
- deterministic visual/performance gates;
- no fake progress, collaboration, dialogue, testing, or execution state;
- one checkpoint per PR.
