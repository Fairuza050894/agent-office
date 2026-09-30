# Unified Agent Office Architecture

Status: Phase 10D implementation contract
Date: 2026-09-29

## Purpose

Agent Office is one persistent product experience, not separate "Workspace" and
"Run Office" products.

The application has three truth scopes:

```text
WORKSPACE
  planning + ambient Office world

LIVE
  canonical Run / AgentRun projection

REPLAY
  historical canonical Run / AgentRun / Event projection
```

The 3D world, floors, character runtime, camera language, command rail, lift,
and Operations Dock are shared presentation infrastructure.

Only the truth source changes.

## Entry routes

Routes are deep-link entry points, not separate products:

```text
/office
  -> Agent Office · Workspace

/runs/:runId/office
  -> Agent Office · Live

/runs/:runId/office?mode=replay
  -> Agent Office · Replay
```

The selected Project and floor remain encoded in route state where applicable.

Examples:

```text
/office?project=<id>&floor=strategy
/runs/<id>/office?floor=strategy
/runs/<id>/office?floor=strategy&mode=replay
```

## Truth boundary

### Workspace

May project:

- durable ComposerThread / TeamProposal planning state
- approved/rejected/deferred planning artifacts
- clearly labelled ambient Office presence
- Office time, lifecycle, and schedule context

Must not claim repository-changing execution without canonical Run truth.

### Live

Projects only canonical operational state:

- Run
- RunStage
- AgentRun
- Event
- Workspace
- Finding / Evidence shortcuts through operational surfaces

Ambient scheduling does not create workers in this scope.

### Replay

Projects historical canonical state using factual timestamps compressed for
presentation.

Replay may alter playback timing and character presentation only. It must not
mutate Run state or fabricate Events.

## Experience continuity

Scope transitions preserve as much visual context as possible:

- selected Project
- selected floor
- common Agent Office shell
- floor vocabulary
- shared lift location
- command rail hierarchy

Workspace planning is not duplicated into Live / Replay.

Phase 10F introduces one shared contextual rail across scopes, but its content
changes with the truth source. Workspace Discussion hosts the real Universal
Composer. Live / Replay Discussion renders canonical Event activity and does
not instantiate an inert Composer or fabricate agent dialogue. Planning remains
one scope switch away through Workspace.

## Navigation hierarchy

Primary navigation is intentionally small:

```text
Office
Projects
Runs
```

Specialist registries and observability/control pages remain available under
`More tools`.

The goal is not to delete engineering capability. The goal is to make Agent
Office the primary experience while keeping advanced tools discoverable.

## Building continuity

L1 Commons, L2 Build, and L3 Strategy are floors of one building.

Every floor contains exactly one shared lift core in the same physical location.
Floor-specific detail groups make the spaces recognizably different:

### L1 Commons

- reception / arrival
- pantry / coffee
- collaboration lounge
- quiet room
- recreation
- personal / parcel lockers
- hydration / snack storage
- acoustic phone / focus pods

### L2 Build

- engineering workstation pod
- QA lab
- pairing island
- documentation nook
- review wall
- ops rack
- sprint board
- charging / utility station
- print / artifact station
- standing incident huddle point

### L3 Strategy

- planning table
- meeting room
- roadmap wall
- architecture review
- decision pods
- breakout area
- reference library
- presentation sideboard
- prototype / decision plinths

Floor detail groups are presentation-only.

## Interaction rules

- Workspace / Live / Replay are visible in one scope switcher.
- Unavailable scopes are visibly disabled.
- floor switching is presentation-only.
- selected floor survives scope changes through route state.
- project selection is reflected in Workspace route state.
- Run controls remain compact and on demand.
- Maximize keeps the 3D Office dominant.
- selected agent details remain transient.

## Truth invariant

> Presence is not execution. Animation is not evidence.

No scene prop, ambient persona, lift, camera transition, or scope navigation may
create or imply canonical engineering work.



## Phase 10F contextual-rail contract

The shared rail is presentation infrastructure, like the renderer and Operations
Dock. It is not an authority for workflow state.

```text
Workspace
  Discussion -> ComposerThread / ComposerMessage
  Details    -> Project / planning / Task / latest Run
  Files      -> PlanningArtifact records
  Logs       -> PlanningEvent

Live / Replay
  Discussion -> canonical Event projection
  Details    -> Run / AgentRun / Workspace / Finding / Evidence
  Files      -> WorkspaceChangeSummary + Evidence metadata
  Logs       -> Event + AuditRecord
```

Task creation from the rail calls the existing Task API. It does not imply
execution. Artifact content access and GitHub discovery remain gated until their
own safe backend contracts exist.
