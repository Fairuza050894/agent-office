# Agent Office Current Milestone

## Current checkpoint

```text
main@326b784
Phase 10H-1 merged
PR #24 Vocabulary & Structure merged
PR #25 Office 3D experience polish merged
PR #27 Phase 6 Codex test hardening merged
PR #29 Office Diorama V0 merged
PR #30 Office Diorama V1 merged
```

Canonical full verification:

```bash
./scripts/verify.sh
```

## Current work

```text
branch: phase-11-office-diorama-v2-pilot
pr: #31
scope: Phase 11 / Office Diorama V2 — engineering-pod asset pilot
status: ACCEPTED / GO / READY FOR REVIEW
```

## V2 decision boundary

V2 is a development-only A/B pilot.

Production Office keeps the existing primitive engineering pod until the owner
reviews the V2 screenshots and explicitly approves rollout.

## Asset decision

Pilot source:

```text
Kenney Furniture Kit
license: CC0 1.0
official source: https://kenney.nl/assets/furniture-kit
transport mirror: Hidencod/tge-assets
transport commit: 1f7dee9076ee848773f08fd632ab4e4e73357777
```

Binary pilot GLBs remain uncommitted.

They are fetched only for the V2 development harness, verified by byte size and
Git blob SHA, ignored by Git, and removed before production build.

ADR:

```text
docs/architecture/ADR-0003-office-diorama-asset-transport.md
```

## V2 scope

- pilot only the Build `engineering-pod`;
- keep the accepted V1 primitive pod as the A/B control;
- add development-only `pilot=kit` presentation mode;
- replace primitive desks/chairs/computer props only in that pilot mode;
- instance repeated static GLB meshes;
- preserve existing navigation obstacles and agent station coordinates;
- add dedicated pilot screenshot matrix;
- compare primitive vs kit at day/night × desktop/mobile;
- record renderer metrics;
- hard-fail pilot if draw calls or triangles exceed the accepted V1 Build ceiling;
- production bundle must contain no pilot asset or pilot debug marker.

## V2 first local gate result

The owner-machine gate at head `6368b61` passed unit/type/lint/build,
production cleanup/guard, the 24-shot V1 baseline, and full repository
verification, but correctly rejected the initial kit candidate on:

```text
kit-day-390: 30,640 triangles > 25,320 mobile ceiling
```

The budget is not relaxed.

The original `chairdesk.glb` (39,016 bytes) was replaced with the lower
complexity Kenney `chairmoderncushion.glb` (7,376 bytes), while preserving all
eight chair placements and spatial truth.

The V2 A/B capture must be rerun before GO/NO-GO.

## Explicitly deferred

### V3 — Build floor rollout

No rollout before owner go/no-go.

### R3F

No R3F migration in V2.

### Unity

No Unity runtime in V2.

### Other floors

Commons and Strategy are unchanged.

## Safety invariants

- no canonical Task / Run / AgentRun / Event changes;
- no fake execution/progress/dialogue;
- no backend/schema changes;
- pilot is development-only;
- asset license/source/provenance must remain explicit;
- no binary GLB commit;
- no auto merge;
- no force push.


## V2 rendered pilot finding

Owner-rendered `kit-day-1440` showed an empty engineering pod while the
primitive control remained correct.

This is a V2 NO-GO until corrected.

Remediation:
- bake normalized GLB transforms into geometry before instancing;
- expose mounted pilot bounds;
- fail the A/B harness on empty or implausible pilot bounds.

The pilot A/B matrix must be rerun before acceptance.


## V2 pilot harness finding

The owner-run pilot capture exposed a readiness race:

```text
Pilot kit did not reach the expected ready state.
```

The candidate kit itself rendered correctly after the transform-bake fix, but
the Playwright harness could observe `ready=true` and then read a transient
`ready=false` after a React environment remount.

Remediation:
- snapshot the ready/error pilot state atomically from `waitForFunction`;
- require the same requested variant to remain ready across a 500ms settle
  window;
- retry up to eight transient remounts;
- retain asset-count and mounted-bounds validation before capture.

The 8-shot pilot A/B matrix must be rerun before V2 acceptance.


## V2 acceptance record

```text
GitHub Actions verify: PASS
pilot mode: pilot-ab
capture matrix: 8 / 8
kit visible desktop/mobile day/night: PASS
source assets: 5
instanced placements: 80
mounted bounds validation: PASS
draw-call ceiling: PASS
triangle ceiling: PASS
light contract: PASS
V2 decision: GO
verification document: docs/product/PHASE_11_V2_VERIFICATION.md
```

V3 owns Build-floor rollout and Blender/material consolidation.

Merge remains manual.
