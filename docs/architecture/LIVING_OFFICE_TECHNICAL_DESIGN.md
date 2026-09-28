# Living Office — Technical Design

Status: Initial implementation design  
Depends on: merged Phase 9C planning foundation  
Primary frontend: React + TypeScript + Three.js

## 1. Architecture boundary

The Living Office is a projection layer.

It does not become a new source of operational truth.

```text
Canonical planning / execution state
        +
Office schedule / ambient policy
        ↓
Presence resolver
        ↓
OfficePresenceMember[]
        ↓
ThreeOfficeScene
        ↓
Rendered character + floor + zone
```

The renderer never decides whether work is factually happening.

## 2. Initial frontend modules

### `office3d/livingOffice.ts`

Owns:

- floor definitions
- zone taxonomy
- presence-state taxonomy
- deterministic ambient window rules
- planning-team -> presence projection
- ambient profile -> presence projection

This is presentation logic only.

### `office3d/environment.ts`

Owns:

- procedural floor geometry
- floor-specific functional zones
- deterministic station/zone anchors
- collision-safe path targets
- Run Office backwards-compatible Build-floor defaults

### `office3d/character.ts`

Owns:

- model variants
- role-specific visual appearance
- nameplates
- animation mixer
- generic character runtime source contract

It accepts both factual AgentRun-derived characters and non-operational planning/ambient presence sources.

### `components/ThreeOfficeScene.tsx`

Owns:

- Three.js engine lifecycle
- active-floor environment creation
- character runtime synchronization
- camera / controls
- click projection
- live/replay animation scheduling

### `components/OfficeScene.tsx`

Owns:

- semantic scene wrapper
- floor selector
- renderer mode/floor metadata
- forwarding floor and presence state to ThreeOfficeScene

### `pages/OfficeWorkspacePage.tsx`

Owns:

- current project/planning state
- selected floor
- local office clock refresh
- projection of TeamProposal / ComposerThread into OfficePresenceMember
- ambient fallback when no planning team is active

## 3. Floor model

Initial keys:

```text
commons  -> L1
build    -> L2
strategy -> L3
```

Run Office defaults to `build` unless a later operational mapping specifies another floor.

Workspace floor switching is presentation state and must not modify ComposerThread, Run, AgentRun, or repository state.

## 4. Presence identity

Initial runtime shape:

```ts
interface OfficePresenceMember {
  id: string
  agent_profile_key: string
  name: string
  status: OfficePresenceState
  behavior: OfficeBehaviorKey
  floor: OfficeFloorKey
  zone: OfficeZoneKey
  placementIndex: number
  truth: 'PLANNING' | 'AMBIENT'
}
```

Future factual execution projection can add `truth: 'OPERATIONAL'` once the Activity Interpreter contract is introduced.

Planning identity uses stable synthetic presentation IDs derived from durable thread + role keys. These IDs are not AgentRun IDs.

Ambient IDs are role scoped and presentation-only.

## 5. Planning projection rules

For a TeamProposal:

- INCLUDED -> may appear as planning presence
- DEFERRED -> does not appear as active project worker
- EXCLUDED -> does not appear as active project worker

Thread state mapping:

```text
ACTIVE        -> PLANNING
AWAITING_USER -> WAITING_USER
```

Initial planning floor:

```text
L3 Strategy
```

Initial zones:

- first planning roles -> planning table
- overflow -> architecture wall

## 6. Ambient schedule and behavior

The browser-local schedule remains a presentation policy, not an execution source.

Phase 10B adds explicit behavior semantics:

```text
ARRIVAL
AVAILABLE
DESK_FOCUS
PLANNING_MEETING
WAITING_DECISION
COFFEE_CHAT
LUNCH
SOCIAL_CHAT
GAME_BREAK
PRAYER_QUIET
OFFLINE
```

Behavior is derived from presence state, zone, and truth type. It cannot upgrade
`AMBIENT` into operational work.

Role-specific ambient tendencies are deterministic. Each standard role has
preferred coffee, lunch, and after-hours zones. Stable hashing ensures a reload
does not randomly assign a different personality.

To avoid synchronized "NPC scheduler" behavior:

- arrivals are staggered per role during the arrival window
- coffee participation is bounded
- lunch participation is bounded
- after-hours occupancy is bounded
- nonparticipants remain AVAILABLE at their home zone
- planning roles are excluded from ambient duplication

A future backend/configuration phase should replace browser-local schedule policy
with durable office settings while preserving this resolver contract.

## 7. Prayer schedule contract

Prayer behavior is explicitly reserved behind a provider/configuration contract.

Do not hard-code fixed daily prayer times.

Future input should contain at minimum:

```text
timezone
date
configured location or schedule source
prayer name
window start
window end
enabled flag
```

The presence resolver may only choose PRAYER_BREAK when:

- the feature is enabled
- a valid current prayer window exists
- a higher-priority factual work/safety state does not override it

The 3D representation should remain respectful and minimal.

## 8. Priority resolution target

Future unified resolver precedence:

