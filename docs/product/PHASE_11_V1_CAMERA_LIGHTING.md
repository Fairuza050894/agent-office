# Phase 11 Office Diorama V1 — Camera and Lighting Simplification

Status: IMPLEMENTED / Draft verification

## Purpose

V1 reduces visual-control complexity before any Blender/R3F asset rollout.

The accepted V0 deterministic screenshot and renderer baseline remains the
comparison source:

```text
docs/product/PHASE_11_V0_VERIFICATION.md
frontend/scripts/office-v0-renderer-budget.json
```

## Camera decision

Agent Office uses snap views rather than free camera orbit.

Available interaction:

```text
1 / 2 / 3     snap to floor-aware camera preset
click agent   ease factual selection into focus
wheel/pinch   bounded zoom
Reset view    return to Overview
```

Disabled:

```text
free orbit
free pan
arbitrary bad-angle exploration
```

Zoom is bounded to:

```text
minimum distance: 9.5
maximum distance: 24
```

The existing three semantic presets per floor remain.

## Lighting decision

Global scene lighting is reduced to:

```text
1 HemisphereLight
1 shadow-casting DirectionalLight
<= 3 floor-specific PointLight accents
```

Removed:

- global directional fill light;
- five generic ceiling PointLights;
- Commons after-hours security PointLight.

Existing emissive props remain presentation cues without creating additional
light sources.

Strategy may use its existing late-evening table accent while remaining within
the three-PointLight floor budget.

## Real-time night policy

Office time remains factual.

Night is not replaced with daylight for demos.

The night profile keeps a readable minimum through:

- hemisphere intensity >= 1.5;
- exposure >= 0.98;
- a warm key light dimmer than daylight.

## Measured V1 gate

The V1 `office:shots` harness reads the accepted V0 renderer budget.

Every capture fails if any of these increase beyond the accepted V0 floor +
viewport maximum:

- draw calls;
- triangles;
- geometries;
- textures.

Every capture also fails if:

- hemisphere lights != 1;
- directional lights != 1;
- point lights > 3;
- total lights > 5.

The harness still produces the same 24-image matrix.

## Acceptance

V1 requires:

```bash
cd frontend
npm test -- --run
npm run typecheck
npm run lint
npm run build
npm run office:debug:prod-check
npm run office:shots

cd ..
./scripts/verify.sh
git diff --check
git status --short
```

Rendered review must compare at least:

- Build day 1440;
- Build night 1440;
- Build day 390;
- Build night 390.

Owner acceptance must confirm:

- default/snap framing remains useful;
- agent selection focus remains useful;
- night remains legible;
- no new clipping is introduced;
- renderer budget gate passes;
- light-count contract passes.

## Deferred

V2 owns the Blender asset pilot.

No R3F migration, Unity runtime, AO, bloom, physics, or new furniture GLB is
introduced in V1.
