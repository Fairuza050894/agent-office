# Phase 14 — Office Visual Evolution

## Status

Implementation checkpoint for the unified R3F production Office after Phase 13C.

Base merge:

```text
786417e75bd02fe22b5e23c5a4d96d1e7cb29f92
```

## Goal

Improve visual depth and direct-manipulation feel without redesigning the product shell or changing canonical workflow truth.

## Delivered scope

### Furniture and materials

- keeps the existing licensed GLB furniture kit and instancing path;
- deepens wood, metal, upholstery, device, and screen material separation;
- uses restrained roughness/metalness rather than flat prototype color blocks;
- increases screen emissive readability without turning displays into room lights;
- preserves procedural furniture until the GLB kit is ready.

### Lighting and depth

- refines morning/day/evening/night balance;
- retains one global key + hemisphere model and the existing small room-light budget;
- tunes R3F directional shadow bias, normal bias, and radius for softer contact/depth;
- keeps the scene readable at night rather than using cinematic darkness that harms operations.

### Camera focus

- selected Agent focus now eases toward the character instead of snapping instantly;
- Replay auto-focus remains subordinate to explicit user selection;
- camera reset cancels temporary focus cleanly;
- existing bounded zoom and camera presets remain intact.

### Hover and selection

- pointer hover exposes a restrained interaction ring and pointer cursor;
- hover can reveal a nameplate without forcing transient labels to be permanently visible;
- selected Agent retains the stronger ring;
- R3F reapplies selection after canonical status changes so a selected Agent does not visually lose selection during Live/Replay transitions.

### Living-office behavior

Phase 14 retains the already implemented deterministic ambient behavior: workspace idle posture cycles, time-aware modes, breaks, room destinations, right-of-way, character clips, Live movement, and factual Replay movement. No fake work or fake dialogue was added merely to make the office look busy.

### Asset authoring

`docs/ux/OFFICE_ASSET_PIPELINE.md` establishes a Blender-ready Tier A authoring/export contract while keeping the current curated GLB kit as Tier B and procedural geometry as Tier C fallback.

The existing third-party GLBs are not relabeled as custom Blender-authored props. A genuine custom `.blend`/GLB pack requires real authored binary assets and provenance; the runtime is ready for that replacement without truth-model changes.

## Truth boundary

Phase 14 changes presentation only. Task, Run, AgentRun, Event, Finding, Evidence, executor, approval, replay timing, and workflow state remain canonical outside the renderer.

## Acceptance gates

```text
backend pytest / Ruff / format / MyPy
frontend tests / typecheck / lint / build
repository whitespace verification
production Office guard
Chromium production smoke:
  Planning = R3F
  Live = R3F
  Replay = R3F
  no silent Three.js fallback
  no page errors
```

## Readiness interpretation

After these gates pass, Agent Office is suitable as a polished internal/technical beta with a coherent production renderer and professional interaction language. It should not be described as a finished AAA/Sim-style art package until a dedicated custom authored asset pack and broader device/performance validation are completed.
