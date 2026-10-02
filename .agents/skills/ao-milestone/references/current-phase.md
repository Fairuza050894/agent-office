# Agent Office Current Milestone

## Current checkpoint

```text
main@0df26e9
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
```

Canonical full verification:

```bash
./scripts/verify.sh
```

## Current status

```text
Phase 13A — COMPLETE / MERGED
merge commit: 0df26e9b211e8e27bbd4c0a822d68cab8233df17
next checkpoint: not started
```

## Phase 13A accepted production state

- Planning Office now uses R3F in normal production rendering.
- Three.js remains the tested Planning fallback.
- Live and Replay remain on the existing Three.js renderer.
- Task / Run / AgentRun / Event truth remains outside the renderer.
- R3F is a production dependency because Planning now consumes it.
- Production bundle guard requires the production R3F Planning path and rejects
  Diorama/debug leakage.
- Production Chromium smoke verifies Planning R3F loads successfully.
- No visual redesign, post-processing stack, or workflow-truth change was made
  in Phase 13A.

## Phase 13A final verification

Exact PR head:

```text
0ecabadd2d01834d18b2878bc71d0582068afab4
GitHub Actions verify #1376: SUCCESS
```

Gates:

```text
backend pytest / Ruff / format / MyPy: PASS
frontend tests / typecheck / lint / build: PASS
repository whitespace: PASS
production Office guard: PASS
production R3F Planning Chromium smoke: PASS
```

Detailed evidence:

```text
docs/product/PHASE_13A_R3F_PLANNING_PRODUCTION.md
docs/product/PHASE_13A_R3F_PLANNING_PRODUCTION_VERIFICATION.md
docs/product/PHASE_12_R3F_RENDERER_PILOT_VERIFICATION.md
docs/architecture/ADR-0004-office-renderer-evolution.md
docs/ux/OFFICE_VIEW.md
```

## Next renderer boundary

A later checkpoint may evaluate Live/Replay migration, but it must preserve:

- canonical execution/replay truth;
- tested Three.js fallback until cutover evidence is accepted;
- accessibility through HTML operational surfaces;
- reduced-motion behavior;
- deterministic visual/performance gates;
- no fake progress, collaboration, dialogue, or execution state;
- one checkpoint per PR.

No Phase 13B implementation has started from this post-merge sync.
