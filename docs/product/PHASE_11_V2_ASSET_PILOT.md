# Phase 11 Office Diorama V2 — Engineering Pod Asset Pilot

Status: IMPLEMENTING / Draft verification

## Goal

Answer one question with evidence:

> Does a coherent real low-poly furniture kit materially improve the Build
> engineering pod without regressing truth, navigation, production safety, or
> the accepted V1 renderer budget?

V2 does not approve a Build-floor rollout automatically.

## A/B modes

Control:

```text
fixture=diorama
pilot=primitive
floor=build
```

Candidate:

```text
fixture=diorama
pilot=kit
floor=build
```

Both modes use the same:

- deterministic characters;
- frozen time;
- camera;
- lighting;
- floor shell;
- agent stations;
- navigation obstacles.

Only the engineering-pod furniture presentation changes.

## Pilot kit

Kenney Furniture Kit, CC0 1.0.

Selected props:

- desk;
- desk chair;
- computer screen;
- keyboard;
- mouse.

Transport and integrity rules are defined by
`docs/architecture/ADR-0003-office-diorama-asset-transport.md`.

## Static rendering rule

Repeated pilot furniture uses `THREE.InstancedMesh`.

The pilot must not create an independent cloned GLB scene for every workstation.

## Performance gate

The candidate `kit` capture must not exceed the accepted V1 Build ceiling:

### Desktop

```text
draw calls <= 276
triangles  <= 33,304
```

### Mobile

```text
draw calls <= 225
triangles  <= 25,320
```

Geometries and textures are recorded for review but are not a hard V2 blocker
unless the increase is substantial and unexplained.

## Production boundary

Pilot GLBs are:

- ignored by Git;
- development-only;
- removed before `npm run build`;
- forbidden from `dist/`.

The production debug guard must fail if a pilot marker or pilot asset directory
is present in the production output.

## Screenshot gate

`npm run office:pilot-shots` produces Build-only A/B captures:

```text
primitive / kit
× day / night
× 1440 / 390
= 8 PNG files
```

plus:

```text
artifacts/office-pilot-shots/renderer-info.json
```

## Acceptance

Automated:

```bash
cd frontend
npm test -- --run
npm run typecheck
npm run lint
npm run build
npm run office:debug:prod-check
npm run office:shots
npm run office:pilot-shots

cd ..
./scripts/verify.sh
git diff --check
git status --short
```

Rendered review:

- primitive day 1440 vs kit day 1440;
- primitive night 1440 vs kit night 1440;
- primitive day 390 vs kit day 390;
- primitive night 390 vs kit night 390.

Owner then chooses V2 GO or NO-GO.

No V3 rollout starts before that decision.
