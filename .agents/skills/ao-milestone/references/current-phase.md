# Agent Office Current Milestone

## Current checkpoint

```text
main@7c50260
Phase 10H-1 merged
PR #24 Vocabulary & Structure merged
PR #25 Office 3D experience polish merged
PR #27 Phase 6 Codex test hardening merged
PR #29 Office Diorama V0 merged
```

Canonical full verification:

```bash
./scripts/verify.sh
```

## Current work

```text
branch: phase-11-office-diorama-v1
pr: #30
scope: Phase 11 / Office Diorama V1 — camera + lighting simplification
status: IMPLEMENTED / AUTOMATED VERIFIED / RENDERED REVIEW PENDING
```

## V0 baseline

V0 is accepted and recorded in:

```text
docs/product/PHASE_11_V0_VERIFICATION.md
```

Build is the current heaviest floor:

```text
desktop: 273–276 calls / 33,268–33,304 triangles / 271–274 geometries / 41 textures
mobile:  222–225 calls / 25,284–25,320 triangles / 270–273 geometries / 41 textures
```

V1 must compare against this baseline rather than relying on subjective tuning.

## V1 owner decisions

### Camera

Use fixed/snap presets with limited zoom.

- keep Overview / primary / secondary presets;
- disable free orbit;
- disable free pan;
- keep wheel/pinch zoom within a bounded distance;
- clicking an agent may still ease focus toward factual presence;
- preset and floor transitions remain eased;
- keyboard camera shortcuts remain valid.

### Lighting

Use real Office time with a readable night minimum.

- one hemisphere light;
- one shadow-casting directional key light;
- no global directional fill light;
- remove generic ceiling PointLights;
- use emissive ceiling fixtures for visual warmth;
- keep at most three floor-specific accent PointLights;
- retain ACES tone mapping and soft shadows;
- no AO/bloom/post-processing dependency in V1.

## Scope

- simplify camera control policy;
- update camera control copy/tests;
- simplify scene lighting architecture;
- remove generic ceiling PointLights and rely on existing emissive surfaces plus bounded floor accents;
- keep floor-specific accent lights bounded;
- preserve readable night exposure;
- regenerate the V0 screenshot matrix and renderer metrics;
- record before/after findings.

## Explicitly deferred

### V2 — Blender asset pilot

No new GLB furniture kit, Blender asset import, or asset-policy ADR in V1.

### R3F migration

No React Three Fiber rewrite in V1. The current Three.js runtime remains canonical.

### Unity

No Unity runtime or WebGL client in V1.

### Phase 10H-2 / 10H-3

Shift Ruler and truth lines remain separate.

## Safety invariants

- no canonical Task / Run / AgentRun / Event changes;
- no fake execution/progress/dialogue;
- no backend/schema changes;
- no asset-policy changes;
- no new post-processing/physics dependency;
- Office remains supplemental to HTML operational truth;
- no auto merge;
- no force push.
