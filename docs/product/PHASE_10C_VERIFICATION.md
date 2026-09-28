# Phase 10C Verification — Time Context & Realistic Occupancy

Status: IMPLEMENTED / AUTOMATED RUNNER HOLD  
Date: 2026-09-29  
Branch: `phase-10c-time-context`  
Base: `main@60fd03c`  
Merge policy: manual only

## Delivered scope

- explicit office-world clock
- IANA timezone-aware office schedule
- active planning thread timezone takes precedence
- localized timezone badge such as WIB when supported by the runtime
- HH:MM:SS clock
- weekday/weekend detection in office timezone
- next office event
- next-event countdown
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
- QA / documentation / architecture / decision anchors aligned to their spaces
- regression tests for timezone, world HUD, occupancy, and specialist-zone layout

## Key truth behavior

At a weekday 00:44 in Asia/Jakarta:

```text
Office mode            NIGHT_QUIET
ambient occupancy cap  0
next event             Morning arrival 07:00
```

A genuinely recent planning session can still appear because it is planning
truth. A stale planning record remains in Composer but disappears from physical
presence.

The same absolute timestamp may represent a different office mode in another
configured timezone. Tests cover this explicitly.

## CI infrastructure status

GitHub Actions runs created for this branch currently fail before a runner is
assigned.

Observed on runs including `36463084207`, `36463500650`, and `36464155755`:

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

## Rendered acceptance required

After pulling the branch locally, verify:

1. around midnight Jakarta time, the HUD shows the correct WIB/local office time;
2. Office mode reads Night quiet and ambient population is zero unless a
   genuinely recent planning session or explicit scheduled event exists;
3. next event shows Morning arrival at 07:00;
4. L1/L2/L3 are visibly more differentiated than Phase 10B;
5. L2 contains visible QA, pairing, documentation, and ops areas;
6. L3 contains visible roadmap and decision areas;
7. lighting matches the clock timezone;
8. switching floors does not change planning truth;
9. opening a stale planning thread at night does not repopulate L3;
10. opening or updating a genuinely recent planning thread may show its INCLUDED
    planning roles, clearly labeled as planning truth.

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
