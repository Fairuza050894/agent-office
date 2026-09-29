# Phase 10C Verification — Time Context & Realistic Occupancy

Status: IMPLEMENTED / AUTOMATED RUNNER HOLD  
Date: 2026-09-29  
Branch: `phase-10c-time-context`  
Base: `main@60fd03c`  
Merge policy: manual only  
Implementation checkpoint: `2f91840`

## Surface boundary

Phase 10C Office-world work applies to **Office Workspace** at `/office`.

The separate **Run Office View** at `/runs/:runId/office` continues to project
canonical Run / AgentRun state and owns Live + Historical Replay.

The replay-facing fix recorded later in this document is a shared-renderer
regression fix for **Run Office View only**. It is not an Office Workspace
behavior.

## Delivered scope

- explicit office-world clock
- IANA timezone-aware office schedule
- active planning thread timezone takes precedence
- localized timezone badge such as WIB when supported by the runtime
- HH:MM:SS clock
- weekday/weekend detection in office timezone
- next office event
- next-event countdown
- truthful per-floor occupancy badges in the L1/L2/L3 selector
- office open/quiet state
- realistic occupancy caps enforced across all baseline Office modes
- all Office zones have semantic capacities locked to physical 3D slots
- zero ambient presence after 22:00
- zero default weekend ambient presence
- planning freshness windows
- stale planning no longer keeps people physically in the Office forever
- timezone-synchronized lighting
- second-level HUD updates without second-level presence rebuilds
- richer L1 Commons identity
- richer L2 Build identity
- richer L3 Strategy identity
- explicit building lifecycle: Closed / Opening up / Open / Winding down
- mode-driven dynamic floor props for arrival, lunch, coffee, focus, wrap-up,
  evening, and night cues
- closed-office planning rendered as remote/offsite rather than physical
  overnight presence
- QA / documentation / architecture / decision anchors aligned to their spaces
- regression tests for timezone, world HUD, occupancy, and specialist-zone layout

## Key truth behavior

At a weekday 00:44 in Asia/Jakarta:

```text
Office mode            NIGHT_QUIET
ambient occupancy cap  0
next event             Morning arrival 07:00
```

Planning truth remains durable in Composer/Dock, but a CLOSED office no longer
renders people physically in the building merely because the planning thread is
fresh. Fresh late-night planning is treated as remote/offsite by default. A stale
planning record likewise remains durable but absent from physical presence.

The same absolute timestamp may represent a different office mode in another
configured timezone. Tests cover this explicitly.

## CI infrastructure status

GitHub Actions runs created for this branch currently fail before a runner is
assigned.

Observed on runs including `36463084207`, `36463500650`, `36464155755`, and latest run `36464809996`:

```text
runner_id: 0
runner_name: ""
steps: []
all jobs finish within seconds
```

Backend, frontend, and repository jobs all exhibit the same runner-less failure,
including jobs whose source code is unchanged. This is an Actions
infrastructure/quota/runner availability failure, not a test assertion result.

Therefore Phase 10C must **not** be labelled automated-green yet.

## Test coverage added

### Office world

- configured timezone drives clock/mode
- same instant differs across office timezones
- occupancy falls from evening -> late evening -> night
- weekends default quiet
- late-night planning freshness
- core-hour planning freshness
- invalid timezone fallback

### Living Office

- explicit timezone drives occupancy, not host timezone
- night quiet returns zero ambient members
- scheduled events remain allowed through the explicit event path
- existing zone capacity and planning/ambient truth tests remain applicable
- wrap-up baseline occupancy is capped at seven
- scheduled + baseline occupancy respects the open-office cap
- every scheduled-event target zone is clamped to actual physical slot capacity
- weekday ambience fixtures use actual weekdays after weekend-awareness was introduced

### UI

- HUD exposes time
- office mode
- total presence
- next event
- floor controls remain presentation-only

### Environment

