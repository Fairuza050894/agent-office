# Phase 11 — Office Diorama

Status: V0 implementation / Draft verification

## Purpose

Phase 11 improves the 3D Office through measured visual iteration instead of
manual camera/light guessing.

This track does not replace Phase 10H-2 Shift Ruler or Phase 10H-3 truth lines.
Those remain independent milestones.

## V0 — deterministic visual harness

V0 is the prerequisite for later Diorama visual work.

### Development-only fixture route

The existing Office route accepts these query parameters in development:

```text
/office?floor=build&fixture=diorama&debugTime=2026-10-05T04:00:00.000Z
```

Rules:

- `fixture=diorama` is ignored outside development behavior;
- the fixture is visibly labelled `Simulated`;
- fixture members are deterministic presentation records, never canonical
  Task / Run / AgentRun truth;
- fixture members use `AMBIENT` truth only;
- `debugTime` freezes Office world time and lighting;
- ordinary Office behavior remains unchanged when the fixture is absent.

### Screenshot matrix

`npm run office:shots` captures:

```text
3 floors
× 4 lighting windows
× 2 viewport widths
= 24 PNG files
```

Lighting windows use a fixed Monday in the `Asia/Jakarta` Office timezone:

| key | local time |
| --- | --- |
| morning | 08:00 |
| day | 11:00 |
| evening | 18:30 |
| night | 23:00 |

Viewports:

- desktop: 1440 × 1000
- mobile: 390 × 844

Artifacts are written under:

```text
artifacts/office-shots/
```

The root `.gitignore` already ignores `artifacts/`.

### Renderer baseline

For every capture, the harness records the current Three.js renderer counters:

- draw calls;
- triangles;
- points;
- lines;
- geometries;
- textures.

The combined baseline is written to:

```text
artifacts/office-shots/renderer-info.json
```

These values are evidence, not performance targets. V1 may not increase them
without recording and reviewing the reason.

### Playwright boundary

Playwright is a frontend development dependency used only for deterministic
visual evidence.

After installing frontend dependencies, install the pinned Chromium runtime once:

```bash
npx playwright install chromium
```

Then:

```bash
npm run office:shots
```

The capture script starts and stops its own Vite server and does not require the
Agent Office backend.

## V0 acceptance

V0 is accepted only when the owner machine proves:

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

The implementation report must include:

- the exact commands and results;
- all 24 generated PNG filenames;
- `renderer-info.json`;
- confirmation that production Office behavior ignores the debug fixture;
- any Playwright/browser installation prerequisite.

## Deferred

### V1 — camera and light simplification

No camera-policy rewrite, contact-shadow rollout, AO, bloom, or lighting-system
reduction is part of V0.

### V2 — pilot asset kit

No furniture GLB kit is introduced in V0. Asset provenance and asset transport
policy remain unchanged.

### V3+ — rollout and truthful delight

No environment asset rollout, monitor-state delight, or other later Diorama
behavior is included in V0.

## Safety

- no fake canonical execution;
- no fake progress, dialogue, testing, or collaboration;
- no backend or schema changes;
- no change to Task / Run / AgentRun / Event / Replay contracts;
- no binary asset-policy change;
- Office remains supplemental to ordinary HTML operational surfaces.
