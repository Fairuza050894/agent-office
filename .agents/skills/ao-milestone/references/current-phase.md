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
branch: phase-13a-r3f-production-migration
scope: Phase 13A — R3F production renderer migration
status: IMPLEMENTING / AUTOMATED VERIFICATION PENDING
```

## Phase 13A authority

Read:

```text
docs/product/PHASE_13A_R3F_PRODUCTION_MIGRATION.md
docs/architecture/ADR-0005-r3f-production-renderer.md
docs/product/PHASE_12_R3F_RENDERER_PILOT_VERIFICATION.md
docs/ux/OFFICE_VIEW.md
```

## Scope

- make R3F the production/default Office renderer;
- migrate Planning, Live, and Replay projection through R3F;
- keep canonical Task / Run / AgentRun / Event truth outside the renderer;
- reuse renderer-neutral member/motion projection helpers;
- preserve accepted furniture, camera, lighting, character, and floor contracts;
- keep the imperative Three.js renderer as a bounded fallback;
- promote R3F from devDependency to production dependency;
- keep deterministic Three-vs-R3F control available for debug evidence;
- keep production debug/pilot leakage guard active.

## Explicitly deferred

- removal of the Three.js fallback;
- post-processing;
- visual redesign;
- Drei;
- physics;
- Unity;
- Shift Ruler;
- operational Kanban / Task Evidence work;
- Local Helper;
- Engineering Discipline settings.

## Safety invariants

- no Task / Run / AgentRun / Event truth changes;
- no fake progress/dialogue/testing/collaboration;
- no backend/schema changes;
- renderer fallback is presentation-only;
- ordinary HTML operational views remain authoritative and accessible;
- no force push.

## Merge authorization

The owner explicitly authorized automated implementation, full verification, and
merge for Phase 13A in the current conversation.

Merge is permitted only after:

```text
GitHub Actions verify = SUCCESS
frontend tests/typecheck/lint/build = PASS
backend pytest/Ruff/format/MyPy = PASS
production debug/pilot guard = PASS
diff/status hygiene = PASS
PR diff reviewed for Phase 13A scope
```

## Verification pending

```bash
cd frontend
npm test -- --run
npm run typecheck
npm run lint
npm run build
npm run office:debug:prod-check

cd ..
./scripts/verify.sh
git diff --check
git status --short
```
