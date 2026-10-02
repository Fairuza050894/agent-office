# Agent Office Current Milestone

## Current checkpoint

```text
main@3076465
Phase 10H-1 merged
PR #24 Vocabulary & Structure merged
PR #25 Office 3D experience polish merged
PR #27 Phase 6 Codex test hardening merged
PR #29 Office Diorama V0 merged
PR #30 Office Diorama V1 merged
PR #31 Office Diorama V2 asset pilot merged
```

Canonical full verification:

```bash
./scripts/verify.sh
```

## Current work

```text
branch: phase-11-office-diorama-v3-build-rollout
pr: #32
scope: Phase 11 / Office Diorama V3 — Build floor rollout
status: IMPLEMENTING / DRAFT VERIFICATION
```

## V3 authority

Read:

```text
docs/product/PHASE_11_V3_BUILD_ROLLOUT.md
docs/architecture/ADR-0004-office-renderer-evolution.md
docs/product/PHASE_11_V2_VERIFICATION.md
docs/ux/OFFICE_VIEW.md
docs/ux/OFFICE_R3F_REFERENCE_REVIEW.md
```

## V3 scope

- promote the accepted V2 Kenney subset into ordinary Build Office;
- retain primitive furniture until the production kit is mounted and validated;
- preserve explicit primitive/kit Diorama A/B modes;
- fetch/verify production furniture during dev/build without committing GLBs;
- normalize raw Kenney materials into the Build visual language;
- keep static repeated furniture instanced;
- add a Blender-compatible offline material-normalization helper;
- isolate furniture policy/assets so a later R3F pilot does not own workflow
  truth;
- preserve camera, navigation, character, lighting, and truth contracts.

## V3 reference lessons

The user-provided R3F mockup is a reference implementation only.

Adopted lessons:

- modular scene boundaries;
- damped/focused interaction direction;
- reduced-motion awareness;
- 3D + text-complete operational UI;
- measured rather than decorative rendering effects.

Not adopted in V3:

- sample/hard-coded Run/Event/timeline state;
- R3F runtime dependency;
- post-processing stack;
- Unity.

## Safety invariants

- no canonical Task / Run / AgentRun / Event changes;
- no fake execution/progress/dialogue;
- no backend/schema changes;
- no new light-budget allowance;
- production asset failure retains primitive presentation fallback;
- asset license/source/provenance remains explicit;
- no binary GLB commit;
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
npm run office:shots
npm run office:pilot-shots

cd ..
python3 -m py_compile tools/blender/normalize_office_furniture.py
./scripts/verify.sh
git diff --check
git status --short
```

Rendered desktop/mobile day/night review is required before V3 acceptance.
