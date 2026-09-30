# Living SDLC / AIDLC Workday Engine

Status: Phase 10G implementation contract

## Purpose

Phase 10G makes the Workspace Office behave like a believable engineering
workplace without inventing execution.

The Office is no longer driven only by ambient schedule movement. Canonical
Task / Run / AgentRun activity may own a role's physical presence.

## Truth precedence

Workspace presence follows this precedence:

```text
WORK
  canonical Task + Run + AgentRun projection
    ↓
PLANNING
  canonical ComposerThread + TeamProposal projection
    ↓
AMBIENT
  presentation-only office schedule
```

A role may appear only once in the highest applicable truth layer.

## Canonical work assignment

A WORK presence is created only from a non-terminal AgentRun attached to a real
Run and Task.

The projection carries safe identifiers and labels:

- Task id / title
- Run id / status
- AgentRun id / status
- stage key
- role key

No Task or Run is created by the living-office projection.

## SDLC / AIDLC spatial mapping

The stage key influences the work zone:

- discovery / planning -> Strategy planning table
- architecture -> Strategy architecture wall
- design -> Strategy decision room
- implementation -> role home workstation
- testing / verification / QA -> Build QA bench
- review / security -> Build review wall
- documentation / release -> Build docs desk

Unknown stages fall back to the role's home location.

## Workday schedule

The existing OfficeWorld schedule remains the time authority.

Important truth boundary:

- a RUNNING AgentRun stays WORKING even during lunch / coffee windows;
- Agent Office must not pretend an executor paused when it did not;
- WAITING / BLOCKED / PENDING work may move into a break zone;
- provider-supplied scheduled break windows may place safely waiting work into
  quiet / prayer / social zones;
- provider prayer windows are data inputs, not hard-coded prayer times.

This is presentation-safe workday behavior, not executor suspension.

## Checkpointable WorkSession boundary

The desired future lifecycle is:

```text
RUNNING
  -> safe checkpoint requested
  -> atomic executor step completes
  -> WORK_SESSION_PAUSED
  -> break
  -> WORK_SESSION_RESUMED
  -> continue from checkpoint
```

Phase 10G does not fake those states. Backend support must first define a
checkpoint / pause / resume contract per executor.

## Office refresh

Workspace refreshes Task / Run / AgentRun work projection periodically. This
does not start, stop, retry, or mutate execution.

## Micro-life

Characters that are stationary in Workspace receive deterministic subtle
presentation motion:

- tiny body yaw / glance variation
- per-character deterministic phase
- behavior-sensitive amplitude
- no positional drift through furniture
- no motion during prayer quiet / offline

Significant ambient relocation uses a three-minute deterministic cadence.
Canonical WORK presence stays task-anchored instead of patrolling randomly.

## Collision contract

Phase 10F collision-aware Workspace routing remains authoritative:

- obstacle-aware pathing
- keep-right passing lanes
- personal-space yielding
- fail closed when no safe route exists

10G must not weaken those guarantees.

## RAG / context-used boundary

Phase 10G may show factual retrieved context only after a retrieval record exists.

Allowed future projection:

```text
Context used
  src/...
  docs/...
  ADR-...
  Issue / PR...
  prior Run / Evidence...
```

Do not expose hidden chain-of-thought.

The current repository has no canonical retrieval record that proves which
sources were supplied to an AgentRun. Therefore Phase 10G does not label
ordinary repository files as RAG context merely because they exist.

## Non-regression invariants

- no fake work
- no fake executor pause
- no automatic retry
- no auto commit / merge
- no force push
- no chain-of-thought exposure
- Live / Replay remain canonical operational scopes
- Workspace collision and facing fixes remain intact


## Local verification executor mode

The production composition keeps `ReferenceScenario.SUCCESS` as its default.
For local rendered verification only, the operator may explicitly start the
backend with:

```text
AGENT_OFFICE_REFERENCE_SCENARIO=WAITING
```

Only `SUCCESS` and `WAITING` are accepted through runtime settings. This
bounded switch exists to retain canonical non-terminal AgentRuns long enough to
inspect the Workspace workday projection. It does not expose arbitrary failure
scenarios as runtime product configuration.

The corresponding helper script uses only public HTTP APIs and requires an
already registered Project.


## Character presentation axis

Character GLBs are normalized once at the model layer. Workspace and
Operational Live therefore share the same root movement-facing calculation.
Workspace must not add a second 180-degree correction.

Historical Replay retains its separately verified presentation correction.

## Living idle presentation

Workspace idle initiative is intentionally richer than a small continuous sway.
A deterministic long-cycle pose system creates readable but professional
standing behavior: weight transfer, slow breath, and left/right environmental
looks.

The procedural pose is applied to a presentation pivot above the animated GLB.
It never mutates canonical station, path, Task, Run, or AgentRun truth.
