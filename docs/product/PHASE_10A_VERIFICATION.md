# Phase 10A Verification — Living 3D Agent Office Foundation

Status: ACCEPTED FOR RENDERED REVIEW  
Date: 2026-09-28  
Branch: `phase-10-living-office`  
Implementation checkpoint: `23c1bd4`  
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

GitHub Actions run `36448116375`: **GREEN**

```text
repository whitespace  passed

backend pytest         657 passed
ruff                   passed
ruff format            203 files already formatted
mypy                   no issues in 136 source files

frontend vitest        16 files passed
frontend tests         83 passed
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
- wrap-up Commons occupancy remains presentation-only
- planning-table anchors enforce role separation
- AVAILABLE ambient members do not force visible nameplates

## First rendered review — 2026-09-28

The first L1/L2/L3 and TDP planning screenshots proved the multi-floor and
planning-presence foundation, but the rendered gate remained open.

Observed issues:

- L1 Commons was structurally distinct but too empty during the wrap-up window.
- L2 Build had useful team presence but idle nameplates added unnecessary visual noise.
- L3 Strategy left too much unused central floor area.
- the TDP planning cell placed three planning roles too tightly, causing label overlap.
- the long emissive ceiling fixtures read as floating white beams.
- the camera needed a deterministic per-floor reset path after manual orbit/zoom.

Hardening applied after that review:

- added a central Commons collaboration hub
- added a central Strategy planning table / strategy hub
- moved planning anchors around the central Strategy table
- separated architecture-wall anchors
- replaced long floating ceiling bars with compact ceiling fixtures
- moved a bounded wrap-up subset into Commons so the floor stays alive
- hid AVAILABLE ambient nameplates unless selected
- reduced workspace nameplate size
- added per-floor camera presets and a Reset view control
- prevented the Strategy board from covering the central office entrance

The follow-up hardening checkpoint is `bda96f4` and its CI is green.

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


## Second rendered review — 2026-09-28

Late-evening screenshots at approximately 22:58 showed:

- L3 Strategy planning presence was materially improved and the TDP planning
  cell was readable.
- L1 Commons and L2 Build were empty while the active TDP planning thread was
  selected.
- the header incorrectly reported Planning presence on floors that contained
  no planning members.
- open-top ceiling fixtures still read as floating objects.
- the first three planning members were still positioned along the same side
  of the central table.

Root cause: the Living Office resolver treated planning presence as a full
replacement for ambient presence.

Follow-up hardening:

- planning and ambient presence now coexist
- roles already present in planning are excluded from ambient duplication
- after-hours occupancy selects up to two eligible non-planning members
- floor labels are derived from members actually visible on the selected floor
- empty floors report Quiet floor · no presence
- mixed floors report Planning + ambient
- planning-table anchors alternate around the central table
- open-top ceiling-light meshes were replaced with invisible point lights

Checkpoint `23c1bd4` passed GitHub Actions run `36448116375`:

```text
backend pytest         657 passed
ruff                   passed
ruff format            203 files already formatted
mypy                   no issues in 136 source files

frontend vitest        16 files passed
frontend tests         83 passed
frontend typecheck     passed
frontend lint          0 errors / 2 existing warnings
frontend build         passed

repository whitespace  passed
```

A final local render is still required before closing Phase 10A.
