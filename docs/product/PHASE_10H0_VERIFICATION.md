# Phase 10H0 Verification — Baseline Truth Hardening

## Base

```text
main@7a941d2
Phase 10G merged
```

## Scope

Phase 10H0 exists because the owner-provided /office specification requires a
green, timezone-hermetic baseline before visual restructuring.

This checkpoint does not implement Phase 10H vocabulary, layout, Shift Ruler,
truth lines, or Replay changes.

## Fixed baseline defects

### Timezone-hermetic living-office test

The evening-planning test previously used the host-local Date constructor while
production code correctly evaluates the ComposerThread timezone.

The fixture now uses explicit `+07:00` timestamps so it expresses the intended
Asia/Jakarta scenario identically under `TZ=UTC` and `TZ=Asia/Jakarta`.

No production living-office behavior changed.

### Backend health polling

The Header now:

- performs the initial health check;
- polls `/health` every 12 seconds;
- downgrades a previously healthy state when a later check fails;
- reports how many seconds ago health was checked;
- retains accessible manual Retry when disconnected.

### Partial Office registry loading

Workspace registry bootstrap now uses `Promise.allSettled`.

A failure in Projects, Executors, or Agent Profiles no longer discards the
successful registries. The UI names the failed registry and keeps successful
registries usable.

## Safety

- no backend files changed
- no schema changes
- no workflow truth changes
- no Office movement / collision changes
- no Replay changes
- no visual Phase 10H features

## Required verification

```bash
cd ~/Projects/agent-office/frontend

npm test -- --run \
  src/office3d/livingOffice.test.ts \
  src/components/Header.test.tsx \
  src/App.test.tsx

TZ=UTC npm test -- --run
TZ=Asia/Jakarta npm test -- --run

cd ~/Projects/agent-office
./scripts/verify.sh
git status --short
```

Expected:

- targeted tests pass;
- UTC frontend suite passes;
- Asia/Jakarta frontend suite passes;
- canonical repository verification passes;
- working tree remains clean.
