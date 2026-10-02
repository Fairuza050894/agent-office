# Agent Office Current Milestone

## Current checkpoint

```text
base main@e40b1b4
Phase 13A R3F Planning production migration merged
Phase 13B R3F Live production migration IN PROGRESS
branch: phase-13b-r3f-live-production
```

Canonical full verification:

```bash
./scripts/verify.sh
```

## Current status

```text
Phase 13B — IN PROGRESS
base: e40b1b48f0b7262edaaa0a342b943ef46f97189f
PR: #37 (Draft)
```

## Phase 13B scope

- Planning remains on R3F production.
- Live operational Office moves to R3F production.
- Replay remains on Three.js.
- Planning and Live retain R3F -> Three.js fallback behavior.
- Three.js and R3F share renderer-neutral AgentRun/member/state/path projection.
- Canonical Task / Run / AgentRun / Event truth remains outside the renderer.
- No backend, schema, executor, or workflow-truth change is in scope.
- No visual redesign, post-processing, physics, or Unity is in scope.

Detailed checkpoint:

```text
docs/product/PHASE_13B_R3F_LIVE_PRODUCTION.md
docs/product/PHASE_13A_R3F_PLANNING_PRODUCTION.md
docs/architecture/ADR-0004-office-renderer-evolution.md
docs/ux/OFFICE_VIEW.md
```

## Required verification

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

Replay migration requires a later independent checkpoint. Do not combine it
into Phase 13B.
