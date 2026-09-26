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
AgentRun.status  → character animation, status and destination
canonical Event  → bounded factual signal / refresh trigger
Workspace        → factual detail label
Executor         → factual detail label
```

No visual character exists without a persisted AgentRun.

## State mapping

```text
PENDING / CREATED → waiting to start
STARTING          → entering / walking to factual workstation
RUNNING           → active seated workstation animation
WAITING           → waiting-zone idle
BLOCKED           → incident-zone idle + explicit blocked status
FAILED            → incident-zone idle + explicit failed status
COMPLETED         → seated workstation idle
CANCELLED         → terminal neutral state
unknown           → explicit unknown presentation
```

The animation is a representation of canonical state, not a progress estimate.
RUNNING motion never implies a percentage, token count, reasoning trace, typing speed,
dialogue, or completion forecast.

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
      ├─ ThreeOfficeScene          camera / movement / replay / picking
      ├─ office3d/environment.ts   office / stages / furniture / stations
      └─ office3d/character.ts     rigged GLB / mixer / labels / fallback
```

The scene uses one continuous office with compact workstation clusters. RunStage state is
projected through floor regions without turning each stage into a dominant room card.

The scene includes:

- WebGLRenderer
- PerspectiveCamera
- OrbitControls with full horizontal orbit
- bounded vertical orbit to keep the camera above the floor
- bounded zoom distance and optional panning
- directional, fill and hemisphere lighting
- soft shadows
- stage zones and central circulation corridor
- desks, monitors, chairs, shelving, plants and lounge furniture
- textured rigged humanoid GLB characters
- Quaternius non-root-motion animation clips
- DOM/CSS nameplates rendered with Three.js CSS2DRenderer
- raycasting for character selection
- an ordinary HTML roster for keyboard-accessible selection

The character implementation is isolated from Run state. A failed character-asset load
falls back to a local procedural silhouette without breaking the operational Run page.

## Character assets and animation

Phase 8 uses the free Standard editions of:

- Quaternius Universal Base Characters
- Quaternius Universal Animation Library

Both are released under CC0 1.0.

The binary assets are fetched during `npm run dev` and `npm run build` by:

```text
frontend/scripts/fetch-office-assets.mjs
```

The fetcher is deterministic:

- upstream repository is pinned to an exact commit
- each output file has a fixed expected byte size
- each output file is SHA-256 verified before use
- incomplete or mismatched output is removed
- browser runtime loads only the resulting local `/assets/office/` files

Exact provenance, hashes, source paths and license copies live in:

```text
frontend/public/assets/office/ASSET_PROVENANCE.md
frontend/public/assets/office/LICENSE-BASE-CHARACTERS.txt
frontend/public/assets/office/LICENSE-ANIMATIONS.txt
```

The current character source is a textured conversion of Quaternius
`Superhero_Male_FullBody` with the compatible 65-bone universal humanoid rig.
The animation library uses the matching skeleton.

Current presentation mapping uses:

```text
movement        → Walk_Loop
RUNNING         → Sitting_Talking
COMPLETED       → Sitting_Idle
WAITING         → Idle_Loop
BLOCKED/FAILED  → Idle_Loop
```

The `Sitting_Talking` clip is used only as visually active seated body motion. Agent Office
does not claim that a RUNNING agent is literally talking.

## Character movement

Movement remains deterministic and owned by Agent Office rather than root motion.

```text
entrance
   ↓
central corridor
   ↓
factual RunStage workstation
```

State destinations:

```text
STARTING / RUNNING → stage workstation
WAITING            → waiting area
BLOCKED / FAILED   → incident area
COMPLETED          → stage workstation
```

The animation library provides articulated locomotion and seated motion while the canonical
control plane owns world-space character translation.

No random wandering, fictional meetings, coffee breaks, dialogue, or collaboration is
generated.

## Camera controls

Office View is a real 3D observer scene rather than a fixed screenshot composition.

Default camera:

```text
PerspectiveCamera
position  12.8, 10.8, 14.2
target    0, 0.65, 0
FOV       38°
```

Controls:

```text
left drag     orbit
right drag    pan
wheel         zoom
horizontal    full 360°
vertical      bounded above the floor
distance      8.5 – 27 scene units
```

The bounds prevent accidental under-floor views while preserving free inspection of the
office from any horizontal angle.

## Render-loop policy

The animation loop runs for active rigged characters and movement. OrbitControls render on
interaction. Pausing motion suppresses character animation. Office View introduces no
backend polling loop.

The SSE list remains bounded to the latest normalized events and the visible signal list is
bounded to six relevant events.

## Historical replay

Completed Runs expose an explicit:

```text
Historical replay · timing compressed
```

Replay uses persisted AgentRun `started_at` and `completed_at` facts. It preserves factual
ordering while compressing time for observability. Characters enter through the office
entrance, traverse the corridor, reach their factual stage workstation, and show the
RUNNING presentation before terminal state.

Replay is explicitly labelled and must never be presented as live execution.

## Failure independence

Office rendering is isolated from canonical workflow execution.

If WebGL, GLB loading, animation loading, or the renderer fails:

- the operational Run remains available
- cancellation remains available
- Findings remain available
- Evidence remains available
- approvals remain available
- executor selection remains available

The Office renderer and character layer have local fallbacks instead of failing the Run page.

## Accessibility

The WebGL scene is supplemental.

Every factual AgentRun is also exposed through the normal HTML roster beneath the scene.
The roster is keyboard focusable, has role/state text, and opens the same factual AgentRun
detail as 3D raycasting.

Office View is not required for any control-plane action.

## Reference research

Implementation patterns were studied from:

- `W17ant/Claude-Office` — office presence, position targets and path-oriented movement
- `wickedapp/openclaw-office` — event-driven task/agent presentation
- `Shubhamsaboo/awesome-llm-apps` — Three.js renderer/camera integration patterns

No visual asset or product identity from those repositories is copied.

The Quaternius assets enter Agent Office through their own documented CC0 provenance rather
than being copied from those reference applications.

## Truthfulness constraints

Office View must not:

- create workers that do not correspond to AgentRuns
- fabricate progress percentages
- fabricate thinking/reasoning activity
- fabricate dialogue from animation
- infer test success without canonical Evidence/Event truth
- imply merge or deploy status
- hide blockers behind visual presentation
- use Event history as the only source of current state
- animate unknown state into success
- present Historical replay as live execution
