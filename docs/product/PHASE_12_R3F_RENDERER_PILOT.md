# Phase 12 — R3F Renderer Pilot

Status: RENDERED A/B ACCEPTED / FINAL VERIFICATION PENDING

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
@react-three/fiber 9.8.1
```

No Drei, post-processing, AO, Bloom, SMAA, Vignette, or physics package is
required for the first comparison.

The user-provided reference declared `^9.4.0`. The pilot pins the current stable
`9.8.1`, whose upstream peer range explicitly covers the repo's resolved React
19.3 runtime while remaining compatible with Three 0.181.x.

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

The historical V2 ceilings were invalid for the completed Phase 12 scene:
they were captured before fully-rigged character presentation and before the
mobile Three.js frustum used the actual responsive host height.

After fixing both measurement defects, the owner-reviewed Phase 12 evidence is:

### Desktop fully-rigged baseline

```text
day    Three = R3F = 158 calls / 34,656 triangles
night  Three = R3F = 155 calls / 34,620 triangles
```

Accepted regression ceilings:

```text
calls      <= 170
triangles  <= 35,500
```

### Mobile fully-rigged + correct-frustum baseline

```text
day    Three = R3F = 134 calls / 34,212 triangles
night  Three = R3F = 131 calls / 34,176 triangles
```

Accepted regression ceilings:

```text
calls      <= 145
triangles  <= 35,000
```

These ceilings intentionally keep a small regression margin rather than
preserving the much looser historical call ceilings or the stale triangle
ceilings.

The V1 light contract remains:

```text
1 HemisphereLight
1 DirectionalLight
<= 3 PointLights
<= 5 total lights
```

## Pilot questions

Phase 12 does not assume R3F is superior. It asks:

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


## Rendered A/B decision

Owner-reviewed deterministic evidence completed all eight captures:

```text
Three.js / R3F
× day / night
× 1440 / 390
```

Observed result:

```text
desktop day    exact renderer parity
desktop night  exact renderer parity
mobile day     exact renderer parity after Three.js aspect fix
mobile night   exact renderer parity after Three.js aspect fix
```

All captures had:

```text
4/4 visible characters rigged
fallback = 0
Kenney kit ready = true
source assets = 5
instances = 80
valid kit bounds
4 total lights
```

The earlier mobile discrepancy was traced to the imperative Three.js renderer
inflating its internal responsive height to 480px while the actual CSS host was
about 380px. That narrower frustum artificially reduced visible geometry. Phase
12 corrected the renderer to use the real host dimensions.

Decision:

```text
GO — R3F is approved for a separate, broader renderer-migration checkpoint.
```

This GO does **not** migrate production rendering in Phase 12. Production remains
on the current Three.js renderer until a later checkpoint covers Live/Replay,
interaction parity, bundle impact, failure fallback, and final owner acceptance.