```text
critical factual event
> active factual AgentRun work
> waiting user / planning decision
> configured scheduled event
> ambient routine
```

This prevents coffee/social ambience from visually overriding real urgent work.

## 9. Floor rendering strategy

Only the selected workspace floor is built into the active environment group.

When the selected floor changes:

1. dispose current procedural environment meshes/materials
2. build the selected floor
3. remove character runtimes that are not on the selected floor
4. instantiate/synchronize members belonging to the new floor
5. render without mutating canonical state

The current approach intentionally avoids simultaneously rendering all floors.

## 10. Zone anchoring and movement

Each `OfficeZoneKey` owns one or more deterministic `StationPlacement` anchors.

Phase 10B adds:

- explicit zone capacity
- preferred `placementIndex`
- unique slot reservation when capacity permits
- deterministic ten-minute ambient beats

When a stable ambient member receives a new zone or placement index, its
presentation ID remains unchanged. `ThreeOfficeScene` therefore keeps the same
character runtime and moves it to the new target through the existing shared
path/movement loop rather than teleporting or creating a new avatar.

For the Build floor, factual AgentRuns without an explicit zone preserve the
established role workstation mapping.

This keeps Run Office behavior compatible while allowing Living Office
presentation to move ambient members without introducing a second movement
engine.

## 11. Animation policy and rig compatibility

The current character bootstrap guarantees only:

```text
Idle
Walk
Run
```

Phase 10B is behavior-aware but does not pretend unsupported clips exist:

- movement -> Walk
- stationary behavior -> best compatible local clip
- missing behavior-specific clip -> Idle
- active planning/focus may vary idle playback rate without claiming a new action

A CC0 Quaternius Universal Animation Library candidate was audited because it
contains useful clips such as `Sitting_Idle_Loop`,
`Sitting_Talking_Loop`, `Idle_Talking_Loop`, `Interact`, and
`PickUp_Table`.

A strict build-time bone-target compatibility check rejected the candidate. The
library targets a newer `DEF-*` rig while the five current Agent Office
character binaries use a different skeleton. The experiment was fully rolled
back.

Therefore Phase 10B does **not** ship runtime skeleton retargeting, incompatible
animation assets, or furniture that implies a sitting pose the current rig
cannot truthfully render.

Future seated/typing/talking animation requires one of:

1. character assets authored for the same verified rig as the animation pack, or
2. an explicit offline retargeting pipeline with deterministic output,
   provenance, and visual regression review.

Animation remains presentation only and never becomes evidence.

## 12. Member inspection

Workspace characters are selectable.

The compact inspector exposes:

- display name
- derived behavior
- role
- floor and zone
- truth classification

Truth classification is rendered explicitly as either:

```text
Planning truth
Ambient presentation
```

Changing floor clears selection so an inspector cannot remain attached to a
member that is no longer visible.

## 13. Time-of-day lighting

Phase 10B introduces deterministic presentation profiles:

```text
morning
day
evening
night
```

Profiles control:

- scene background
- hemisphere sky/ground color and intensity
- directional key light
- directional fill light
- tone-mapping exposure

Night is intentionally dimmer than day but must remain readable. Lighting does
not alter planning or operational state.

## 14. Performance guardrails

- one active procedural floor
- shared GLB asset promise cache
- deterministic model variants per role
- no per-character uncontrolled requestAnimationFrame loop
- current shared scene loop retained
- stop scheduling frames when no movement/active animation requires them
- cap renderer pixel ratio as today

## 15. Testing

Unit tests must cover:

- floor catalog
- planning-team disposition filtering
- AWAITING_USER presence mapping
- ambient schedule windows
- after-hours reduced occupancy
- deterministic zone anchors
- existing Run Office workstation clearance

Integration tests should verify:

- floor selector appears on workspace Office
- changing floor does not create a Run
- Start Run remains governed by execution-promotion rules
- planning TeamProposal presence does not instantiate AgentRun

## 16. Incremental implementation plan

### Slice 10A — Foundation

- floor/zone model
- floor selector
- distinct L1/L2/L3 environment
- planning presence
- ambient schedule foundation
- backward-compatible Run Office

### Slice 10B — Presence UX

Implemented on `phase-10b-presence-behavior`:

- selected planning/ambient member inspector
- behavior-aware selected-floor summary
- richer role-specific ambient zone preferences
- deterministic movement between zone anchors
- staggered arrival
- bounded coffee/lunch/after-hours participation
- morning/day/evening/night lighting
- behavior-aware character runtime with safe Idle fallback
- strict incompatible-animation rejection

### Slice 10C — Schedule configuration

- durable office timezone/hours
- ambient policy settings
- prayer schedule provider contract
- user-configurable break/social ambience

### Slice 10D — Event-driven activity

- canonical PlanningEvent / AgentRun / telemetry interpreter
- IMPLEMENTING / TESTING / REVIEWING / DOCUMENTING projection
- factual movement between work zones

### Slice 10E — Visual polish

- expanded startup-office assets
- compatible/retargeted additional animation clips
- optional rooftop/breakout floor
- controlled ambience density
