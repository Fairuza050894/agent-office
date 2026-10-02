# Phase 11 Office Diorama V0 Verification

Status: ACCEPTED / READY FOR REVIEW

## Scope verified

Phase 11 V0 establishes the deterministic Office visual evidence harness only.

Verified scope:

- development-only `fixture=diorama`;
- explicit `Simulated` presentation label;
- frozen debug time;
- deterministic AMBIENT-only fixture cast;
- Playwright screenshot matrix;
- Three.js renderer baseline export;
- production-bundle debug marker guard;
- no backend/schema/canonical execution changes.

## Owner-machine automated verification

Owner-run verification completed successfully on the V0 implementation.

Results:

```text
frontend Vitest        23 files / 162 tests passed
frontend typecheck     passed
frontend lint          passed
frontend build         passed
Office GLB assets      5 verified
production debug guard passed
office:shots           24 PNG + renderer-info.json
backend pytest         658 passed
backend Ruff           passed
backend format         passed
backend MyPy           passed
repository diff check  passed
repository status      clean
canonical verify       VERIFICATION COMPLETE
```

Two existing FastAPI/Starlette deprecation warnings remain unrelated to this phase.

## Deterministic capture matrix

The accepted baseline contains exactly:

```text
3 floors × 4 lighting windows × 2 viewports = 24 captures
```

Viewports:

- 1440 × 1000
- 390 × 844

Lighting windows:

- morning
- day
- evening
- night

Timezone:

```text
Asia/Jakarta
```

## Renderer baseline

### Commons

| Viewport | Calls | Triangles | Geometries | Textures |
| --- | ---: | ---: | ---: | ---: |
| 1440 | 184–189 | 29,234–29,398 | 190–195 | 32 |
| 390 | 131–132 | 24,626–24,638 | 189–194 | 32 |

### Build

| Viewport | Calls | Triangles | Geometries | Textures |
| --- | ---: | ---: | ---: | ---: |
| 1440 | 273–276 | 33,268–33,304 | 271–274 | 41 |
| 390 | 222–225 | 25,284–25,320 | 270–273 | 41 |

### Strategy

| Viewport | Calls | Triangles | Geometries | Textures |
| --- | ---: | ---: | ---: | ---: |
| 1440 | 183–186 | 29,956–29,992 | 189–192 | 31 |
| 390 | 151–154 | 27,116–27,152 | 189–192 | 31 |

All captures report:

```text
points = 0
lines  = 28
```

The Build floor is the current heaviest baseline and is therefore the primary
performance comparison target for later Diorama work.

These numbers are evidence, not arbitrary budgets. Later phases must record and
justify any increase.

## Rendered review

Representative owner-generated renders were reviewed for:

- Build day, desktop;
- Build evening, desktop;
- Build night, desktop;
- Build day, 390px;
- Build night, 390px.

Accepted observations:

- deterministic framing is stable across time windows;
- simulated characters remain visually distinct from the environment;
- the `Simulated` development fixture label is explicit;
- daytime scene hierarchy is readable;
- evening and night preserve the same spatial layout without clipping;
- night remains intentionally dimmer while furniture and characters remain legible;
- 390px captures keep floor controls and 3D stage contained;
- no obvious geometry clipping or wall penetration appears in the accepted Build baseline;
- ordinary Planning surfaces remain available outside the 3D renderer.

## Production boundary

The owner-run production guard reported:

```text
Production bundle contains no Diorama debug markers.
```

The Diorama fixture therefore remains a development verification mechanism, not
production execution behavior.

## V0 conclusion

Phase 11 V0 acceptance criteria are satisfied.

V0 does not approve V1 changes automatically.

Any V1 camera/light simplification must use this baseline for before/after
comparison and must remain a separate phase / PR.

V2 asset-kit work remains blocked on its own go/no-go and asset-policy review.