- QA bench resides in QA-lab quadrant
- documentation desk resides in documentation quadrant
- architecture anchors align with roadmap area
- decision anchors align with decision pods

## Static hardening audit

Before the rendered gate, additional source review closed these issues:

- world mode occupancy caps are now enforced across every baseline mode;
- staggered arrival uses a full-attendance cap rather than contradicting its own 08:50 behavior;
- scheduled participants reserve capacity before baseline ambience;
- every Office zone has a semantic capacity equal to its physical 3D placement slots;
- legacy weekday tests no longer use a Sunday date;
- new/threadless Projects reset to the correct ambient floor rather than inheriting Strategy;
- decision-room anchors are placed in front of decision tables instead of inside them;
- L1/L2/L3 floor buttons expose truthful live presence counts.

The original occupancy-hardening checkpoint was `d8f3f53`. Lifecycle and closed-office planning semantics landed at `9884d07`. The current implementation checkpoint is `af86c0c`, which includes rendered-review UI polish, richer per-floor support props, maximize-safe scene command-strip layout, floor-specific shell accents, and a replay-only character-facing correction that preserves verified live movement.

## Office-world lifecycle hardening

Additional review of the rendered late-night Office exposed a realism issue:
fresh planning truth could still keep people physically rendered in the building
after 22:00.

The current policy is now:

```text
CLOSED office
  -> ambient presence = 0 by default
  -> fresh planning remains durable in Composer/Dock
  -> physical planning presence = 0
  -> Strategy may show "Planning remote · office closed"
```

A future explicit overtime/scheduled-work contract may deliberately opt into
after-hours physical presence. Ordinary planning does not.

The world context now also exposes:

- lifecycle: Closed / Opening up / Open / Winding down
- occupancy explanation
- scene cue keyed to the active Office mode

The 3D environment consumes the scene cue without modifying canonical truth.
Current dynamic props include arrival/reception cues, lunch trays, coffee cups,
Build/Strategy active-work visual props, wrap-up cues, and restrained
late/night lighting accents.

## Morning rendered-review hardening

The 2026-09-29 09:20–09:21 local screenshots confirmed that the Office-world
clock, Core work hours mode, next-event countdown, per-floor presence counts,
and richer floor identities were functioning. The review also exposed a visual
quality gap in the scene header and repeated/under-filled environmental detail.

Observed issues:

- the old "Office workspace / No factual Run selected / drag..." line mixed
  product context with camera instructions;
- time, mode, presence, next event, floor controls, and floor state lacked a
  clear visual hierarchy;
- the HUD looked like independent boxes rather than one intentional command
  strip;
- floor status copy was verbose and inconsistent;
- three floors were functionally different but still shared too much visual
  emptiness / repeated vocabulary;
- the old Maximize CSS still constrained the scene heading to 28px, which would
  clip the richer HUD.

Hardening through `af5b87a` now provides:

- a three-zone scene command strip:
  - workspace context
  - Office-world status
  - floor navigation/status
- concise "Live office view · No active run selected" product copy;
- camera help moved into a compact Controls disclosure;
- normalized Time / Office mode / Presence / Next hierarchy;
- Presence copy such as "9 in office" with the ambient cap as secondary detail;
- Next event uses the event name as the primary value and time/countdown as
  secondary detail;
- concise active-floor summary such as "Build · 5 present · Ambient";
- maximize-safe command-strip sizing;
- responsive two-row / stacked behavior for narrower widths;
- Commons-specific parcel lockers and snack/hydration storage;
- Build-specific sprint board and charging/utility station;
- Strategy-specific reference library, presentation sideboard, and floor lamp;
- distinct Commons / Build / Strategy shell accent palettes while preserving one
  coherent office-building visual language;
- the existing time-driven scene cues remain separate from canonical truth.

A follow-up local screenshot is still required because GitHub Actions currently
cannot assign a runner and this pass materially changes rendered layout.

