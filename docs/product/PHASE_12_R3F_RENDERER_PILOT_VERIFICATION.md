# Phase 12 — R3F Renderer Pilot Verification

## Decision

```text
GO
```

R3F is accepted as a candidate for a later production renderer migration.
Phase 12 itself does not replace the production Three.js renderer.

## Deterministic evidence

Fixture:

```text
floor: Build
furniture: Kenney kit
time zone: Asia/Jakarta
characters: 4 visible / 4 rigged / 0 fallback
source assets: 5
furniture instances: 80
lighting: 1 hemisphere + 1 directional + 2 point
```

### Desktop — 1440 × 1000

```text
day:
  Three.js  158 calls / 34,656 triangles / 156 geometries / 41 textures
  R3F       158 calls / 34,656 triangles / 156 geometries / 41 textures

night:
  Three.js  155 calls / 34,620 triangles / 153 geometries / 41 textures
  R3F       155 calls / 34,620 triangles / 153 geometries / 41 textures
```

### Mobile — 390 × 844

Before the camera fix, Three.js incorrectly used a synthetic minimum renderer
height of 480px even though the responsive Office host was about 380px. This
created a narrower camera frustum and invalidated the original mobile comparison.

After correcting Three.js to use the actual host dimensions:

```text
day:
  Three.js  134 calls / 34,212 triangles
  R3F       134 calls / 34,212 triangles

night:
  Three.js  131 calls / 34,176 triangles
  R3F       131 calls / 34,176 triangles
```

The post-fix mobile result is exact renderer parity.

## Accepted Phase 12 regression ceilings

Desktop:

```text
calls      <= 170
triangles  <= 35,500
```

Mobile:

```text
calls      <= 145
triangles  <= 35,000
```

These replace the stale V2 triangle ceilings for the Phase 12 A/B harness. They
are derived from the fully-rigged, bounds-valid, correct-frustum evidence and
retain only a small regression margin.

## Bugs discovered by the pilot

Phase 12 found and fixed two renderer-lifecycle defects that were independent of
R3F:

1. Planning passed inline `[]` values for empty stages/agents, causing the
   imperative environment effect to rebuild on parent clock rerenders.
2. The imperative Three.js renderer inflated responsive height to at least
   480px, diverging from the actual mobile host and producing an unfairly narrow
   frustum.

Both fixes improve the current production renderer even if R3F migration is
later declined.

## Migration boundary

The next renderer checkpoint may evaluate production migration, but must retain:

- canonical Task / Run / AgentRun / Event truth outside the renderer;
- the shared floor/environment/furniture/character/camera/lighting contracts;
- deterministic screenshot and renderer evidence;
- failure fallback;
- reduced-motion behavior;
- accessibility via HTML operational surfaces;
- no fake collaboration, progress, dialogue, or testing state.

Live/Replay renderer migration is explicitly outside Phase 12.
