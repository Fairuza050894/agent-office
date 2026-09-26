# Office View

Status: Phase 8 implementation specification

Office View is an optional visual projection of canonical Run state. It does
not own workflow state and must never become the only way to understand or
operate a Run.

## Visual target

Phase 8 intentionally follows the spatial grammar studied in
`W17ant/Claude-Office` without copying its room image, sprites, characters, or
product identity.

The 3D room now maps the main-office coordinates from that reference into
world space:

- three dense workstation clusters
- dedicated agent desk spots
- a right/back entry flow
- lounge area
- water cooler
- coffee counter
- filing cabinet
- printer station
- plants
- whiteboard
- large office windows
- warm wood floor
- suspended light fixtures

The Claude-Office desk/agent coordinates are treated as layout reference data;
Agent Office renders its own Three.js geometry.

## Character cast

The primary visual path is a deterministic cast of five clothed Quaternius
CC0 humanoids:

- male business suit
- male casual
- male hoodie
- female formal/dress
- female smart/casual

Each model is rigged and contains compatible `Idle`, `Walk`, and `Run`
clips. A local procedural silhouette exists only as an asset-load fallback.

Role-to-avatar mapping is deterministic from `agent_profile_key`; avatars do
not randomly change on reload.

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

## Movement

World-space movement remains owned by Agent Office.

Characters traverse a bounded office route from the factual entry area toward
their assigned workstation. Their root object rotates toward the actual travel
vector.

The Quaternius source rigs visually face -Z, so each loaded model receives a
fixed 180-degree local yaw. This corrects the source-model convention without
reversing canonical travel direction.

Historical replay still derives ordering from persisted AgentRun timestamps.

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
keeps text readable independent of camera angle.

The Three.js renderer uses soft shadow maps and real scene lighting. The floor
receives character/furniture shadows; lighting and animation do not fabricate
execution state.

## Event model

Live updates and Historical replay remain driven by canonical Run/AgentRun
state and the existing event stream. Random timers do not create fictional
agent behavior.

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
