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

## Current work

```text
branch: phase-10h0-timezone-baseline-hardening
phase: Phase 10H0 — Baseline Truth Hardening
status: IMPLEMENTED / DRAFT VERIFICATION
```

## Why Phase 10H0 exists

The owner-provided /office Shift Ruler specification requires the frontend
baseline to be timezone-hermetic and requires backend health / registry
degradation to remain truthful before structural UI work begins.

## Implemented

- explicit timezone fixture for the evening living-office planning test;
- Header /health polling every 12 seconds;
- health check age in the Header;
- later failed health check downgrades previous connected state;
- Office registry bootstrap uses Promise.allSettled;
- successful registries remain usable if one registry fails;
- degraded registry copy identifies the failed source;
- regression coverage for health polling and partial registry failure.

## Deferred to later, separate PRs

### Phase 10H-1 — vocabulary and structure

No vocabulary/layout changes belong in this baseline PR.

### Phase 10H-2 — read-only Shift Ruler

No Shift Ruler belongs in this baseline PR.

### Phase 10H-3 — truth lines

No truth-line styling belongs in this baseline PR.

## Safety invariants

- no fake execution
- no fake stage history
- no backend/schema changes
- no auto merge
- no force push
- Live / Replay truth boundaries unchanged
