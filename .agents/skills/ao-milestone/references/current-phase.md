# Agent Office Current Milestone

## Current checkpoint

```text
db34358 Merge pull request #6 from Fairuza050894/phase-9-concept
30f2686 Merge pull request #5 from Fairuza050894/phase-8-work
fe44213 docs: record phase 8 visual checkpoint
131c0d8 fix: tighten office aisle clearance
```

Current recorded status:

- Phase 0 CLOSED
- Phase 1 CLOSED
- Phase 2 CLOSED
- Phase 3 CLOSED
- Phase 4 CLOSED
  - Phase 4A CLOSED
  - Phase 4B CLOSED
  - Phase 4C-1 CLOSED
  - Phase 4C-2 CLOSED
  - Phase 4C-3 CLOSED
- Phase 5 CLOSED
  - Phase 5A CLOSED — Operational Visibility Core
  - Phase 5B CLOSED — Operational Frontend Completion
- Phase 6 CLOSED — first real executor accepted through authenticated live smoke
- Phase 7 CLOSED — Multi-Executor / Second Project Dogfood accepted
- Phase 8 CLOSED — truthful 3D Office View merged through PR #5
- Phase 9 IN PROGRESS — Agent Office vNext
  - concept merged through PR #6
  - technical roadmap merged through PR #7
  - Universal Composer + Dynamic Team Formation accepted as product direction
  - current working branch: `phase-9a-work`
  - current implementation slice: Phase 9A — Dark Control-Room Shell + Office Workspace

## Phase 8 closure

Phase 8 closure record:

```text
docs/product/PHASE_8_VERIFICATION.md
```

Accepted implementation baseline:

```text
131c0d8 fix: tighten office aisle clearance
```

Final merged PR head:

```text
fe44213 docs: record phase 8 visual checkpoint
```

PR #5 was merged as `30f2686`.

Phase 8 preserved canonical Run / AgentRun / Event truth while adding the
optional Three.js Office projection, deterministic role presentation,
Historical replay, furniture-safe navigation, and startup-office zones.

## Phase 9 boundary

The merged vNext concept is defined by:

```text
docs/product/AGENT_OFFICE_VNEXT_CONCEPT.md
docs/product/UNIVERSAL_COMPOSER_AND_TEAM_FORMATION.md
```

The technical delivery plan is:

```text
docs/product/PHASE_9_TECHNICAL_ROADMAP.md
docs/architecture/ADR-0002-planning-operational-boundary.md
```

Phase 9 does not alter the following accepted contracts:

- Project Registry scopes repository access
- operational Run state remains authoritative
- planning truth is separate from Run Event truth
- Ambient Office state is non-canonical presentation state
- human approval is required before proposed requirements become executable scope
- write agents use isolated Workspaces/worktrees
- no auto commit unless explicitly enabled by a later accepted milestone
- no auto merge
- no force push
- no destructive main-tree Git operation
- legacy WorkflowSnapshots and AgentProfile keys retain historical meaning

## Current target

```text
Phase 9A — Dark Control-Room Shell + Office Workspace
```

Phase 9A is frontend-first and does not introduce planning persistence, schema
migration, RequirementCandidate records, or a new planning runtime.

Current acceptance target:

- dark control-room shell across existing application surfaces
- new `/office` workspace route
- full-width Office scene for Run-scoped views
- collapsible Bottom Operations Dock
- Universal Composer shell with execution disabled
- selected AgentRun inspector on demand
- maximize / Escape behavior
- historical Run Office compatibility

Do not begin Phase 9B until the Phase 9A visual/interaction gate is accepted.
