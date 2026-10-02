# Agent Office Current Milestone

## Current checkpoint

```text
base main@e40b1b4
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
PR #37 Phase 13B R3F Live production migration DRAFT
```

Canonical full verification:

```bash
./scripts/verify.sh
```

## Current status

```text
Phase 13B — IN PROGRESS
base: e40b1b48f0b7262edaaa0a342b943ef46f97189f
branch: phase-13b-r3f-live-production
PR: #37 (Draft)
```

## Phase 13B checkpoint scope

- Planning Office remains on the accepted R3F production renderer.
- Live operational Office moves to R3F production.
- Replay remains on Three.js and is not migrated in this checkpoint.
- Planning and Live retain the R3F -> Three.js fallback boundary.
- Three.js and R3F share renderer-neutral AgentRun/member/state/path projection.
- Canonical Task / Run / AgentRun / Event truth remains outside the renderer.
- The outer operational HTML boundary remains available independently of the
  WebGL renderer.
- No backend, schema, executor, or workflow-truth change is in scope.
- No visual redesign, post-processing, physics, or Unity is in scope.

Phase 13B implementation details:

```text
docs/product/PHASE_13B_R3F_LIVE_PRODUCTION.md
frontend/src/office3d/runtimeProjection.ts
frontend/src/components/R3FOfficeScene.tsx
frontend/src/components/ThreeOfficeScene.tsx
frontend/scripts/check-office-r3f-production.mjs
```

Required verification for the exact PR head:

```text
backend pytest / Ruff / format / MyPy
frontend tests / typecheck / lint / build
repository whitespace verification
production Office bundle guard
Chromium renderer split smoke:
  Planning = R3F
  Live = R3F
  Replay = Three.js
```

Replay migration requires a later independent checkpoint with deterministic
replay evidence. Do not combine it into Phase 13B.

## Phase 13A accepted production state

- Planning Office uses R3F in normal production rendering.
- Three.js remains the tested Planning fallback.
- Live and Replay remained on the existing Three.js renderer at the Phase 13A
  acceptance point.
- Task / Run / AgentRun / Event truth remains outside the renderer.
- R3F is a production dependency because Planning consumes it.
- Production bundle guard requires the production R3F Planning path and rejects
  Diorama/debug leakage.
- Production Chromium smoke verifies Planning R3F loads successfully.
- No visual redesign, post-processing stack, or workflow-truth change was made
  in Phase 13A.

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

Every later renderer checkpoint must preserve:

- canonical execution/replay truth;
- tested Three.js fallback until a separate cutover is accepted;
- accessibility through HTML operational surfaces;
- reduced-motion behavior;
- deterministic visual/performance gates;
- no fake progress, collaboration, dialogue, or execution state;
- one checkpoint per PR.
