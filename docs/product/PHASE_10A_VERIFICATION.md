# Phase 10A Verification — Living 3D Agent Office Foundation

Status: ACCEPTED FOR RENDERED REVIEW  
Date: 2026-09-27  
Branch: `phase-10-living-office`  
Implementation checkpoint: `55bf7dd`  
Base: merged `main@bcdd43e`  
Merge policy: manual only

## Scope delivered

Phase 10A starts the Living 3D Agent Office as a presentation layer without
changing canonical planning or operational truth.

Delivered foundation:

- multi-floor Office model
  - L1 Commons
  - L2 Build
  - L3 Strategy
- in-Office floor selector; floor changes do not navigate away from `/office`
- distinct procedural floor layouts
- typed Office zone catalog
- deterministic zone anchors
- planning TeamProposal -> Office presence projection
- only INCLUDED planning roles become project planning presence
- DEFERRED / EXCLUDED roles are not shown as active project workers
- AWAITING_USER -> Waiting for you presence state
- ambient office presence when no planning team is active
- reduced after-hours occupancy instead of fabricated work
- deterministic arrival / focus / lunch / coffee / wrap-up / after-hours windows
- provider-ready scheduled ambience contract
- PRAYER_BREAK presentation state without hard-coded prayer times
- scheduled events support priority, optional role targeting, and bounded participant count
- generic character runtime can render both AgentRun-derived and presentation-only
  planning/ambient members
- floor/presence truth label in the Office scene header
- existing Run Office defaults remain compatible with the Build floor

## Truth boundary

Living Office is a projection.

It does not create or modify:

```text
Task
Run
AgentRun
Workspace
Event
Finding
Evidence
```

Planning presence is derived from:

```text
ComposerThread
TeamProposal
AgentProfile
```

Ambient presence is presentation-only and marked internally as `AMBIENT`.

Rules:

- animation is never evidence
- presence is not execution
- ambient activity must not claim repository-changing work
- factual work must later come from canonical execution truth / safe telemetry

## Scheduled ambience contract

Phase 10A does not hard-code prayer times.

The schedule resolver accepts externally supplied timestamped events such as:

```text
label
startsAt
endsAt
floor
zone
presence
priority
optional maxParticipants
optional roleKeys
```

A future office-settings / prayer-schedule provider can supply those events
without changing the Three.js renderer or presence state machine.

Scheduled ambience is selective. It may move a bounded subset of eligible
members while remaining members continue to follow the baseline office rhythm.

## Verification

GitHub Actions run `36332181958`: **GREEN**

```text
repository whitespace  passed

backend pytest         657 passed
ruff                   passed
ruff format            203 files already formatted
mypy                   no issues in 136 source files

frontend vitest        16 files passed
frontend tests         80 passed
frontend typecheck     passed
frontend lint          0 errors / 2 existing ThreeOfficeScene warnings
frontend build         passed
```

The two frontend warnings are the pre-existing `startLoop` exhaustive-deps
warnings and are not introduced by Phase 10A.

## Automated acceptance

PASS:

- three floor definitions
- floor selector rendered in workspace Office
- floor switching is presentation-only
- deterministic zone anchors
- INCLUDED planning-role filtering
- AWAITING_USER presence mapping
- deterministic ambient time windows
- reduced after-hours occupancy
- provider-supplied scheduled ambience
- selective scheduled-event participation
- no backend regression
- no Run Office regression in the existing suite

## Rendered acceptance still required

Before Phase 10A closes, verify locally:

1. L1 Commons, L2 Build, and L3 Strategy are visually distinct.
2. Floor switching remains smooth with the collapsed application sidebar.
3. At the current after-hours window, ambient characters appear on L1 without
   looking like active execution.
4. Reopen a TDP planning thread and confirm the Office moves/focuses to L3 with
   INCLUDED planning roles visible.
5. An AWAITING_USER thread visibly labels those planning members as waiting.
6. Composer and Operations Dock remain usable with the new scene.
7. No visual overlap or obviously invalid station placement is present.

## Design records

```text
docs/product/LIVING_3D_AGENT_OFFICE_PRD.md
docs/architecture/LIVING_OFFICE_TECHNICAL_DESIGN.md
```

## Deferred slices

Not part of 10A:

- persistent office settings/timezone
- real prayer schedule provider
- seated/typing/meeting/coffee/game animation clips
- operational Activity Interpreter for IMPLEMENTING / TESTING / REVIEWING / DOCUMENTING
- selected ambient/planning member inspector
- role memory
- rooftop floor
- full lighting-by-time-of-day system

Those must be implemented in reviewable slices rather than simulated with
unverified state.
