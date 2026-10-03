# Phase 13C — R3F Replay Production Migration

Status: IN PROGRESS

## Objective

Complete the production R3F renderer migration by moving the historical Run / AgentRun Replay surface to React Three Fiber while preserving the accepted canonical replay semantics and fallback boundaries.

This checkpoint completes the renderer sequence:

```text
Planning -> R3F
Live     -> R3F
Replay   -> R3F
```

Three.js remains available as the tested renderer fallback. This checkpoint does not remove Three.js.

## Scope

### In scope

- Promote operational Replay to the existing R3F production renderer.
- Reuse the renderer-neutral AgentRun/member/station projection introduced before Live migration.
- Preserve the existing factual replay range and replay plan derived from canonical AgentRun timestamps.
- Preserve the replay-specific movement-facing contract so historical playback does not reintroduce backwards-walking orientation defects.
- Preserve entry semantics: hidden/PENDING before factual start, then STARTING at the replay event, movement from entrance to the assigned station, RUNNING after arrival, and final canonical status after completion timing.
- Preserve selected-agent focus and add short replay event camera focus without changing canonical truth.
- Keep the R3F -> Three.js React error boundary and the outer operational HTML boundary.
- Extend production bundle and Chromium smoke gates so Replay must prove an R3F production host.

### Out of scope

- Removing Three.js fallback code.
- Backend, schema, executor, workflow, Task, Run, AgentRun, or Event truth changes.
- Inventing replay dialogue, collaboration, tests, progress, or execution state.
- Large UI redesign.
- Physics-engine migration.
- Post-processing stack expansion.
- Unity or another renderer/platform migration.
- Asset pipeline replacement.

## Replay truth contract

Replay continues to use `officeReplayRange()` and `officeReplayPlan()` as its factual timing contract. R3F is only a presentation/runtime consumer of that contract.

For each canonical AgentRun:

1. Before its replay `start` event, the character remains hidden and `PENDING`.
2. At the `start` event, the character appears at an entrance position and becomes `STARTING`.
3. The character follows the existing office path contract to its factual station.
4. On arrival, `STARTING` becomes `RUNNING`.
5. At the replay `finish` event, the character transitions to the canonical final AgentRun status using the same delayed presentation semantics as the previous Three.js replay runtime.

Movement direction uses the existing replay-specific `officeMovementYaw(..., 'replay')` contract.

## Failure recovery

Primary production renderer:

```text
Planning = R3F
Live     = R3F
Replay   = R3F
```

Failure chain:

```text
R3F React/WebGL failure
        -> ThreeOfficeScene fallback
        -> outer operational HTML surfaces remain available
```

Three.js is intentionally retained until a separate fallback-retirement decision is accepted with evidence.

## Production verification contract

The exact PR head must pass:

```text
backend pytest / Ruff / format / MyPy
frontend tests / typecheck / lint / build
repository whitespace verification
production Office bundle guard
Chromium Office production smoke
```

The Chromium smoke must prove:

- `/office` Planning -> R3F.
- `/runs/:runId/office` Live -> R3F.
- canonical AgentRun nameplate reaches the Live R3F scene.
- `/runs/:runId/office?mode=replay` Replay -> R3F.
- the replay character becomes visible after its factual replay start event.
- Replay does not silently fall back to Three.js during the smoke.
- no development Diorama fixture leaks to production.
- no page errors occur.

## Acceptance

Phase 13C is complete only when the exact PR head is green in GitHub Actions and the PR is merged to `main`.

After acceptance, the renderer migration is complete for all three production modes. Visual evolution can then proceed against one primary production renderer without duplicating work across separate primary implementations.
