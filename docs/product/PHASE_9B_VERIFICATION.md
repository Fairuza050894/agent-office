# Phase 9B Verification — Planning Persistence Foundation

Status: ACCEPTED FOR PR REVIEW
Date: 2026-09-27
Branch: `phase-9b-work`
Implementation checkpoint: `f005325`
Pull request: #9
Merge policy: manual only

## Scope delivered

Phase 9B establishes durable planning truth without creating engineering
execution truth.

Delivered backend capabilities:

- SQLite schema v11
- ComposerThread persistence
- append-only ComposerMessage persistence
- TeamProposal + member persistence
- PlanningArtifact persistence
- RequirementCandidate persistence and immutable decision lifecycle
- append-only PlanningEvent persistence
- planning Event history and SSE separate from Run Event history
- requirement approve / reject / defer audit records
- provider-neutral PlanningRuntime port
- deterministic read-only ReferencePlanningRuntime
- planning API and dependency wiring
- restart-safe repository implementations

## SQLite v11

New tables:

```text
composer_threads
composer_messages
team_proposals
team_proposal_members
planning_artifacts
requirement_candidates
planning_events
```

Storage-level constraints include:

- append-only Composer messages
- append-only PlanningEvents
- unique PlanningEvent sequence per thread
- immutable RequirementCandidate decision once it leaves PROPOSED
- RequirementCandidate Project scope must match its ComposerThread
- PlanningEvent Project scope must match its ComposerThread
- terminal ComposerThread timestamp consistency
- explicit enum/status checks

Operational tables remain separate and unchanged in meaning.

## API boundary

Implemented planning resources include:

```text
POST /api/composer/threads
GET  /api/composer/threads/{thread_id}

POST /api/composer/threads/{thread_id}/messages
GET  /api/composer/threads/{thread_id}/messages

GET  /api/composer/threads/{thread_id}/team-proposals
POST /api/team-proposals/{proposal_id}/accept
POST /api/team-proposals/{proposal_id}/reject

GET  /api/composer/threads/{thread_id}/artifacts

GET  /api/composer/threads/{thread_id}/requirements
POST /api/requirements/{requirement_id}/approve
POST /api/requirements/{requirement_id}/reject
POST /api/requirements/{requirement_id}/defer

GET  /api/composer/threads/{thread_id}/events
GET  /api/composer/threads/{thread_id}/events/stream
```

Phase 9B does not expose repository-changing composer execution.

## Truthfulness proof

Acceptance tests verify that planning activity creates no:

- Run
- AgentRun
- operational Event

PlanningEvent uses a separate table and separate realtime endpoint.

Requirement decision records use existing Audit persistence with actor type USER.

## Runtime boundary

`ReferencePlanningRuntime` is deterministic, structured-output capable,
cancellable, and declares read-only operation.

It is a lifecycle fixture only.

It is not wired to production Universal Composer intelligence.

Real provider planning is deferred to Phase 9D.

## Verification

GitHub Actions run `36300850733` on `f005325`: **GREEN**

```text
repository whitespace  passed

backend pytest         646 passed
ruff                   passed
ruff format            199 files already formatted
mypy                   no issues in 133 source files

frontend vitest        14 files passed
frontend tests         67 passed
frontend typecheck     passed
frontend lint          0 errors, 2 existing startLoop warnings
frontend build         passed
```

New Phase 9B tests cover:

- v10 → v11 migration
- separate planning tables
- append-only planning message/event storage
- RequirementCandidate Project scope
- immutable requirement decision
- durable ComposerThread/messages across restart
- separate operational vs planning truth
- requirement decision audit
- TeamProposal and PlanningArtifact round trip
- planning SSE durable replay
- deterministic/read-only ReferencePlanningRuntime
- unknown Project rejection
- scalar/bounded planning-content validation

## Safety

Phase 9B preserves:

- Project Registry as repository scope authority
- no planning Workspace allocation
- no repository mutation
- no auto merge
- no force push
- no destructive main-tree Git operations
- historical Run/Event semantics
- explicit human decision for requirement approval/rejection/deferral

## Acceptance

Phase 9B domain gate: PASS

Phase 9B persistence/migration gate: PASS

Phase 9B truth-separation gate: PASS

Phase 9B CI gate: PASS

Phase 9B is accepted for PR review.

Phase 9C must begin only after PR #9 is manually merged into `main`.
