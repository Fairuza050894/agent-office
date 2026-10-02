# Phase 12 — R3F Renderer Pilot

Status: IMPLEMENTING / Draft verification

## Goal

Evaluate React Three Fiber as an alternative Office renderer without moving any
workflow truth into the renderer and without changing production rendering.

The pilot compares:

```text
canonical Diorama fixture
        |
        +-- current imperative Three.js renderer
        |
        +-- R3F renderer adapter
```

Both branches receive the same:

- Build floor;
- Kenney furniture kit;
- deterministic ambient cast;
- Office time/lighting profile;
- camera preset;
- selection input;
- floor placement contract.

## Development-only boundary

The renderer selector exists only in the development Diorama fixture:

```text
renderer=three
renderer=r3f
```

Default and production rendering remains the current Three.js renderer.

The production bundle guard rejects R3F pilot markers.

## R3F pilot architecture

The R3F pilot deliberately reuses existing domain-neutral rendering modules:

```text
createOfficeEnvironment()
officeFurniturePolicy()
mountEngineeringPodFurnitureKit()
createCharacterRuntime()
officeCameraView()
officeLightingForHour()
```

The renderer does not own:

- Task state;
- Run state;
- AgentRun state;
- Event state;
- Planning records;
- replay chronology.

The first pilot is intentionally Build/Planning-fixture focused. Operational
Live/Replay migration is not part of this checkpoint.

## Dependency scope

V1 of the pilot adds only:

```text
@react-three/fiber 9.4.0
```

No Drei, post-processing, AO, Bloom, SMAA, Vignette, or physics package is
required for the first comparison.

The dependency version follows the user-provided R3F reference implementation
while remaining compatible with React 19 and Three 0.181.x.

## Deterministic A/B gate

```bash
npm run office:renderer-shots
```

captures:

```text
three / r3f
× day / night
× 1440 / 390
= 8 PNG files
```

Output:

```text
artifacts/office-renderer-pilot-shots/
  renderer-info.json
```

Both renderers must remain within the accepted Build ceilings:

### Desktop

```text
calls      <= 276
triangles  <= 33,304
```

### Mobile

```text
calls      <= 225
triangles  <= 25,320
```

The V1 light contract remains:

```text
1 HemisphereLight
1 DirectionalLight
<= 3 PointLights
<= 5 total lights
```

## Pilot questions

V12 does not assume R3F is superior. It asks:

1. Does R3F preserve the accepted visual composition?
2. Does it keep the same canonical projection inputs?
3. Does it remain within current renderer ceilings?
4. Does it materially simplify scene lifecycle code?
5. Does it preserve reduced-motion/camera behavior?
6. Does the production build remain free of pilot-only code/markers?
7. Is bundle impact acceptable?

## Acceptance

Required:

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

Rendered review must compare:

- Three day 1440 vs R3F day 1440;
- Three night 1440 vs R3F night 1440;
- Three day 390 vs R3F day 390;
- Three night 390 vs R3F night 390.

The owner then decides:

```text
GO     → expand R3F into a broader renderer migration plan
NO-GO  → retain imperative Three.js and keep modular boundaries
```

No full renderer migration occurs inside this PR.
