# Office View

Status: Phase 8 implementation specification

Office View is an optional visual projection of canonical Run state. It does not own
workflow state and must never become the only way to understand or operate a Run.

## Routes

```text
/runs/:runId/office   visual office simulation
/runs/:runId          canonical operational Run
```

## Projection model

```text
RunStage         → spatial office zone
AgentRun         → exactly one character/workstation
AgentRun.status  → character pose, status and destination
canonical Event  → bounded factual signal / refresh trigger
Workspace        → factual detail label
Executor         → factual detail label
```

No visual character exists without a persisted AgentRun.

## State mapping

```text
PENDING / CREATED → waiting to start
STARTING          → entering / moving to factual workstation
RUNNING           → working-at-station animation
WAITING           → waiting-zone idle animation
BLOCKED           → incident-zone alert animation
FAILED            → incident-zone alert animation
COMPLETED         → completed neutral pose
CANCELLED         → cancelled neutral pose
unknown           → explicit unknown presentation
```

The animation is a representation of canonical state, not a progress estimate.
A RUNNING character may use a repetitive work pose, but Office View never derives a
percentage, token count, typing speed, reasoning state, or completion forecast from it.

## Event mapping

Office View may visually react only to canonical events such as:

```text
agent.started
agent.waiting
agent.completed
agent.failed
review.finding.created
test.started
test.completed
```

Events remain facts, not current-state authority. SSE event bursts are coalesced into a
bounded durable-state refresh instead of creating an unbounded animation queue.

## Three.js scene architecture

The renderer uses Three.js 0.181.x.

```text
RunOfficePage
  └─ OfficeScene
      ├─ ThreeOfficeScene          orchestration / camera / replay / picking
      ├─ office3d/environment.ts   office, stages, furniture, workstation placement
      └─ office3d/character.ts     humanoid rig, nameplate and state animation
```

The scene uses the same composition principle as the reviewed office references: one
continuous office, compact workstation clusters, small characters relative to the room,
and a stable overhead/isometric observer view. Stage state remains visible through subtle
floor zones rather than six visually dominant room cards.

The scene includes:

- WebGLRenderer
- fixed orthographic/isometric observer camera
- OrbitControls configured as zoom-only; rotation and panning are locked
- directional, fill and hemisphere lighting
- soft shadows
- stage zones and a central circulation corridor
- desks, monitors, chairs, shelving, plants and a lounge area
- procedural stylized humanoid characters
- DOM/CSS nameplates rendered with Three.js CSS2DRenderer
- raycasting for character selection
- an ordinary HTML roster for keyboard-accessible selection

The character module deliberately separates character implementation from simulation state.
A future audited rigged glTF character can replace the procedural mesh without changing the
AgentRun mapping, movement engine or operational truth model.

## Character motion

Movement is deterministic and bounded.

```text
entrance
   ↓
central corridor
   ↓
RunStage workstation
```

State destinations:

```text
STARTING / RUNNING → stage workstation
WAITING            → waiting area
BLOCKED / FAILED   → incident area
COMPLETED          → stage workstation, terminal pose
CANCELLED          → stage workstation, terminal pose
```

The runtime character has explicit visual poses:

- walk cycle while traversing waypoints
- working-at-desk loop for RUNNING
- quiet waiting idle for WAITING
- alert idle for BLOCKED / FAILED
- neutral terminal pose for COMPLETED / CANCELLED

No random wandering, fictional meetings, coffee breaks, dialogue, or collaboration is
generated.

## Render-loop policy

The animation loop is demand-aware:

- movement keeps frames running
- STARTING / RUNNING / WAITING / BLOCKED / FAILED visual poses may keep frames running
- terminal idle state does not require a continuous render loop
- OrbitControls render on interaction
- paused motion suppresses character animation
- no backend polling loop is introduced by Office View

The SSE list remains bounded to the latest normalized events and the visible signal list is
bounded to six relevant events.

## Historical replay

Completed Runs expose an explicit:

```text
Historical replay · timing compressed
```

Replay uses persisted AgentRun `started_at` and `completed_at` facts. It preserves factual
ordering while compressing time for observability. Characters enter through the office
entrance, traverse the corridor, reach their factual stage workstation, and temporarily show
the RUNNING work pose before terminal state.

Replay is explicitly labelled and must never be presented as live execution.

## Failure independence

Office rendering is isolated from canonical workflow execution.

If WebGL or the renderer fails:

- the operational Run remains available
- cancellation remains available
- Findings remain available
- Evidence remains available
- approvals remain available
- executor selection remains available

The Office renderer has a local fallback instead of failing the Run page.

## Accessibility

The WebGL scene is supplemental.

Every factual AgentRun is also exposed through the normal HTML roster beneath the scene.
The roster is keyboard focusable, has role/state text, and opens the same factual AgentRun
detail as 3D raycasting.

Office View is not required for any control-plane action.

## Visual assets and provenance

Current Phase 8 visual geometry is generated inside Agent Office.

There are no bundled third-party:

- character models
- textures
- stock images
- sprite sheets
- icon packs
- remote fonts

Runtime dependency:

- `three` 0.181.x — MIT License

The implementation was informed by public reference patterns in:

- `W17ant/Claude-Office` — position targets, path-oriented movement and office presence
- `wickedapp/openclaw-office` — event-driven office/task visualization
- `Shubhamsaboo/awesome-llm-apps` — Three.js scene/camera/render-loop patterns

No visual asset or product identity from those repositories is copied.

### Audited character-upgrade candidate

Quaternius Universal Base Characters and Universal Animation Library were evaluated as a
future character replacement because their free distributions are CC0 and provide rigged
humanoid glTF/GLB assets and locomotion/idle animation libraries.

They are **not vendored in the repository at this Phase 8 checkpoint**. If added later, the
binary assets, exact upstream source, license text, checksums and modifications must be
recorded before merge.

## Truthfulness constraints

Office View must not:

- create placeholder workers that do not correspond to AgentRuns
- fabricate progress percentages
- fabricate thinking/reasoning activity
- infer test success without canonical Evidence/Event truth
- imply merge or deploy status
- hide blockers behind visual presentation
- use Event history as the only source of current state
- animate unknown state into success
- present Historical replay as live execution
