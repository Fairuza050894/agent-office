# Agent Office Current Milestone

## Current checkpoint

```text
main@478572a
Phase 10H-1 merged
PR #24 Vocabulary & Structure merged
PR #25 Office 3D experience polish merged
PR #27 Phase 6 Codex test hardening merged
PR #29 Office Diorama V0 merged
PR #30 Office Diorama V1 merged
PR #31 Office Diorama V2 asset pilot merged
PR #32 Office Diorama V3 Build rollout merged
```

Canonical full verification:

```bash
./scripts/verify.sh
```

## Current work

```text
branch: phase-12-r3f-renderer-pilot
pr: #33
scope: Phase 12 — R3F renderer pilot
status: IMPLEMENTED / AUTOMATED VERIFIED / RENDERED COMPARISON PENDING
```

## Phase 12 authority

Read:

```text
docs/product/PHASE_12_R3F_RENDERER_PILOT.md
docs/architecture/ADR-0004-office-renderer-evolution.md
docs/ux/OFFICE_R3F_REFERENCE_REVIEW.md
docs/ux/OFFICE_VIEW.md
```

## Scope

- add React Three Fiber as a pilot-only renderer dependency;
- preserve current Three.js renderer as production/default;
- add deterministic `renderer=three|r3f` fixture selection;
- reuse existing floor, furniture, character, camera, and lighting contracts;
- add Three-vs-R3F screenshot/renderer evidence;
- keep V1/V2 performance and lighting ceilings;
- keep pilot code out of production output.

## Explicitly deferred

- Live/Replay R3F migration;
- full production renderer replacement;
- Drei dependency;
- AO/Bloom/SMAA/Vignette/post-processing;
- physics;
- Unity;
- Shift Ruler;
- operational workflow UX changes from the later reference screenshots.

## Safety invariants

- no Task / Run / AgentRun / Event truth changes;
- no fake progress/dialogue/activity;
- no backend/schema changes;
- production remains Three.js;
- no increase to accepted light budget;
- no auto merge;
- no force push.

## Verification pending

```bash
cd frontend
npm test -- --run
npm run typecheck
npm run lint
npm run build
npm run office:debug:prod-check
npm run office:renderer-shots

cd ..
./scripts/verify.sh
git diff --check
git status --short
```


## Phase 12 automated verification

Verified runtime head:

```text
9331628
GitHub Actions verify #1271: PASS
repository: PASS
frontend: 25 files / 179 tests
frontend typecheck: PASS
frontend lint: PASS
frontend build: PASS
backend pytest: 658 passed
backend Ruff: PASS
backend format: PASS
backend MyPy: PASS
```

Remaining gate:

```text
Three.js vs R3F deterministic rendered comparison
desktop/mobile × day/night
renderer-info.json review
production debug/R3F leakage guard on owner machine
```

PR remains Draft until the rendered comparison is accepted.
