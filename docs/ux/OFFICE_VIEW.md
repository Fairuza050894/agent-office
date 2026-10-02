# Agent Office 3D Experience

Status: Phase 8 implementation specification

## One Agent Office, multiple truth scopes

Agent Office is one persistent 3D workplace. Routes are compatible entry points
into different truth scopes; they are not separate virtual offices.

```text
Agent Office
  |
  +-- Planning
  |     internal scope key: workspace
  |     planning + ambient + canonical work projection
  |
  +-- Live Run
  |     canonical Run / AgentRun truth
  |
  +-- Historical Replay
        persisted historical Run / AgentRun / Event truth
```

Entry routes remain:

```text
/office
/runs/:runId/office
```

`/office` enters the visible **Planning** scope while retaining the internal
`workspace` scope key for route/code compatibility. `/runs/:runId/office`
deep-links the same Agent Office experience into the selected Run. From there
the user may switch between Planning, Live Run, and Replay without adopting a
second office mental model. The canonical Git `Workspace` domain keeps its
existing isolated-worktree meaning.

The 3D environment, floor vocabulary, camera model, character runtime, and
interaction grammar are shared. Truth sources are not merged:

- Planning presence comes from durable planning records.
- Planning ambience is explicitly presentation-only.
- Planning may also project canonical WORK presence from Task / Run / AgentRun
  truth established by Phase 10G; that layer remains distinct from planning and
  ambience.
- Live Run presence comes from canonical Run / AgentRun state.
- Historical Replay comes from persisted factual timestamps/events.

Historical Replay is therefore a **Run truth scope**, not a feature of ambient
Workspace simulation.

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

## Phase 9A Office-first workspace

Phase 9A introduces the Office-first Workspace while retaining the
Run-scoped deep link as a compatible entry into the same Agent Office experience.

Primary routes:

```text
/office
/runs/:runId/office
```

`/office` is the project-aware **Planning scope** (internal key: `workspace`). It may render planning
and clearly labelled ambient presence without factual AgentRuns.

`/runs/:runId/office` is a backward-compatible **Run-scoped entry point** into
the same Agent Office. Live Run and Historical Replay use canonical operational
truth while preserving the same floors, camera interaction, characters, and
scene shell.

Primary application navigation is intentionally reduced around the main
workflow:

```text
Office
Projects
Runs
```

Overview, Tasks, engineering registries, observability, Audit, and Settings
remain available under **More tools**. This reduces global navigation noise
without removing capability or stable routes.

Desktop structure from Phase 10F onward:

```text
compact command rail
Three.js Office + contextual operations rail
collapsible Bottom Operations Dock
```

The contextual rail is Office-local and collapsible. Its views are Discussion,
Details, Files, and Logs. Selecting a factual AgentRun or Office planning member
changes the rail context rather than opening a second inspector surface.

The Bottom Operations Dock remains the compact shared surface for canonical
Tasks, activity, planning queues, and the factual AgentRun/planning team.

In Planning scope, the existing Universal Composer is hosted inside Discussion.
It continues to use durable planning APIs and must not fabricate role messages.
Creating a Task from the rail creates Task truth only; Start Run remains governed
by the planning-to-execution promotion contract.

In Live / Replay, Discussion is a readable Event projection. It is not a channel
that silently mutates an in-flight AgentRun.

Office workspace maximize mode temporarily covers ordinary application chrome,
retains an explicit exit control, and exits with Escape. Maximizing changes
presentation only; it never changes Run state.

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


## Phase 9A visual polish

The Phase 9A visual gate adds the following presentation rules:

- completed AgentRun nameplates are hidden by default to reduce scene clutter
- active / waiting / blocked / failed AgentRuns retain visible nameplates
- selecting any AgentRun reveals its nameplate and inspector
- default Office camera framing is closer than the Phase 8 framing
- Run Office View uses `Live run` / `Historical replay` language instead of
  conflating SSE connectivity with Run state
- backend event connectivity is reported separately as an event-stream state
- `/office` starts with the Operations Dock open in normal state from Phase
  10H-1 onward; Maximize may still force it compact as presentation-only state
- maximize mode forces the dock into its compact state so command rail, Office,
  composer, and dock fit in one viewport
- Runs registry and Run detail surfaces use the same dark control-room visual
  hierarchy as Office
- Office-route navigation is denser than ordinary registry navigation to preserve
  horizontal scene space

These are presentation changes only. They do not alter canonical Run, AgentRun,
Event, replay, or Workspace semantics.


## Phase 10H-1 vocabulary and structure override

The owner-approved `docs/ux/OFFICE_SHIFT_RULER_DIRECTION.md` is the latest
presentation contract for the shared Agent Office shell.

Visible scope vocabulary is:

```text
Planning
Live
Replay
```

The internal `workspace` scope key remains compatible and the canonical
`Workspace` domain still means an isolated execution workspace/worktree.

Phase 10H-1 also establishes:

- underlined text scope navigation rather than segmented cards;
- compact Docket tabs that exist only when canonical source data exists;
- Composer input after planning history/context, at the bottom of Discussion;
- `+ Task` through the existing CreateTaskModal rather than a permanent form;
- Planning Operations Dock open by default;
- no Shift Ruler or truth-line implementation in this phase.

Phase 10G canonical WORK projection remains valid inside Planning and must not
be removed merely to match an older planning+ambient-only mock.


## Phase 11 V0 deterministic visual verification

Phase 11 V0 adds a development-only visual evidence harness for Office View.

The debug fixture uses the existing `/office` route with:

```text
fixture=diorama
debugTime=<fixed instant>
floor=commons|build|strategy
```

The fixture is visibly labelled `Simulated`, uses deterministic AMBIENT
presentation members only, and never creates canonical Task, Run, AgentRun, or
Event truth.

The fixture freezes Office world time so lighting and environment screenshots
can be compared deterministically. Three.js renderer counters are exposed only
to the development harness for baseline evidence.

Production Office behavior ignores the fixture. The production build gate scans
for Diorama debug markers before V0 can be accepted.

The V0 harness does not change camera policy, lighting architecture, asset
transport, workflow state, Replay, Shift Ruler, or truth-line behavior.
