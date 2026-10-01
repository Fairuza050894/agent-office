# Agent Office Current Milestone

## Current checkpoint

```text
main@7a941d2
Phase 10G merged
PR #21 Living SDLC / AIDLC Workday Engine merged
```

Canonical full verification:

```bash
./scripts/verify.sh
```

GitHub-hosted jobs may still end before runner assignment with `steps: null`.
That is infrastructure evidence only.

## Current work

```text
branch: phase-10h-office-control-plane-simplification
phase: Phase 10H-A — Office Control Plane Simplification
status: IMPLEMENTED / DRAFT VISUAL REVIEW
```

## Phase 10H-A visual direction

- keep the living Three.js Office as the primary product surface;
- reduce card density and repeated chrome;
- compact Office-world status into one inline strip;
- keep floor switching visible but quieter;
- narrow and flatten the contextual rail;
- move workday comprehension to a bottom Shift ruler;
- default the legacy Operations Dock collapsed in Workspace.

## Shift ruler truth model

The first Shift ruler visualizes only facts that already exist:

```text
Task
  -> latest Run
      -> factual Run started/completed/current window
      -> current AgentRun stage/status
```

Current stage/status is a present-state label only. It is not backfilled as
fabricated historical stage duration.

## Still deferred

### Historical stage timing

Stage-by-stage bars require factual `RunStage.started_at/completed_at` loading.

### Checkpointable WorkSession

Real executor pause/resume still requires an explicit backend checkpoint
contract.

### RAG retrieval provenance

No Context Used label is emitted until retrieval provenance exists.

## Safety invariants

- no fake execution
- no fake stage history
- no fake pause
- no fake RAG
- no chain-of-thought exposure
- no auto commit / merge
- no force push
- Live / Replay truth boundaries remain intact
