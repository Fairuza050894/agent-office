# ADR-0005 — R3F Production Renderer with Three.js Fallback

Status: Accepted for Phase 13A  
Date: 2026-10-02

## Context

Phase 12 demonstrated exact Three.js / R3F renderer parity for the accepted
Build fixture on desktop and mobile after correcting the legacy mobile camera
frustum.

The product now needs a production cutover without a big-bang removal of the
known-good renderer.

## Decision

React Three Fiber becomes the default Agent Office renderer for Planning, Live,
and Replay.

The imperative Three.js renderer remains a local presentation fallback during
the migration period.

The boundary is:

```text
OfficeScene
  -> R3FOfficeScene
       |
       +-- React/lazy render failure -> ThreeOfficeScene
```

The outer OfficeRendererBoundary remains the last-resort path to ordinary HTML
operational UI.

## Truth boundary

Neither R3F nor Three.js owns workflow state.

Both consume canonical projection input supplied by the page/application layer.

A renderer failure cannot:

- change Run state;
- change AgentRun state;
- change Event history;
- approve/reject requirements;
- start/cancel execution;
- create Findings/Evidence.

## Shared runtime projection

Renderer-neutral member projection and target/path helpers live under
`office3d/runtimeProjection.ts`.

The purpose is to prevent the two renderers from developing separate workflow
interpretations while the fallback exists.

## Replay

R3F reuses the existing factual replay plan and clock. Missing factual
timestamps remain unavailable rather than being synthesized.

## Dependency

R3F is now a production dependency.

Drei and post-processing remain unapproved until a later measured checkpoint.

## Consequences

Positive:

- declarative renderer becomes the normal Office path;
- legacy renderer remains an immediate migration safety net;
- Planning/Live/Replay share one renderer architecture;
- Phase 12 visual/performance evidence remains relevant.

Tradeoffs:

- two renderers temporarily remain in the bundle;
- duplicate presentation code still exists for some lifecycle behavior;
- final bundle reduction waits until the fallback retirement checkpoint.

## Exit criterion

Three.js may only be removed after a later checkpoint proves:

- Planning/Live/Replay production stability;
- interaction parity;
- failure recovery;
- accessibility;
- bundle/performance acceptability;
- owner acceptance.
