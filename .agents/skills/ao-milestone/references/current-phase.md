# Agent Office Current Milestone

## Current checkpoint

```text
main@aaea623
Phase 10E merged
PR #18 frontend verification recovery merged
PR #19 repository verification hardening merged
```

Canonical full verification entry point:

```bash
./scripts/verify.sh
```

GitHub-hosted jobs may currently end before runner assignment with
`steps: null`. That condition is infrastructure evidence only; it is neither a
green test result nor a code assertion failure.

## Current work

```text
branch: phase-10f-contextual-operations
phase: Phase 10F — Contextual Operations
status: IMPLEMENTED / DRAFT REVIEW
```

## Phase status

- Phase 0–8 CLOSED
- Phase 9 vNext
  - Phase 9A CLOSED
  - Phase 9B CLOSED
  - Phase 9C CLOSED / MERGED
  - Phase 9D role-scoped memory remains future work
  - Phase 9E planning-to-execution promotion remains future work
  - Phase 9F factual Activity Interpreter remains future work
- Phase 10 Living 3D Agent Office
  - Phase 10A CLOSED / MERGED
  - Phase 10B CLOSED / MERGED
  - Phase 10C CLOSED / MERGED
  - Phase 10D CLOSED / MERGED
  - Phase 10E CLOSED / MERGED
  - Phase 10F IMPLEMENTED / DRAFT REVIEW

## One Agent Office model

```text
WORKSPACE
  planning + ambient Office world
  Discussion -> Universal Composer

LIVE
  canonical Run / AgentRun projection
  Discussion -> canonical Events

REPLAY
  historical canonical Run / AgentRun / Event projection
  Discussion -> historical canonical Events
```

The building, floors, renderer, character runtime, camera language, contextual
operations rail, and Operations Dock are shared presentation infrastructure.

Truth sources remain separated.

## Phase 10F scope

### Contextual rail

```text
Discussion | Details | Files | Logs
```

The rail is collapsible and Office-local. It supersedes the older inspector and
standalone Workspace Composer placement.

### Task workflow

The rail can create canonical Task records manually or from approved
RequirementCandidates.

Task creation does not imply Run creation or execution.

### Files boundary

Current Files surfaces use:

- PlanningArtifact metadata in Workspace
- WorkspaceChangeSummary in Run scope
- Evidence metadata in Run scope

No generic filesystem preview/download is implemented.

### GitHub boundary

GitHub discovery/import is intentionally deferred because the current Project
registry requires a validated local repository path and there is no provider
auth/discovery/clone contract yet.

## Safety invariants

- no auto commit
- no auto merge
- no force push
- no fake execution
- no fake dialogue
- no fake files
- no arbitrary filesystem reads
- no direct main working-tree mutation
- Live/Replay movement behavior remains untouched
- historical replay forward-facing fix remains required

## Verification gate

Before merge:

1. `./scripts/verify.sh`
2. render `/office`
3. render one Live Run Office
4. render Historical Replay
5. verify normal + Maximize
6. verify contextual rail collapse/reopen and all four tabs
7. verify canonical Task appears in Operations Dock
8. verify movement/replay direction remains correct
