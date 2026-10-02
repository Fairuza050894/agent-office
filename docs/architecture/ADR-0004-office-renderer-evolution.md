# ADR-0004 — Office Renderer Evolution after V2

Status: Accepted for Phase 11 V3  
Date: 2026-10-02

## Context

The current Agent Office renderer is imperative Three.js and already owns:

- canonical Office projection;
- deterministic floors and zones;
- character runtime;
- collision-safe paths;
- replay projection;
- camera presets;
- V0/V1/V2 screenshot and performance gates.

A user-provided R3F mockup demonstrates useful declarative composition,
damped camera focus, reduced-motion handling, compact 3D-first layout, and
optional post-processing. It also contains sample Run/Event/timeline data that
is illustrative only and cannot become Agent Office truth.

V2 has separately proved that verified low-poly GLBs plus instancing materially
reduce draw calls/geometries for the Build engineering pod.

## Decision

### V3 renderer

Keep the production renderer on Three.js for V3.

Do not combine:

```text
production furniture rollout
+
full R3F renderer migration
```

in one checkpoint.

### Renderer-neutral boundaries

V3 moves accepted furniture behavior behind modules that contain no workflow
state:

```text
furniturePolicy.ts
officeFurnitureKit.ts
environment placement contract
```

These modules may later be consumed by either the imperative Three renderer or
an R3F pilot.

### Production failure behavior

The ordinary Build floor renders its existing primitive pod first.

The primitive group is removed only after the verified kit:

1. loads;
2. mounts;
3. passes spatial bounds validation.

Asset failure therefore degrades presentation without removing operational
state or leaving an empty engineering pod.

### Asset delivery

Production/dev bootstrap fetches the exact V2-approved Kenney files from the
pinned transport commit and verifies size + Git blob SHA.

Fetched GLBs remain uncommitted.

### Blender

Blender is approved as an offline authoring/optimization tool.

It is not required at application runtime.

A repository helper mirrors the production material palette so a future baked
GLB can be generated reproducibly. Baked outputs need separate provenance and
visual/performance verification before becoming authoritative assets.

### R3F

A later R3F pilot is approved as an experiment, not as a V3 dependency.

That pilot must consume the same canonical OfficeProjection inputs and pass the
existing visual/performance/truth gates before any renderer migration.

### Post-processing

N8AO, Bloom, SMAA, Vignette, and similar effects shown by the reference mockup
are not approved by this ADR for production.

Each effect must justify its cost through a separate measured A/B gate. The
current V1 light budget remains authoritative.

### Unity

Unity is not introduced for the web Agent Office runtime.

No current requirement justifies a second rendering/runtime stack.

## Consequences

Positive:

- V3 ships the accepted asset improvement without a renderer rewrite;
- production keeps a truthful visual fallback;
- Build art direction becomes deterministic and testable;
- future R3F work has smaller, clearer seams;
- Blender can optimize art without owning product state.

Tradeoffs:

- imperative Three.js remains for V3;
- source GLBs are still fetched during setup/build;
- runtime material normalization exists until/if baked assets are separately
  accepted.

## Follow-up

After V3 acceptance, a separate R3F pilot may compare:

```text
current Three renderer
vs
R3F renderer
```

using identical canonical fixture data, camera targets, lighting profiles, and
performance evidence.
