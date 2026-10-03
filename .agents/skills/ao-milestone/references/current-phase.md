# Agent Office Current Milestone

## Current checkpoint

```text
main@6e6680d
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
PR #41 Phase 15–16 Character & Art Production Hardening merged
PR #42 Phase 17–18 Navigation Hardening & Living Office V2 merged
PR #43 Phase 19 Universal Composer & KPI Productization merged
```

Canonical full verification:

```bash
./scripts/verify.sh
```

## Current status

```text
Phase 19 — COMPLETE / MERGED
exact verified PR head: e0638374ef4c647e81d344d3e56fdc44623b5565
GitHub Actions verify #1461: SUCCESS
merge commit: 6e6680dc27ad6428feba099fd2c04c269a59444b
```

## Accepted production state after Phase 19

- Planning, Live, and Replay use R3F in the normal production path.
- Three.js remains behind the tested renderer recovery boundary; HTML operational surfaces remain the final fallback.
- The nine Living Office core roles have deterministic production identity coverage.
- Five rigged production character GLBs are integrity/provenance checked and must expose guaranteed Idle/Walk/Run clips before development/build/render preparation can continue.
- Current character binaries remain honestly identified as third-party assets; no fake Blender-authored provenance is claimed.
- Workspace/Living Office movement uses deterministic per-agent corridor lane separation and waypoint compaction while preserving factual destinations.
- Existing stage-aware, time-aware, break-aware, capacity-bounded Living Office behavior remains the source of ambient presentation truth; no fake work/dialogue/progress is introduced.
- Universal Composer defaults to AUTO orchestration and derives project/thread intent and executor context without carrying stale drafts across context changes.
- RUN remains a reviewed intent and cannot bypass canonical Task/Run promotion or execution safety gates.
- `/kpi` exposes project-scoped Task/Run delivery reporting from canonical records only.
- KPI includes task delivery, Run success, completed cycle time, active/completed/failed/cancelled Runs, retries, remediation cycles, latest activity, and task-level execution attempts.
- Missing KPI facts remain unavailable instead of being inferred.
- KPI is descriptive and does not rank agents or invent individual productivity scores.
- Graphify/Obsidian/another knowledge graph was intentionally not added to execution truth; the existing Project/Task/Run/Workflow/AgentRun/Event/Evidence/Finding/ComposerThread/RequirementCandidate/TeamProposal domain model is sufficient for this checkpoint. A graph may be added later only as a read model when cross-project dependency intelligence requires it.

## Phase 19 final verification

Exact PR #43 head and verification:

```text
e0638374ef4c647e81d344d3e56fdc44623b5565
GitHub Actions verify #1461: SUCCESS
merge commit: 6e6680dc27ad6428feba099fd2c04c269a59444b
```

Gates:

```text
backend pytest / Ruff / format / MyPy: PASS
frontend tests (193) / typecheck / lint / build: PASS
Office character production guard: PASS
repository whitespace verification: PASS
production Office guard: PASS
Chromium production smoke: PASS
  Planning = R3F
  Live = R3F
  Replay = R3F
```

Phase 19 implementation evidence:

```text
docs/product/PHASE_19_COMPOSER_KPI_PRODUCTIZATION.md
frontend/src/analytics/projectKpi.ts
frontend/src/analytics/projectKpi.test.ts
frontend/src/pages/ProjectKpiPage.tsx
frontend/src/pages/ProjectKpiPage.test.tsx
frontend/src/components/office/UniversalComposerShell.tsx
frontend/src/components/office/UniversalComposerShell.test.tsx
frontend/src/types/navigation.ts
frontend/src/layouts/AppShell.tsx
```

## Phase 17–18 accepted production state

Exact PR #42 head and verification:

```text
9ebd07acb6fb0c015fbac8b1c1baaabc0f28c17a
GitHub Actions verify #1440: SUCCESS
merge commit: 979f18f00d3afe45ec0018494bfa7536bc7ec2d0
```

Accepted scope:

- deterministic per-agent corridor lane assignment;
- intermediate path separation without offsetting the factual destination;
- duplicate and effectively-collinear waypoint compaction;
- shell-bound path clamping;
- renderer-neutral integration in shared runtime projection;
- existing Living Office truth/capacity/time behavior retained;
- no heavy physics engine or random NPC steering introduced.

Detailed evidence:

```text
docs/product/PHASE_17_18_NAVIGATION_LIVING_OFFICE_V2.md
frontend/src/office3d/navigationPolicy.ts
frontend/src/office3d/navigationPolicy.test.ts
frontend/src/office3d/runtimeProjection.ts
```

## Phase 15–16 accepted production state

Exact PR #41 head and verification:

```text
b2fea7b1c8bfad66fc1efef4232f11f54c3047ac
GitHub Actions verify #1434: SUCCESS
merge commit: ed7c7b1fa22c068ef796ac76bc930045e5483605
```

Accepted scope:

- nine core Living Office roles have deterministic unique appearance identities;
- five rigged GLBs are validated as production assets during dev/build/render preparation;
- required Idle/Walk/Run clips and source/integrity provenance are build-gated;
- legacy execution role identity remains deterministic;
- incompatible skeleton retargeting is intentionally rejected;
- bespoke Blender art remains a future art-production enhancement rather than a Phase 17–19 blocker.

Detailed evidence:

```text
docs/product/PHASE_15_16_CHARACTER_ART_PRODUCTION.md
frontend/scripts/check-office-character-production.mjs
frontend/src/office3d/character.test.ts
frontend/package.json
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
