# Agent Office Current Milestone

## Current checkpoint

```text
main@795b588
Phase 10H0 merged
PR #23 Baseline Truth Hardening merged
```

Canonical full verification:

```bash
./scripts/verify.sh
```

## Current work

```text
branch: phase-10h1-office-structure
phase: Phase 10H-1 — Vocabulary & Structure
status: IMPLEMENTED / DRAFT VERIFICATION
```

## Owner-approved override

The latest Office direction is now:

```text
docs/ux/OFFICE_SHIFT_RULER_DIRECTION.md
```

It supersedes older /office presentation wording when they conflict, while
preserving canonical workflow, Run / AgentRun, Workspace-worktree, Evidence,
Finding, and replay truth contracts.

## Phase 10H-1 scope

Implemented:

- visible scope vocabulary is Planning / Live / Replay;
- internal scope key `workspace` remains compatible;
- generic navigation grouping no longer uses Workspace as a UI category;
- scope navigation is underlined text rather than segmented boxes;
- top rail and contextual Docket are flatter and denser;
- optional Details / Files / Logs tabs render only when canonical source data exists;
- Planning Composer puts durable history/context before the input, leaving the
  input/action at the bottom of Discussion;
- permanent inline Task creation is removed;
- `+ Task` opens the existing CreateTaskModal;
- Planning Operations Dock defaults open;
- Tasks view exposes factual Task / latest Run / state relationships;
- Phase 10G canonical WORK projection is retained alongside PLANNING and AMBIENT
  truth layers.

## Explicitly deferred

### Phase 10H-2 — read-only Shift Ruler

No ruler implementation belongs in this PR.

### Phase 10H-3 — truth lines

No WORK / PLANNING / AMBIENT line styling belongs in this PR.

### Replay ruler scrubbing

Requires an explicit later go/no-go after read-only ruler verification.

## Safety invariants

- no fake execution;
- no fake RunStage duration;
- no backend/schema changes;
- no auto merge;
- no force push;
- internal Workspace worktree semantics unchanged;
- Live / Replay truth boundaries unchanged.
