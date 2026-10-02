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
scope: Phase 11 / Office Diorama V2 — engineering-pod asset pilot
status: IMPLEMENTING / DRAFT VERIFICATION
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
