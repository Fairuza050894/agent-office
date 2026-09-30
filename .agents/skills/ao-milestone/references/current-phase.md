# Agent Office Current Milestone

## Current checkpoint

```text
main@c8e9c58
Phase 10F merged
PR #20 contextual operations + spatial/collision hardening merged
```

Canonical full verification:

```bash
./scripts/verify.sh
```

GitHub-hosted jobs may still end before runner assignment with `steps: null`.
That is infrastructure evidence only.

## Current work

```text
branch: phase-10g-living-workday-engine
phase: Phase 10G — Living SDLC / AIDLC Workday Engine
status: IMPLEMENTED / DRAFT REVIEW
```

## Phase 10G truth model

```text
WORK
  Task + Run + AgentRun
    ↓ precedence
PLANNING
  ComposerThread + TeamProposal
    ↓ precedence
AMBIENT
  presentation-only office schedule
```

## Implemented now

- active AgentRun creates canonical WORK presence in Workspace;
- stage maps work to Strategy / Build functional areas;
- active work suppresses duplicate planning/ambient role projection;
- work projection refreshes every 15 seconds;
- RUNNING work never fakes lunch/coffee/prayer pause;
- WAITING/BLOCKED/PENDING work may use break zones;
- provider break windows can support prayer/quiet presence without hard-coded
  prayer times;
- ambient relocation cadence reduced from ten minutes to three minutes;
- stationary Workspace characters receive subtle deterministic micro-motion;
- Phase 10F collision/facing safeguards remain active.

## Deferred safely

### Checkpointable WorkSession

Real executor pause/resume is not implemented yet. It requires an explicit
backend checkpoint contract.

### RAG retrieval provenance

No Context Used label is emitted until retrieval provenance exists.

## Safety invariants

- no fake execution
- no fake pause
- no fake RAG
- no chain-of-thought exposure
- no auto commit / merge
- no force push
- Live / Replay truth boundaries remain intact