## Run Office View — Historical Replay character-facing fix

Rendered review clarified that **Run Office View Live** movement was already
correct. The backward-walking defect occurred specifically during **Run Office
View Historical Replay**. It was not a bug in the `/office` Office Workspace.

The correction is intentionally mode-scoped:

```text
live movement    -> existing verified heading unchanged
historical replay -> live heading + 180 degrees
movement finished -> existing station targetYaw restored
```

This avoids fixing Replay by breaking normal live movement.

The replay-facing adapter is applied only while `modeRef.current === 'replay'`.
Regression coverage compares live and Replay yaw across +Z, -Z, +X, and -X and
requires Replay to remain exactly 180 degrees from the verified live heading.

This remains presentation-only and does not alter Replay timing, factual events,
AgentRun state, path generation, or station assignment.

Rendered confirmation on 2026-09-29: **PASS**. The user verified that Historical
Replay now walks forward rather than backward, while live/operational movement
remains correct.

## Rendered acceptance required

After pulling the branch locally, verify:

1. around midnight Jakarta time, the HUD shows the correct WIB/local office time;
2. Office mode reads Night quiet and ambient physical population is zero unless
   an explicit scheduled/overtime event later opts into physical presence;
3. next event shows Morning arrival at 07:00;
4. L1/L2/L3 are visibly more differentiated than Phase 10B;
5. L2 contains visible QA, pairing, documentation, and ops areas;
6. L3 contains visible roadmap and decision areas;
7. lighting matches the clock timezone;
8. switching floors does not change planning truth;
9. opening a stale planning thread at night does not repopulate L3;
10. a fresh planning thread at night remains available in Composer/Dock but
    Strategy shows remote/closed-office context rather than physical people;
11. the polished command strip remains readable in normal and Maximize modes;
12. floor-specific support props do not clip paths or character anchors;
13. live/operational movement remains unchanged — **PASS**;
14. Historical Replay characters no longer walk backward — **PASS**;
15. stopped characters still restore the existing station targetYaw.

## Automated commands to run when runner/local environment is available

```bash
cd frontend
npm test -- --run
npm run typecheck
npm run lint
npm run build

cd ../backend
pytest
ruff check .
ruff format --check .
mypy src

cd ..
git diff --check
```

Do not mark this phase Ready for Review until those checks execute successfully.


## Workspace floor-navigation containment hardening

A follow-up rendered review found that the **Office Workspace** floor selector
still allowed the visible floor-name hierarchy to read as if `Commons`,
`Build`, and `Strategy` were detached from their chips. The Run Office View
was already visually correct and must not regress.

The hardening is intentionally Workspace-scoped:

- `/office` uses a dedicated `office-floor-switcher-workspace` styling boundary;
- every chip contains its floor code, floor name, and live presence count;
- the active floor no longer emits a second loose floor-name/status label;
- Reset view remains a separate aligned control;
- responsive behavior stays contained in normal and Maximize layouts;
- Run Office View keeps its existing switcher styling and canonical Run/AgentRun
  presentation unchanged.

Regression coverage now verifies that:

- the Workspace switcher is a dedicated labelled group;
- each of `L1 Commons`, `L2 Build`, and `L3 Strategy` is represented by one
  button;
- the code, name, and presence count all live inside that button;
- the operational/Run switcher does not receive the Workspace-only class.

Code checkpoint for this pass:

```text
0326f7f test: lock workspace floor chip containment
```

### Repository-state note

At the start of this continuation, GitHub reported PR #13 as already merged and
closed on 2026-09-29, even though the previous working note still described it
as Draft. No direct edit to `main` was made in this continuation. All new
hardening remains on `phase-10c-time-context` for a separate Draft review.

The latest available GitHub Actions run associated with the prior PR head still
shows frontend, backend, and repository jobs completing with no assigned steps.
That remains an infrastructure/runner condition, not an assertion failure.
