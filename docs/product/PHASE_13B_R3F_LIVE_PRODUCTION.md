# Phase 13B — R3F Live Production Migration

Status: IN PROGRESS

## Goal

Promote React Three Fiber from the accepted Planning production path to the
**Live operational Office** while keeping Replay on the current Three.js
renderer.

Phase 13B deliberately does not migrate Replay.

## Production renderer split

```text
Planning Office (/office)
        |
        +-- R3F production renderer
        |      |
        |      +-- React failure -> Three.js fallback
        |
Live Run (/runs/:runId/office)
        |
        +-- R3F production renderer
        |      |
        |      +-- React failure -> Three.js fallback
        |
Replay (/runs/:runId/office?mode=replay)
        |
        +-- current Three.js renderer
```

Canonical Task / Run / AgentRun / Event truth remains owned outside the
renderer. The existing outer operational Office boundary remains the final HTML
fallback.

## Renderer-neutral Live projection

Phase 13B moves shared scene-member and runtime-target mapping behind
`office3d/runtimeProjection.ts`. Three.js and R3F consume the same canonical
mapping for AgentRun identity, profile name, status target, stage ownership,
floor placement, and path construction.

The renderer does not create progress, dialogue, test results, collaboration,
or workflow transitions.

## Live behavior

R3F Live consumes the same `RunStage[]`, `AgentRun[]`, and
`AgentProfile[]` already supplied to the operational Office. It keeps the
existing camera, lighting, character, furniture, selection, and movement
contracts while the HTML contextual rail and operations dock remain
authoritative.

## Failure model

```text
R3F Planning / Live
       |
       +-- success -> R3F scene
       |
       +-- React error -> Three.js scene
                              |
                              +-- outer boundary -> HTML operations
```

No fallback path mutates workflow state.

## Explicitly deferred

- Replay R3F migration;
- removal of Three.js;
- visual redesign;
- post-processing or Drei;
- physics;
- Unity;
- backend/schema/workflow changes;
- fake AgentRun progress or activity.

## Verification

Required branch/PR gate:

```text
backend pytest + Ruff + format + MyPy
frontend tests + typecheck + lint + build
repository whitespace verification
production Office bundle guard
Chromium production renderer split smoke
```

Production browser smoke must prove Planning=R3F, Live=R3F with a canonical
AgentRun projected into the scene, Replay=Three.js, no Diorama fixture leakage,
and no page errors.

## Acceptance

Phase 13B is accepted only when the exact PR head passes every required gate.
