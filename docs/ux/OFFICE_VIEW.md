# Office View

Status: Phase 8 implementation specification

Office View is an optional visual projection of canonical Run state. It does not own
workflow state and must never become the only way to understand or operate a Run.

## Visual architecture

The Phase 8 renderer uses Three.js with a PerspectiveCamera, OrbitControls,
CSS2DRenderer nameplates, canonical AgentRun movement, and raycast selection.

The office composition intentionally follows the spatial grammar studied in
`W17ant/Claude-Office`:

- one open-plan room rather than six boxed stage rooms
- three compact workstation clusters
- standing desks instead of seated cubicles
- a connected central aisle
- a right-side entry flow
- lounge/waiting, coffee, filing, printer, and plant anchors
- factual workflow stages represented as small floor accents near stations

The implementation does not copy Claude-Office sprites, room images, characters,
or product identity. Agent Office keeps its own Three.js geometry and canonical
Run/Stage/AgentRun truth model.

## Character

The primary character is Quaternius **Business Man** from the Ultimate Modular
Men Pack, distributed as CC0 1.0.

Runtime mapping:

```text
movement        → CharacterArmature|Walk
RUNNING         → CharacterArmature|Interact
COMPLETED       → CharacterArmature|Idle_Neutral
WAITING         → CharacterArmature|Idle_Neutral
BLOCKED/FAILED  → CharacterArmature|Idle_Neutral
```

The model is clothed in a business suit. Per-agent suit tinting is cosmetic only
and is derived deterministically from `agent_profile_key`.

The source rig visually faces opposite Agent Office's positive-Z travel
convention, so the model receives a fixed 180° local yaw. This keeps character
faces aligned with actual path direction without changing canonical movement.

Exact source, license, bytes, SHA-256, and pinned transport commit live in
`frontend/public/assets/office/ASSET_PROVENANCE.md`.

## Layout truth

Each visual character still corresponds to exactly one persisted AgentRun.
Stage placement is deterministic from RunStage ordering. A stage may contain
multiple factual agents; additional agents are offset within the same workstation
pod without creating fictional workers.

WAITING and BLOCKED/FAILED destinations remain explicit factual zones.
Historical replay still uses persisted `started_at` / `completed_at` order.

## Camera

```text
PerspectiveCamera
left drag     orbit
right drag    pan
wheel         zoom
horizontal    full 360°
vertical      bounded above floor
```

Office View never owns merge, cancellation, approval, Evidence, Finding,
executor selection, or workflow state.

## Truthfulness constraints

Office View must not:

- create workers that do not correspond to AgentRuns
- fabricate progress percentages
- fabricate reasoning or dialogue
- infer test success without canonical Evidence/Event truth
- imply merge or deploy status
- hide blockers behind visual presentation
- use Event history as the only source of current state
- present Historical replay as live execution
