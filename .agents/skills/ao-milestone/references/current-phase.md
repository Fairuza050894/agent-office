# Agent Office Current Milestone

## Current checkpoint

```text
main@880e544
Phase 10H-1 merged
PR #24 Vocabulary & Structure merged
PR #25 Office 3D experience polish merged
PR #27 Phase 6 Codex test hardening merged
```

Canonical full verification:

```bash
./scripts/verify.sh
```

## Current work

```text
branch: phase-11-office-diorama-v0
pr: #29
scope: Phase 11 / Office Diorama V0 — deterministic visual harness
status: IMPLEMENTED / AUTOMATED VERIFIED / RENDERED BASELINE REVIEW PENDING
```

## Why this phase exists

The Office renderer is now stable enough for directed visual work, but prior visual
iterations depended on manual screenshots and hand-tuned values without a deterministic
capture loop.

Phase 11 V0 creates the visual evidence harness before any asset-kit, lighting-model,
camera-policy, or furniture rollout work.

## Scope

- add Playwright as a measured frontend dev dependency for screenshot verification;
- add a development-only deterministic Office Diorama fixture on the existing `/office` route;
- label the fixture `Simulated` and keep it unavailable in production behavior;
- freeze time through an explicit debug query parameter;
- keep the fixture cast deterministic and presentation-only;
- add `npm run office:shots` to capture 3 floors × 4 lighting windows × 2 widths;
- write screenshots and renderer metrics to ignored `artifacts/office-shots/`;
- record draw calls, triangles, geometries, textures, and viewport metadata as the V0 baseline.

## Explicitly deferred

### Phase 11 V1 — camera and light simplification

No camera-control or lighting-architecture rewrite in V0.

### Phase 11 V2 — pilot asset kit

No new furniture/model kit and no asset-policy ADR in V0.

### Phase 10H-2 / 10H-3

Shift Ruler and truth lines remain separate phases and are not modified here.

### Obsidian knowledge cockpit

Tracked separately in Issue #28; not a runtime dependency of Agent Office.

## Safety invariants

- debug fixture is development-only and visibly labeled `Simulated`;
- no canonical Task / Run / AgentRun / Event state is fabricated;
- no backend/schema contract changes;
- no asset-policy changes;
- no fake execution/progress/dialogue;
- Office View remains supplemental to HTML operational truth;
- no auto merge;
- no force push.
