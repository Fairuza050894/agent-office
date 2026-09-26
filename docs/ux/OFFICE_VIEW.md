# Office View

Status: Phase 8 implementation specification

Office View is an optional visual projection of canonical Run state. It does
not own workflow state and must never become the only way to understand or
operate a Run.

## Visual target

Phase 8 intentionally follows the spatial grammar studied in
`W17ant/Claude-Office` without copying its room image, sprites, characters, or
product identity.

The 3D room follows the compact, lived-in spatial grammar of the reference,
but uses original Three.js geometry and a purpose-built Agent Office floorplan.

The current startup-office layout is organized into five recognizable zones:

- central open workspace with eight deterministic factual workstations
- glass meeting room with table, chairs, wall display, and whiteboard surface
- pantry/cafe with counter, coffee machine, island, stools, refrigerator, and warm pendants
- recreation/game room with game table, display, seating, and cooler accent lighting
- lounge/focus area with sofa, tables, plants, and enclosed focus booths

Supporting office fixtures include a review/incident wall, storage, plants,
large windows, warm wood floor, rugs, task surfaces, and suspended lighting.

These areas are environmental context only. The presence of a meeting room,
pantry, or game room does not imply that an AgentRun is meeting, drinking,
playing, collaborating, or taking a break.

## Character cast

The primary visual path uses five clothed Quaternius CC0 humanoid rigs as the
licensed base library and composes eight deterministic role appearances from
them:

- Architect
- Explorer
- Backend Developer
- Frontend Developer
- QA Reviewer
- Security Reviewer
- Verifier
- Documentation Writer

A role appearance is a stable presentation profile derived from
`agent_profile_key`. It combines the licensed base outfit/model with a
role-specific body scale, material accent, and idle cadence/phase. This means
roles that share a base rig still have different silhouettes and surface
identity, while the same role remains visually consistent across renders.

Each base model is rigged and contains compatible `Idle`, `Walk`, and
`Run` clips. A local procedural silhouette exists only as an asset-load
fallback. Unknown future roles use a stable hash-derived appearance; no
appearance is randomized per render.

Exact sources, license information, transport commit, expected sizes, and Git
blob hashes are recorded in:

```text
frontend/public/assets/office/ASSET_PROVENANCE.md
```

## Truthful state machine

```text
PENDING / CREATED → waiting
STARTING          → walking from entry to factual workstation
RUNNING           → idle micro-motion at factual workstation
WAITING           → waiting area
BLOCKED / FAILED  → incident area
COMPLETED         → terminal idle at factual workstation
CANCELLED         → terminal neutral state
```

Walking and idle motion are purely visual representations of canonical
AgentRun state.

Office View never invents:

- progress percentage
- reasoning/thoughts
- dialogue
- meetings
- coffee breaks
- pizza deliveries
- fire drills
- completion forecasts

## Movement and collision correctness

World-space movement remains owned by Agent Office.

Every factual workstation now has a deterministic station anchor outside the
desk footprint, a final facing direction, and an approach route connected to a
shared safe aisle. Waiting and incident destinations use their own deterministic
clearance bays.

When a character moves between canonical states, routing first exits the source
anchor through its known approach path, traverses the shared aisle, and then
enters the destination path. It must not cut directly through desk geometry.

The office navigation module includes deterministic geometry checks that verify
core workstation, waiting, and incident routes do not intersect expanded desk
collision volumes. Final position and final yaw are both state-driven.

The Quaternius source rigs visually face -Z, so each loaded model receives a
fixed 180-degree local yaw. This corrects the source-model convention without
reversing canonical travel direction.

Historical replay still derives ordering from persisted AgentRun timestamps and
uses the same safe navigation paths as Live state.

## Camera

```text
PerspectiveCamera
left drag     orbit
right drag    pan
wheel         zoom
horizontal    full 360°
vertical      bounded above floor
```

OrbitControls use damping. Camera focus eases toward a selected agent and may
briefly ease toward an agent entering a Historical replay sequence; it never
changes Run state.

## Labels and shadows

Role/state labels use HTML/CSS overlay rendering through CSS2DRenderer, which
keeps text readable independent of camera angle. Their offsets are stable per
role so adjacent characters do not all project labels from exactly the same
screen-space height.

The Three.js renderer uses soft shadow maps and real scene lighting. The floor
receives character/furniture shadows; lighting and animation do not fabricate
execution state.

## Viewport and live sidebar

Desktop Office View uses a scene-first split layout:

- approximately 73% for the Three.js room and accessible AgentRun roster
- approximately 27% for a persistent live-control sidebar

The sidebar does not cover the 3D room. Its upper section contains the selected
AgentRun's factual role, state, stage, executor, workspace, timestamps, and
compact technical identifiers. Its lower section is a scrollable vertical
canonical Event stream. The earlier bottom signal table/list and floating
AgentRun detail overlay are not part of the target layout.

## Event model

Live updates and Historical replay remain driven by canonical Run/AgentRun
state and the existing event stream. Random timers do not create fictional
agent behavior.

Historical replay snapshots its factual timestamp range when replay starts.
Character start/finish transitions and the sidebar Event feed use the same
compressed playback clock. New live SSE Events may still be persisted while a
replay is running, but they do not move the already-started replay timeline.

The visual renderer is disposable: failure to load WebGL, a GLB, or an
animation does not affect cancellation, Findings, Evidence, approvals,
executor selection, or other operational controls.

## Accessibility

The 3D view remains supplemental. The ordinary HTML AgentRun roster remains
keyboard accessible and provides the same factual selection path as 3D
raycasting.

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
