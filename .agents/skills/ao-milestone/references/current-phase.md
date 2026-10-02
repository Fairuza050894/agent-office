# Agent Office Current Milestone

## Current checkpoint

```text
main@b65bd74
Phase 10H-1 merged
PR #24 Vocabulary & Structure merged
PR #25 Office 3D experience polish merged
PR #27 Phase 6 Codex test hardening merged
PR #29 Office Diorama V0 merged
PR #30 Office Diorama V1 merged
PR #31 Office Diorama V2 asset pilot merged
PR #32 Office Diorama V3 Build rollout merged
PR #33 Phase 12 R3F renderer pilot merged
```

Canonical full verification:

```bash
./scripts/verify.sh
```

## Current work

```text
branch: phase-13a-r3f-planning-production
scope: Phase 13A — R3F Planning production migration
status: IMPLEMENTING / AUTOMATED VERIFICATION PENDING
```

## Phase 13A authority

Read:

```text
docs/product/PHASE_13A_R3F_PLANNING_PRODUCTION.md
docs/product/PHASE_12_R3F_RENDERER_PILOT_VERIFICATION.md
docs/architecture/ADR-0004-office-renderer-evolution.md
docs/ux/OFFICE_VIEW.md
```

## Scope

- promote R3F to normal production Planning Office;
- keep Live/Replay on current Three.js;
- preserve DEV Three-vs-R3F Diorama override;
- add R3F-to-Three React failure fallback;
- promote R3F package to production dependency;
- require production R3F bundle marker;
- run production Chromium smoke in GitHub Actions;
- no visual redesign and no workflow-truth change.

## Safety invariants

- Task / Run / AgentRun / Event truth remains outside renderer;
- Planning records remain backend/durable state;
- no fake activity/progress/dialogue;
- Three.js remains available as Planning fallback;
- Live/Replay remain unchanged in 13A;
- no post-processing;
- no auto force push;
- merge only after all verification gates pass.

## Verification pending

```text
GitHub Actions verify:
- backend
- frontend
- repository
- production Office guard
- production R3F Planning browser smoke
```
