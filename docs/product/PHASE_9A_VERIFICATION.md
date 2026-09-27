# Phase 9A Verification — Office-First Control Room

Status: ACCEPTED FOR PR REVIEW
Date: 2026-09-27
Branch: `phase-9a-work`
Implementation checkpoint: `2acd2d3`
Pull request: #8
Merge policy: manual only

## Accepted scope

Phase 9A establishes the frontend shell required by later Phase 9 planning and
execution work.

Accepted capabilities:

- global dark control-room visual system
- `/office` as the Office-first workspace route
- backward-compatible `/runs/:runId/office`
- full-width Three.js Office scene
- compact Office-route navigation shell
- Universal Composer interaction shell
- Project / intent / Executor / Context controls
- mutation actions intentionally disabled until later Phase 9 domain support
- collapsible Bottom Operations Dock
- canonical Activity and factual AgentRun Team in the dock
- selected AgentRun inspector on demand
- maximize mode with Escape exit
- one-screen maximize layout with compact dock
- historical replay preserved
- completed AgentRun nameplates hidden by default
- active / waiting / blocked / failed AgentRun nameplates preserved
- selected AgentRun nameplate restored on selection
- closer Office camera framing
- global dark treatment for all current sidebar destinations and shared modal,
  table, form, empty-state, badge, and registry surfaces
- meeting-room chairs corrected to face the conference table

## Truthfulness boundary

Phase 9A does not add:

- Planning persistence
- RequirementCandidate records
- PlanningRuntime
- Ambient personas
- fabricated chat responses
- repository-changing Universal Composer behavior
- new canonical execution state

Existing Run / AgentRun / Event / Finding / Evidence / Workspace records remain
authoritative for operational execution.

Universal Composer `Send` and `Start Run` remain intentionally unavailable
until the later Phase 9 planning/promotion slices provide valid backend domain
support.

## Visual review

Rendered visual review accepted:

- `/office`
- `/runs`
- `/runs/:runId`
- `/runs/:runId/office`
- maximized Run Office

The final visual sweep also corrected the legacy token cascade that previously
allowed light-theme surfaces to leak into non-Office pages.

All current sidebar destinations now share the Phase 9A dark surface contract:

- Office
- Overview
- Projects
- Runs
- Tasks
- Agents
- Workflows
- Executors
- Activity
- Evidence
- Audit
- Settings

## Verification

Implementation run `36297938930` on `2acd2d3`:

```text
repository whitespace  passed

backend pytest         632 passed
ruff                   passed
ruff format            184 files already formatted
mypy                   no issues in 121 source files

frontend vitest        14 files passed
frontend tests         67 passed
frontend typecheck     passed
frontend lint          0 errors, 2 existing startLoop warnings
frontend build         passed
```

The two frontend warnings pre-date the Phase 9A visual work and remain
non-blocking.

## Safety

Phase 9A preserves:

- no auto merge
- no force push
- no destructive main-tree Git operations
- canonical operational state
- isolated Workspace/write-agent boundaries
- historical WorkflowSnapshot and AgentProfile compatibility

## Acceptance

Phase 9A functional gate: PASS

Phase 9A CI gate: PASS

Phase 9A visual gate: PASS

Phase 9A is accepted for PR review.

Phase 9B must start only after PR #8 is merged manually into `main`.
