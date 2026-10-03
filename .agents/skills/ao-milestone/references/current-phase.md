# Agent Office Current Milestone

## Current checkpoint

```text
main@588ae3a
Phase 10H-1 merged
PR #24 Vocabulary & Structure merged
PR #25 Office 3D experience polish merged
PR #27 Phase 6 Codex test hardening merged
PR #29 Office Diorama V0 merged
PR #30 Office Diorama V1 merged
PR #31 Office Diorama V2 asset pilot merged
PR #32 Office Diorama V3 Build rollout merged
PR #33 Phase 12 R3F renderer pilot merged
PR #35 Phase 13A R3F Planning production migration merged
PR #36 post-Phase-13A milestone sync merged
PR #37 Phase 13B R3F Live production migration merged
PR #38 Phase 13C R3F Replay production migration merged
PR #39 Phase 14 Office Visual Evolution merged
```

Canonical full verification:

```bash
./scripts/verify.sh
```

## Current status

```text
Phase 14 — COMPLETE / MERGED
exact verified PR head: aff921d640eef690fe4cb922640aa9860b9325d6
GitHub Actions verify #1425: SUCCESS
merge commit: 588ae3af511219a4d6c3691fa70360967c3b11a9
```

## Accepted production state after Phase 14

- Planning, Live, and Replay use R3F in the normal production path.
- Three.js remains behind the tested React renderer fallback boundary.
- HTML operational surfaces remain the final non-WebGL fallback.
- Furniture materials now use deeper surface separation and restrained PBR values.
- Morning/day/evening/night lighting remains operationally readable with stronger visual distinction.
- R3F directional shadows use tuned bias/normal-bias/radius for improved contact depth.
- Explicit Agent selection eases camera focus rather than snapping abruptly.
- Pointer hover exposes a restrained ring/nameplate affordance.
- Selection presentation is reapplied after Live/Replay status changes.
- Existing deterministic living-office idle/break/room/right-of-way behavior remains authoritative presentation; no fake work/dialogue/progress was added.
- `docs/ux/OFFICE_ASSET_PIPELINE.md` defines the Blender-ready Tier A authoring contract while current curated GLBs remain honestly identified as Tier B assets and procedural geometry as Tier C fallback.

Phase 14 implementation evidence:

```text
docs/product/PHASE_14_OFFICE_VISUAL_EVOLUTION.md
docs/ux/OFFICE_ASSET_PIPELINE.md
frontend/src/components/R3FOfficeScene.tsx
frontend/src/office3d/lighting.ts
frontend/src/office3d/officeFurnitureKit.ts
frontend/src/office3d/officeFurnitureKit.test.ts
```

Phase 14 gates:

```text
backend pytest / Ruff / format / MyPy: PASS
frontend tests (184) / typecheck / lint / build: PASS
repository whitespace verification: PASS
production Office bundle guard: PASS
Chromium production smoke: PASS
  Planning = R3F
  Live = R3F
  Replay = R3F
  Three.js = fallback-only during successful smoke
```

## Phase 13C accepted production state

Merge commit:

```text
786417e75bd02fe22b5e23c5a4d96d1e7cb29f92
```

Exact PR #38 head and verification:

```text
526b0a12bab98f344a88e4eebd13403a2c16a64d
GitHub Actions verify #1413: SUCCESS
```

Gates:

```text
backend pytest / Ruff / format / MyPy: PASS
frontend tests / typecheck / lint / build: PASS
repository whitespace: PASS
production Office guard: PASS
production renderer split Chromium smoke: PASS
```

Accepted Phase 13C renderer state:

```text
Planning = R3F
Live = R3F
Replay = R3F
Three.js = fallback-only on successful production path
```

Detailed Phase 13C evidence:

```text
docs/product/PHASE_13C_R3F_REPLAY_PRODUCTION.md
frontend/src/components/R3FOfficeScene.tsx
frontend/src/components/OfficeScene.tsx
frontend/src/components/OfficeScene.test.tsx
frontend/src/pages/RunOfficePage.tsx
frontend/scripts/check-office-r3f-production.mjs
```

## Phase 13B accepted production state

Merge commit:

```text
0eff0f4003750809b7d841f6e111be93a45d260d
```

Exact PR #37 head and verification:

```text
43af73aacefe2452faf0512faf9e8374678eb576
GitHub Actions verify #1386: SUCCESS
```

Accepted Phase 13B renderer state:

```text
Planning = R3F
Live = R3F
Replay = Three.js
```

## Phase 13A accepted production state

- Planning Office uses R3F in normal production rendering.
- Three.js remains the tested Planning fallback.
- Live and Replay remained on the existing Three.js renderer at the Phase 13A acceptance point.
- Task / Run / AgentRun / Event truth remains outside the renderer.
- R3F is a production dependency because Planning consumes it.
- Production bundle guard requires the production R3F Planning path and rejects Diorama/debug leakage.
- Production Chromium smoke verifies Planning R3F loads successfully.
- No visual redesign, post-processing stack, or workflow-truth change was made in Phase 13A.

Exact PR #35 head and verification:

```text
0ecabadd2d01834d18b2878bc71d0582068afab4
GitHub Actions verify #1376: SUCCESS
```

## Truth and safety boundary

Every later Office checkpoint must preserve:

- canonical execution/replay truth;
- tested Three.js fallback until a separate fallback-retirement decision is accepted;
- accessibility through HTML operational surfaces;
- reduced-motion behavior;
- deterministic visual/performance gates;
- no fake progress, collaboration, dialogue, testing, or execution state;
- one checkpoint per PR.
