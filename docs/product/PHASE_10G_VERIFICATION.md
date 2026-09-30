# Phase 10G Verification — Living Workday Engine

Status: IMPLEMENTED / DRAFT REVIEW

Branch: `phase-10g-living-workday-engine`

Base: `main@c8e9c58`

## Implemented vertical slice

- canonical Task / Run / AgentRun -> Workspace WORK presence
- WORK > PLANNING > AMBIENT truth precedence
- stage-aware SDLC/AIDLC work zones
- 15-second work-projection refresh
- truth-safe lunch / coffee handling
- provider-supplied prayer / quiet break support for safely waiting work
- three-minute significant ambient relocation cadence
- deterministic subtle micro-idle motion
- Context Rail / inspector labeling for canonical work

## Automated verification

Run:

```bash
cd ~/Projects/agent-office
./scripts/verify.sh
```

Focused tests must cover:

- RUNNING AgentRun -> WORK truth
- work metadata contains Task / Run / AgentRun identifiers
- RUNNING execution does not fake lunch pause
- WAITING execution can enter lunch break
- provider prayer window only affects safely waiting work
- active work suppresses duplicate planning / ambient role
- micro motion is deterministic and bounded
- canonical WORK inspector is not labeled Ambient presentation

## Rendered review

### Active work

With a real non-terminal Run:

1. Workspace shows the active role on its mapped work floor.
2. Selecting the role shows Canonical work presence.
3. Task title, Run, stage, and AgentRun context remain factual.
4. The role remains task-anchored rather than wandering randomly.
5. Subtle idle motion is visible while stationary.

### Break truth

During a configured lunch / coffee / prayer window:

- RUNNING AgentRun remains represented as working;
- WAITING / BLOCKED work may move to the break zone;
- UI explicitly explains when a break window exists but execution remains active.

### Ambient life

With no canonical work owning a role:

- ambient relocation changes on the shorter cadence;
- characters still respect collision routing;
- movement remains forward-facing;
- micro-idle does not cause positional collision.

## Deferred by design

### Real executor pause/resume

Requires checkpointable WorkSession backend support. No visual state may claim
the executor is paused until that contract exists.

### RAG Context Used

Requires canonical retrieval provenance. Repository files alone are not proof
that they were supplied to an agent.

## Merge gate

Keep Draft until:

- canonical local verification passes;
- one real active Run is rendered in Workspace;
- work truth overrides duplicate ambient/planning presence;
- micro-idle looks subtle rather than jittery;
- collision/facing regressions are absent;
- Live and Historical Replay remain unchanged.
