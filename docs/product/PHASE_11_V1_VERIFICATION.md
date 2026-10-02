# Phase 11 Office Diorama V1 Verification

Status: ACCEPTED / READY FOR REVIEW

## Scope verified

Phase 11 V1 simplifies Office camera interaction and global lighting while
preserving the accepted V0 visual/performance baseline.

Verified scope:

- floor-aware snap camera presets;
- free orbit disabled;
- free pan disabled;
- bounded wheel/pinch zoom;
- selected-agent eased focus retained;
- one HemisphereLight;
- one shadow-casting DirectionalLight;
- no global directional fill;
- no generic ceiling PointLights;
- floor-specific PointLights capped at three;
- deterministic V0 screenshot matrix retained;
- renderer and light-budget gates enforced.

## Automated verification

Owner-machine verification on implementation head `fa2d849`:

```text
frontend Vitest        23 files / 167 tests passed
frontend typecheck     passed
frontend lint          passed
frontend build         passed
Office GLB assets      5 verified
production debug guard passed
office:shots           24 PNG + renderer-info.json
V1 renderer budget     passed against V0
V1 light budget        passed
backend pytest         658 passed
backend Ruff           passed
backend format         passed
backend MyPy           passed
repository diff check  passed
repository status      clean
canonical verify       VERIFICATION COMPLETE
GitHub Actions verify  success (run #1125)
```

Two existing FastAPI/Starlette deprecation warnings remain outside this phase.

## V1 renderer evidence

The V1 harness retained the accepted V0 renderer ceiling.

### Build — desktop

| Lighting | Calls | Triangles | Geometries | Textures | Total lights | Hemi | Directional | Point |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| morning | 273 | 33,268 | 271 | 41 | 4 | 1 | 1 | 2 |
| day | 276 | 33,304 | 274 | 41 | 4 | 1 | 1 | 2 |
| evening | 273 | 33,268 | 271 | 41 | 4 | 1 | 1 | 2 |
| night | 273 | 33,268 | 271 | 41 | 4 | 1 | 1 | 2 |

### Build — mobile

| Lighting | Calls | Triangles | Geometries | Textures | Total lights | Hemi | Directional | Point |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| morning | 222 | 25,284 | 270 | 41 | 4 | 1 | 1 | 2 |
| day | 225 | 25,320 | 273 | 41 | 4 | 1 | 1 | 2 |
| evening | 222 | 25,284 | 270 | 41 | 4 | 1 | 1 | 2 |
| night | 222 | 25,284 | 270 | 41 | 4 | 1 | 1 | 2 |

### Other floors

Commons remains within:

```text
desktop: 184–189 calls / 29,234–29,398 triangles / 190–195 geometries / 32 textures
mobile:  131–132 calls / 24,626–24,638 triangles / 189–194 geometries / 32 textures
lights:  5 total = 1 hemisphere + 1 directional + 3 point
```

Strategy remains within:

```text
desktop: 183–186 calls / 29,956–29,992 triangles / 189–192 geometries / 31 textures
mobile:  151–154 calls / 27,116–27,152 triangles / 189–192 geometries / 31 textures
lights:  4 total = 1 hemisphere + 1 directional + 2 point
```

The renderer-budget result is intentionally non-regressive rather than claiming
geometry savings: V1 changes camera control and light sources, not furniture
mesh topology.

## Rendered review

Representative owner-generated renders were reviewed for:

- Build day 1440;
- Build night 1440;
- Build day 390;
- Build night 390.

Accepted observations:

- Overview framing remains consistent with the V0 Diorama composition;
- the simplified camera policy does not introduce clipping in the default view;
- characters remain distinguishable from floor and furniture;
- daytime scene hierarchy remains readable;
- night remains materially dimmer than day while desks, characters, walls, and
  navigation landmarks remain legible;
- mobile framing stays contained with the 3D stage visible before the planning
  workspace;
- no new obvious wall penetration or environment clipping appears in the
  accepted Build renders;
- operational HTML remains available outside the renderer.

## Camera acceptance

The V1 policy is accepted:

```text
1 / 2 / 3     snap views
click agent   eased factual focus
wheel/pinch   bounded zoom
free orbit    disabled
free pan      disabled
zoom range    9.5–24
```

This intentionally trades arbitrary camera freedom for a smaller set of
maintained, reviewable Diorama compositions.

## Lighting acceptance

The V1 global lighting contract is accepted:

```text
1 HemisphereLight
1 DirectionalLight
<= 3 PointLight accents
```

Build uses two PointLight accents in the accepted captures. Commons uses three
and Strategy uses two.

No AO, bloom, post-processing, physics, or new lighting dependency was added.

## V1 conclusion

Phase 11 V1 acceptance criteria are satisfied.

V2 remains a separate go/no-go phase and owns the Blender asset pilot for the
Build engineering pod.

No R3F migration or Unity runtime is approved by this verification.
