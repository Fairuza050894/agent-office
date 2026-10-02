# Phase 11 Office Diorama V2 Verification

Status: ACCEPTED / GO FOR V3 ROLLOUT DESIGN

## Scope verified

Phase 11 V2 evaluates one development-only Build-floor engineering-pod asset
candidate against the accepted primitive control.

Candidate:

```text
Kenney Furniture Kit
license: CC0 1.0
source assets: 5
instanced placements: 80
```

V2 approval means the asset/style/pipeline direction is accepted for the next
rollout phase. It does **not** make the pilot production-default by itself.

## Automated verification

Current PR runtime/harness head passed GitHub Actions:

```text
verify run #1184: success
```

Earlier owner-machine verification for this PR also passed:

```text
frontend tests/typecheck/lint/build
production pilot leakage guard
24-shot accepted Office baseline
backend 658 tests
Ruff / format / MyPy
canonical ./scripts/verify.sh
```

The final V2 A/B harness produced:

```text
mode: pilot-ab
captureCount: 8
```

Matrix:

```text
primitive / kit
× day / night
× 1440 / 390
= 8 captures
```

## Mounted pilot truth

All accepted kit captures report:

```text
ready: true
sourceAssetCount: 5
instanceCount: 80
error: null
bounds min:  [-3.8465, 0, -0.18]
bounds max:  [ 3.8465, 1.47, 3.04]
bounds size: [ 7.6930, 1.47, 3.22]
```

The bounds remain inside the engineering-pod acceptance envelope and confirm
that the candidate is physically present rather than merely reporting a ready
flag.

## Renderer comparison

### Desktop day

| Metric | Primitive | Kit | Change |
| --- | ---: | ---: | ---: |
| Draw calls | 276 | 148 | -46.4% |
| Triangles | 33,304 | 30,936 | -7.1% |
| Geometries | 274 | 146 | -46.7% |
| Textures | 41 | 41 | unchanged |

### Desktop night

| Metric | Primitive | Kit | Change |
| --- | ---: | ---: | ---: |
| Draw calls | 273 | 145 | -46.9% |
| Triangles | 33,268 | 30,900 | -7.1% |
| Geometries | 271 | 143 | -47.2% |
| Textures | 41 | 41 | unchanged |

### Mobile day

| Metric | Primitive | Kit | Change |
| --- | ---: | ---: | ---: |
| Draw calls | 225 | 97 | -56.9% |
| Triangles | 25,320 | 22,952 | -9.4% |
| Geometries | 273 | 145 | -46.9% |
| Textures | 41 | 41 | unchanged |

### Mobile night

| Metric | Primitive | Kit | Change |
| --- | ---: | ---: | ---: |
| Draw calls | 222 | 94 | -57.7% |
| Triangles | 25,284 | 22,916 | -9.4% |
| Geometries | 270 | 142 | -47.4% |
| Textures | 41 | 41 | unchanged |

The V2 candidate therefore stays below the accepted Build ceiling for both draw
calls and triangles in every reviewed viewport/time combination.

Lighting remains unchanged at:

```text
4 total lights
1 HemisphereLight
1 DirectionalLight
2 PointLights
```

## Rendered review

Reviewed owner-generated A/B evidence:

- primitive day 1440;
- kit day 1440;
- primitive night 1440;
- kit night 1440;
- primitive day 390;
- kit day 390;
- primitive night 390;
- kit night 390.

Accepted observations:

- candidate furniture is now visibly present in all kit captures;
- desk/chair/screen silhouettes read as a coherent office workstation kit;
- agent locations remain consistent between primitive and kit modes;
- the candidate remains readable at night;
- mobile framing remains contained;
- no accepted capture shows furniture outside the engineering-pod envelope;
- no obvious new character/furniture collision blocks the reviewed composition;
- the candidate materially reduces renderer calls/geometries rather than merely
  staying below the ceiling.

## Visual follow-up required for V3

The Kenney source palette is materially lighter/creamier than the existing Build
floor.

That contrast is acceptable for V2 A/B evaluation but is **not** the intended
final production art direction.

V3 must normalize the kit before production rollout, preferably through the
Blender-compatible asset pipeline:

- harmonize desk/chair/device materials with the existing Build palette;
- consolidate duplicated materials where practical;
- preserve the V2 instancing/performance advantage;
- keep original Kenney provenance and CC0 attribution record;
- preserve station/navigation truth;
- compare V3 output against this accepted V2 renderer baseline.

V3 should target a cohesive low-poly Diorama rather than raw source-asset colors.

## V2 conclusion

V2 decision: **GO**.

Approved:

- Kenney low-poly furniture direction;
- verified remote asset transport for development pipeline;
- transform-bake normalization;
- static InstancedMesh strategy;
- Build engineering-pod rollout as the next phase.

Not approved by V2:

- making raw cream Kenney materials production-final;
- changing Commons or Strategy;
- R3F migration;
- Unity runtime;
- changing canonical execution truth.

PR #31 may proceed to manual merge after Ready for Review.
