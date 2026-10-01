# Agent Office Current Milestone

## Current checkpoint

```text
main@a0b3505
Phase 10H-1 merged
PR #24 Vocabulary & Structure merged
```

Canonical full verification:

```bash
./scripts/verify.sh
```

## Current work

```text
branch: polish/office-3d-experience
pr: #25
scope: post-10H-1 Office 3D experience polish
status: DRAFT / VERIFICATION PENDING
```

## Why this polish exists

The Phase 10H-1 structure is merged and accepted, but the final responsive review
recorded three non-blocking follow-ups that materially affect the product feel:

- night-scene readability is too low;
- the narrow-screen Office world HUD is vertically expensive;
- the merged milestone/docs still contain stale pre-merge status and older
  Workspace-facing wording.

This branch fixes those follow-ups without starting Phase 10H-2 early.

## Scope

- improve night lighting readability while keeping night visually dimmer than day;
- allow a closer 3D camera distance and a longer selected-agent focus linger;
- compact the mobile Office world HUD into a horizontal status rail;
- flatten the selected-member inspector to the current Office visual language;
- reconcile milestone and Office documentation with merged Phase 10H-1 truth.

## Explicitly deferred

### Phase 10H-2 — read-only Shift Ruler

Still a separate phase and PR.

### Phase 10H-3 — truth lines

Still a separate phase and PR.

### Replay ruler scrubbing

Still requires a later explicit go/no-go after the read-only ruler and truth-line
phases are verified.

## Safety invariants

- no fake execution;
- no fake stage duration or progress;
- no backend/schema changes;
- no new dependency;
- no auto merge;
- no force push;
- internal Workspace worktree semantics unchanged;
- Planning / Live / Replay truth boundaries unchanged.
