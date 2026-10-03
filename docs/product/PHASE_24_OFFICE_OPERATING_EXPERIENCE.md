# Phase 24 — Office Operating Experience

## Status

Visual/product-experience checkpoint stacked after Phase 23 release hardening.

## Goal

Make the 3D Office feel like the primary operating surface of Agent Office rather than a generic dashboard wrapped around a renderer, while preserving the existing canonical truth model.

This checkpoint is deliberately presentation-first. It does **not** create Run, AgentRun, planning, KPI, presence, or progress facts.

## Delivered

### Mission-control command rail

The Office command rail now has a stronger product identity and visual hierarchy:

- compact Agent Office mark rendered with CSS only;
- Project context separated from mode and status;
- existing factual `statusLabel` is surfaced as a live-status line;
- registry/meta context is shown as a compact chip;
- existing actions keep their original behavior.

No status is parsed or inferred inside the command rail. It renders only the values supplied by the Office workspace.

### Operating HUD refinement

The existing truth-aware Office world HUD is restyled as a compact control-room readout rather than adding a second source of data. The four existing facts remain:

- local clock / timezone / day;
- Office mode and lifecycle;
- factual Office presence count;
- next scheduled Office event.

Lunch, coffee, night, and weekend presentation use restrained visual accents only. They do not change executor state.

### Floor and context navigation

The existing floor switcher is presented as a clearer operating control with:

- floor identity;
- active-floor treatment;
- factual presence count;
- compact responsive behavior.

The Contextual Operations Rail, Operations Dock, and Universal Composer receive the same dark control-room material language so the Office reads as one product rather than separate panels.

### Universal Composer presentation

AUTO remains the default zero-config path. The Composer receives only visual hierarchy/focus treatment in this checkpoint. Intent routing, Task/Run promotion, executor selection, and safety gates are unchanged.

## Truth and safety boundary

Phase 24 does not:

- invent busy agents;
- invent dialogue or collaboration;
- infer work from ambient animation;
- turn ambient presence into an AgentRun;
- change Run or Task state from visual interaction;
- add automatic Git push/merge;
- replace ResultReview or Decision Center gates;
- change the Planning/Live/Replay canonical renderer inputs.

The Office remains a projection over existing planning, Task, Run, AgentRun, time-aware Living Office, and user-selection facts.

## Implementation boundary

The visual pass is intentionally isolated to:

```text
frontend/src/components/office/OfficeCommandRail.tsx
frontend/src/styles/office-operating-experience.css
frontend/src/App.tsx
frontend/src/components/office/OfficeCommandRail.test.tsx
```

This avoids modifying the large `OfficeWorkspacePage.tsx` orchestration surface merely for decorative changes.

## Acceptance gates

```text
frontend unit tests
TypeScript typecheck
ESLint
production build
Office production guard
Chromium Planning / Live / Replay R3F smoke
backend full verification (stack integration)
repository whitespace verification
```

The checkpoint may merge only after a real exact-head CI run executes and passes. GitHub Actions jobs that fail before runner startup (`steps=null`) are infrastructure failures, not acceptable verification evidence.
