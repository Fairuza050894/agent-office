# Office View

Status: Phase 8 implementation specification

Office View is an optional, visually useful projection of canonical Run state. It does not own workflow state and must never become the only way to understand or operate a Run.

## Route

```text
/runs/:runId/office
```

The operational Run remains:

```text
/runs/:runId
```

## Projection model

The visual model is deliberately small:

```text
RunStage → office zone
AgentRun → one character/workstation
AgentRun.status → visual state
canonical Event → bounded signal / event reaction
Workspace → factual workspace label
Executor → factual runtime label
```

No visual character exists without an AgentRun.

## State mapping

```text
PENDING / CREATED → waiting to start
STARTING          → starting transition
RUNNING           → active station
WAITING           → waiting indicator
BLOCKED           → blocked indicator
FAILED            → failed indicator
COMPLETED         → completed / inactive
CANCELLED         → cancelled / inactive
unknown           → explicit unknown presentation
```

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

Events remain facts, not current-state authority. SSE event bursts are coalesced into one bounded durable-state refresh rather than starting one refresh or animation queue per event.

## Performance design

The Phase 8 renderer uses native DOM and CSS perspective rather than WebGL.

Consequences:

- no requestAnimationFrame render loop
- no GPU scene lifecycle
- no 3D package dependency
- no idle polling loop
- CSS motion only for factual active/starting/waiting states
- SSE event list bounded to the latest 100 normalized events
- Office signal list bounded to six relevant events
- one coalesced durable-state refresh per SSE burst
- motion can be paused by the operator
- `prefers-reduced-motion` is respected

## Failure independence

Office rendering is wrapped in a local renderer boundary. If the 3D projection throws, the page presents a fallback link to the operational Run.

The workflow, backend orchestration, Run controls, Findings, Evidence, approvals, and executor selection do not depend on Office View.

## Accessibility

Every character is a keyboard-focusable button with a text label and state. Clicking or focusing through keyboard selection exposes factual detail in normal text.

The same information is available in existing operational views. Office View is not required for any control-plane action.

## Visual assets and provenance

Phase 8 uses no third-party visual asset.

Characters, desks, monitors, floor depth, status lights, and stage zones are original DOM/CSS primitives implemented in the Agent Office repository.

There are:

- no downloaded 3D models
- no stock illustrations
- no icon pack
- no remote images
- no third-party texture
- no external runtime font

Therefore no third-party visual-asset license is required for the Office renderer itself.

## Truthfulness constraints

Office View must not:

- create placeholder workers
- show fictional typing/thinking/progress
- infer test success without Evidence/Event truth
- imply merge or deploy status
- hide blockers behind visual presentation
- use Event history as the only current-state source
- animate unknown state into success
