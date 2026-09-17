# Agent Office Phase 3 Verification

Status: Accepted
Phase: Phase 3 — Workflow + ReferenceExecutor + Events
Verification date: 2026-09-17
Checkpoint: `d32a4a6 feat: close workflow lifecycle orchestration`

## Scope

Phase 3 proves workflow orchestration using `ReferenceExecutor`, the deterministic
local executor, without any real AI provider.

```text
WorkflowDefinition
      ↓
WorkflowSnapshot
      ↓
Run
      ↓
RunStageState
      ↓
AgentRun
      ↓
ReferenceExecutor
      ↓
normalized durable Event
```

Specifically, Phase 3 delivers:

- versioned, validated `WorkflowDefinition`s and immutable `WorkflowSnapshot`s
- durable Run / stage / AgentRun lifecycle with fan-out, fan-in, conditional skip
- capability-gated Executor resolution and frozen `AgentProfile` assignment
- conservative retry that never repeats an unproven outcome
- review-blocker orchestration with a bounded remediation loop
- verification-stage orchestration
- centralized completion gates
- truthful cancellation, including UNKNOWN / UNSUPPORTED handling
- restart recovery discovery and explicit bounded reconciliation
- duplicate- and late-event safety, SSE replay, provider-neutral event taxonomy
- append-only `AuditRecord` for manual control-plane interventions

Phase 3 does **not** claim real repository mutation, real command/test execution,
durable Findings, Evidence, safe writable worktrees, or a real AI executor. See
## Phase Boundary below.

## Checkpoint

```text
HEAD  d32a4a65bba936ee016b11fb028fc9d44ec58eec
```

The worktree was clean before verification (`git status --short` empty, including
`frontend/`). No tracked file was modified destructively and no runtime artifact
is tracked.

## Architecture

The control plane is a local-first modular monolith. One orchestration service
owns eligibility, dependency resolution, fan-out, fan-in, stage and Run state,
cancellation coordination, recovery, and completion gates. It never calls a
provider API directly: every execution goes through the Executor port, which
keeps the core provider-neutral.

Phase 3C adds two seams to that design:

```text
AuditService       append-only record of manual control-plane interventions
RecoveryService    read-only discovery of non-terminal Runs after restart
```

Neither seam can execute anything, and neither can mutate workflow truth.

### Lifecycle ownership

```text
WorkflowDefinition   versioned, validated, never mutated once used
WorkflowSnapshot     frozen at Run start; the Run's structural authority
Run                  authoritative execution state for one attempt
RunStageState        per-stage runtime state and reason codes
AgentRun             one execution of one AgentProfile through one Executor
Event                append-only normalized operational history
AuditRecord          append-only record of an operator intervention
```

### Operational control surface

```text
POST /api/runs/{id}/start        plan and advance a Run
POST /api/runs/{id}/cancel       request cancellation; never assumes it happened
POST /api/runs/{id}/resume       re-validate a BLOCKED Run, then continue
POST /api/runs/{id}/reconcile    record only what the Executor can prove
GET  /api/runs/{id}/completion-gates
GET  /api/runs/{id}/snapshot     the frozen WorkflowSnapshot
GET  /api/runs/{id}/stages
GET  /api/runs/{id}/agents
GET  /api/runs/{id}/events       durable history, cursor-paginated
GET  /api/runs/{id}/events/stream  SSE delivery over the same durable history
GET  /api/runs/{id}/audit        append-only audit history
GET  /api/recovery/runs          recovery discovery
```

`cancel`, `resume` and `reconcile` are the three manual interventions Phase 3
supports, plus explicit executor selection during resume. Each successful
intervention writes exactly one `AuditRecord` per action performed.

## Schema

The database moved from schema version 5 to **6**.

```text
v5 → v6   additive only
          CREATE TABLE audit_records
          CREATE INDEX audit_records_run_idx
          CREATE TRIGGER audit_records_append_only_update
          CREATE TRIGGER audit_records_append_only_delete
```

Committed migrations v1–v5 were **not** modified. Version 6 adds new objects
only: no table, column, row, or index created by an earlier migration is altered.
Every Phase 2 and Phase 3A/3B row remains valid and readable, which is asserted
directly by `test_persistence/test_phase3c_migration.py`.

Append-only is enforced by the storage layer, not by convention: the `UPDATE` and
`DELETE` triggers abort, so durable audit history cannot be rewritten even by a
direct SQL caller. A newer-than-current schema is rejected rather than
downgraded.

## Automated Gates

Executed from `backend/` using the existing virtual environment:

```text
.venv/bin/python -m pytest -q
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src
```

Actual results:

```text
pytest              474 passed, 2 warnings in 119.84s
ruff check          All checks passed!
ruff format --check 141 files already formatted
mypy src            Success: no issues found in 91 source files
```

474 tests collected. Warnings are the same two external dependency deprecations
documented in `PHASE_1_VERIFICATION.md` and `PHASE_2_VERIFICATION.md`:

- `StarletteDeprecationWarning` from `fastapi/testclient.py`
- `DeprecationWarning` for the `anyio.abc.BlockingPortal` alias

Neither originates in Agent Office code, and no code was altered to suppress them.

## Workflow Acceptance

Recorded from `backend/tests/test_phase3_acceptance.py`, which drives real
application services over the real HTTP API against a real SQLite database and
real temporary Git repositories.

### Fan-out

`enterprise-engineering` DISCOVERY declares two required read-only assignments.
Both execute as **separate AgentRuns** with distinct identities:

```text
DISCOVERY  architect  attempt 1  COMPLETED
DISCOVERY  explorer   attempt 1  COMPLETED
```

Concurrency is additionally proven by `test_phase3_readonly_concurrency.py`,
which observes overlapping in-flight starts.

### Fan-in

No implementation assignment was created or started before every discovery
assignment completed. This is proved from the durable event order, not from
timing:

```text
max(index of discovery agent.completed) < min(index of implementation agent.created)
```

### Conditional / skip

A stage whose declared condition evaluates `FALSE` becomes `SKIPPED` with a
durable `CONDITION_FALSE` reason, a null `started_at`, and a set `completed_at`.
Remediation that a clear review made unnecessary is `SKIPPED` with the
`NOT_APPLICABLE` reason under the same timestamp rules. An unevaluable condition
for a required decision blocks the Run rather than being guessed.

### Blocker

A reviewer that reports a blocker is **COMPLETED**, `result_outcome = SUCCESS`,
`reason_code = null`, carrying a bounded orchestration-level
`review_verdict = BLOCKER`. The reviewer did not fail operationally.

### Remediation

`REMEDIATION_SUCCESS` produces:

```text
REVIEW        cycle 0  COMPLETED  verdict BLOCKER
REMEDIATION   cycle 1  COMPLETED
REVIEW        cycle 1  COMPLETED  verdict CLEAR
VERIFICATION            COMPLETED
Run                     COMPLETED
```

The loop is bounded at 3 cycles. `REVIEW_BLOCKER` produces cycles 1, 2, 3 and
**no cycle 4**: `remediation_cycles_used == 3`, `remediation.cycle.exhausted`
emitted exactly once, REVIEW and REMEDIATION `BLOCKED`, Run `BLOCKED` with
`REMEDIATION_BOUND_EXCEEDED`. A bound-exceeded Run is not re-driven by
reconciliation and `resume` refuses it with HTTP 409.

### Verification orchestration

The VERIFICATION stage runs one required read-only `verifier` assignment. Success
permits completion; failure fails the stage and the Run with
`VERIFICATION_FAILED` and leaves DOCUMENTATION `PENDING`. Verification means only
that the deterministic assignment completed — see Phase Boundary.

### Retry

`RETRYABLE_START_FAILURE` produces attempt 1 `FAILED` (`EXECUTOR_START_FAILED`,
`failure_retryable = true`) and a **new** attempt 2 `COMPLETED` whose
`retry_of_agent_run_id` references attempt 1. Attempt 1 remains independently
readable. Retries are recorded with `agent.created` plus
`reason_code = RETRYABLE_OPERATIONAL_FAILURE`, so the history is explicit without
inventing an event type. A mid-execution failure creates no second attempt,
because side effects may already exist.

### Failure

`RUN_FAILURE` fails the required assignment, the stage, and the Run
(`REQUIRED_STAGE_FAILED`). Downstream stages stay `PENDING`, no verification
event is emitted, and completion gates report incomplete. `VERIFICATION_FAILURE`
fails the Run with `VERIFICATION_FAILED`.

### Completion

`GET /api/runs/{id}/completion-gates` is the single completion authority. A
happy-path Run reports:

```json
{"status": "COMPLETED", "complete": true, "failures": []}
```

An AgentRun `COMPLETED`, a finished stage, or an executor self-report can never
bypass the gates. Gate failure blocks the Run with
`COMPLETION_GATE_UNSATISFIED` plus the failing codes.

### Immutability

The `WorkflowSnapshot` returned after a Run completes is byte-identical to the
snapshot taken at plan time, and its identity matches `workflow_snapshot_id` on
the Run. Editing a definition produces a new version and cannot alter an
existing Run.

## Cancellation

Actions confirmed by `test_phase3b_cancellation_lifecycle.py`,
`test_phase3_acceptance.py`, and the live smoke:

| Situation | Cancel called | AgentRun | Run |
|---|---|---|---|
| Confirmed | yes | `CANCELLED` | `CANCELLED` |
| Requested, unconfirmed | yes | `WAITING` `CANCELLATION_REQUESTED_UNCONFIRMED` | not `CANCELLED` |
| Unknowable outcome | yes | last-known status preserved | `BLOCKED` `CANCELLATION_UNKNOWN` |
| Capability `UNSUPPORTED` | **no** | last-known status preserved | `BLOCKED` `CANCELLATION_UNSUPPORTED` |
| Capability `UNKNOWN` | **no** | last-known status preserved | `BLOCKED` `CANCELLATION_UNSUPPORTED` |
| Executor unregistered | **no** | last-known status preserved | `BLOCKED` `CANCELLATION_UNKNOWN` |
| No session ever acquired | n/a | `CANCELLED` | `CANCELLED` |
| Terminal Run | no | unchanged | unchanged |

An inability to cancel is never proof that execution stopped, so a started
assignment keeps its last authoritative status and its executor session
reference, and the `RUNNING → BLOCKED` transition is never taken on that basis.
Repeated requests are idempotent: no second cancel call, no new event, and a
byte-identical response. Once reconciliation proves the truth the AgentRun
follows it, and a subsequent cancel request is then honoured because nothing
external remains unproven.

## Restart / Recovery

Verified with a real database close and reopen, plus a real process restart.

**Recovery discovery** (`GET /api/recovery/runs`) is a pure read. It queries
durable non-terminal Runs and classifies each one:

```text
RECONCILIATION_REQUIRED   a started assignment whose external state is unproven
RESUMABLE_BLOCK           blocked by a reason an explicit resume can clear
BLOCKED_POLICY            blocked by policy; resume refuses it
WAITING                   a required assignment is waiting on its executor
NO_ACTION                 non-terminal, nothing required
```

Confirmed properties:

- discovery performs **zero** adapter start or cancel calls
- discovery does not mutate Run, AgentRun, stage, event, or audit state
- repeated discovery is byte-identical
- candidates carry run/project identity, status, reason code, unresolved count and
  the reconciliation flag — and no path, session reference, or workspace detail

**Reconciliation** stays explicit (`POST /api/runs/{id}/reconcile`). Phase 3
deliberately performs no external I/O merely because FastAPI started: process
startup is not evidence that investigating external sessions is side-effect-free.

Confirmed properties:

- reconciliation records only what the Executor proves
- it never starts new external work and never recreates an AgentRun
- it is idempotent, including across restart
- unprovable state blocks the Run (`UNKNOWN_EXECUTION_STATE`) rather than being
  resumed blindly
- no duplicate AgentRun is created, and the AgentRun set is byte-identical

Live evidence: backend stopped (exit 143), port 8001 confirmed released, backend
restarted against the **same** SQLite file. All 18 restart assertions passed —
both Projects, the completed Run and its 8 AgentRuns, the skipped-remediation
reason, the verification stage, satisfied gates, the full event history, and the
audit history all survived; the blocked Run remained discoverable and
reconciliation created no AgentRun.

## Event Contract

`test_phase3c_event_contract.py` mirrors the documented taxonomy as a closed
allowlist and asserts the implemented `EventType` enum matches it exactly, so an
undocumented event cannot be emitted. The contract is not parsed at runtime.

Audit result: **no invented event types, no provider-specific names, no
evidence-domain events.**

```text
run.*           §20   13 events, exactly the documented set
workflow.*      §24   workflow.snapshot.created
stage.*         §25   ready, started, waiting, completed, blocked, failed,
                      skipped, cancelled
agent.*         §28   created, start.requested, started, blocked,
                      cancel.requested, cancelled
                §32   activity         (optional factual telemetry)
                §33   waiting
                §34   completed
                §35   failed
executor.*      §36   executor.session.reconciled
remediation.*   §50   started, completed, failed, cycle.exhausted
verification.*  §51   started, failed, completed
```

The domains Phase 3 owns are exactly:

```text
run, workflow, stage, agent, executor, remediation, verification
```

`run.reconciled` does **not** exist and is not emitted: the contract lists
reconciliation only as `executor.session.reconciled` (§36), which Phase 3 emits
per reconciled executor session with Project/Run/AgentRun ownership and a safe
payload. Resulting Run state changes emit their own canonical `run.*` event.

### Duplicate events

Applying the same executor event twice (same executor identity, session
reference, and external event id) yields one durable record and one logical
effect:

```text
first  → persisted true,  duplicate false, state_changed true
second → persisted false, duplicate true,  state_changed false
```

No duplicate AgentRun is created, no stage state is duplicated, and
`agent.completed` appears exactly once. `test_phase3b_lifecycle_events.py`
additionally asserts that repeated reconciliation appends no state-change event
at all: a transition that does not happen emits nothing.

### Late events

`agent.completed` followed by a late `agent.activity` leaves the AgentRun
`COMPLETED` and the Run `COMPLETED`. The late event is reported as ignored for
state purposes and never regresses terminal state.

### SSE reconnect

The SSE `id` is the durable Event id, in durable order:
`[frame ids] == [event ids]` exactly. Sending an emitted id back as
`Last-Event-ID` replays only later durable events. REST remains authoritative
after a reconnect: the canonical Run state and the durable event list are
unchanged by streaming.

### Ordering

Network arrival order is never treated as causal truth. Event identity,
`occurred_at`, `recorded_at`, and current-state guards decide application, and a
provider event can never move a Run or AgentRun backwards out of a terminal
state.

## Audit

`AuditRecord` implements the `DOMAIN_MODEL` §36 shape:
`id, project_id?, run_id?, actor_type, actor_id?, action, target_type, target_id?,
occurred_at, safe_metadata`.

Phase 3 records four actions for the interventions it supports:

```text
RUN_CANCELLATION_REQUESTED     POST /api/runs/{id}/cancel
RUN_RESUME_REQUESTED           POST /api/runs/{id}/resume
RUN_RECONCILIATION_REQUESTED   POST /api/runs/{id}/reconcile
RUN_EXECUTOR_SELECTED          resume that changes the resolved Executor
```

Chosen semantics, documented in `AuditService`: **one record per successful
control-plane action performed.** A repeated idempotent request is a distinct
operator action and produces its own record, because the audit trail answers
"what did an operator do", not "how many times did state change". A resume that
also selects a different Executor performs two actions and records both. A
rejected request (for example HTTP 409) records nothing, because no intervention
was applied.

`actor_type` is `USER` for every Phase 3 record: these all originate from an
operator-initiated control-plane request. `actor_id` stays unset, because Agent
Office does not authenticate operators locally and must not fabricate a human
identity. `AGENT` and `EXECUTOR` remain canonical for later phases.

Verified properties:

- one record per intervention for cancel, resume, and reconcile
- exactly two records when resume also changes the Executor, and none when the
  selected Executor is already the resolved one
- `project_id` and `run_id` match the owning Project and Run on every record
- history is scoped to one Run: neither a sibling Run in the same Project nor a
  Run in another Project sees it
- a rejected intervention is not audited
- `GET /api/runs/{id}/audit` returns 404 for an unknown Run
- no public route accepts an audit record: `POST` to the audit route is 405, and
  `POST /api/audit` is 404
- the storage layer rejects both `UPDATE` and `DELETE` with `append-only`
- the foreign key rejects an audit record referencing a Run that does not exist
- secret-bearing metadata keys are rejected by the domain before persistence
- a filesystem path cannot be used as a target id
- records survive a real database reopen and a real process restart
- audit actions are never Event types, and audit history is never written as an
  operational Event

## Live HTTP Smoke

Executed against a real `uvicorn` server on `127.0.0.1:8001` built from the
unmodified production composition (`create_app()` with the default
`ReferenceExecutor` registry — no test double installed), with a temporary data
root, a temporary SQLite database, and two disposable real Git repositories
(`repo-alpha`, `repo-beta`, each `git init -b main` with one commit).

**Phase A: 69 assertions, 0 failures.**

```text
health, project registration for two Projects
Task/Run creation with correct Project/Task ownership
per-project task lists scoped (A sees only A, B sees only B)
workflow list and validation
happy path → Run COMPLETED, frozen snapshot retained, 6 stages
remediation validly SKIPPED with a durable reason
verification COMPLETED, completion gates satisfied
8 AgentRuns, distinct ids, discovery fanned out to architect + explorer
event history populated; no evidence-domain event; no run.reconciled
SSE reachable, ids == durable event ids, Last-Event-ID replays only later events
blocked Run discovered as a recovery candidate with correct classification
explicit reconcile accepted and created no AgentRun
audit history present, reconciliation request audited, audit ≠ events
recovery discovery and all DTOs leak no path or session reference
Project B completed independently without affecting Project A
```

**Phase B: 18 assertions, 0 failures.** Real process restart against the same
database, as recorded under Restart / Recovery.

No repository path, canonical path, git common dir, dedupe key, or opaque
session id appeared in any DTO, including the recovery and audit surfaces.

Frontend is not part of Phase 3. No browser-level verification was performed and
none is claimed.

## Phase Boundary

Per `docs/architecture/ADR-0001-phase3-orchestration-evidence-boundary.md`:

```text
Phase 3   ReferenceExecutor proves orchestration truth
Phase 4   Workspace + Review + Finding + real command/test + Evidence
          prove engineering-change truth
Phase 5   Operational frontend exposes those backend capabilities
Phase 6   first real executor uses the same contracts
```

Phase 3 does **NOT** claim:

- real repository mutation
- real command or test execution, or any exit status
- durable Finding lifecycle (`OPEN` / `ACKNOWLEDGED` / `REMEDIATING` /
  `RESOLVED` / `ACCEPTED_RISK`)
- Evidence
- safe writable worktrees
- a real AI executor

Those remain later-phase work. Phase 3 emits no `review.finding.*`, `evidence.*`,
`test.*`, `command.*`, `workspace.*`, or `git.*` event, persists no Finding or
Evidence aggregate, and reports no token usage, cost, quota, or progress
percentage.

## Security / Safety

- Backend bound to loopback `127.0.0.1` only; the smoke used port 8001.
- The unrelated service already listening on port 8000 was never contacted,
  modified, or terminated.
- No real AI executor exists or was invoked. `ReferenceExecutor` remains
  deterministic, local, and the only registered runtime.
- No worktree, Finding, Evidence, or command-execution capability was introduced.
- No commit, push, amend, stash, reset, clean, restore, or force checkout was
  performed at any point.
- No auto commit, auto merge, or force push exists in the codebase.
- Operators are not authenticated and no identity is fabricated; audit records
  record only that a request originated outside the orchestrator.
- Audit and recovery payloads expose no repository path, canonical path, git
  common dir, executor session reference, dedupe key, or secret.
- Secret-bearing safe-metadata keys are rejected at the domain boundary, and
  Event payloads remain redacted.
- Temporary Git repositories, the temporary SQLite database, and the smoke
  scripts were created under `/tmp` and were deleted after verification. No
  runtime artifact is tracked by Git.

## Deferred to Later Phases

Phase 3 does **not** implement:

- Workspace aggregate, worktree allocation, or write isolation
- Finding aggregate and its lifecycle
- Evidence aggregate, Artifact storage, or command/test result capture
- real verification command execution and exit-status capture
- human risk acceptance (`ACCEPTED_RISK`)
- approval nodes for restricted commands
- automatic startup reconciliation
- a real write-capable AI executor
- Office View
- frontend Phase 5 work of any kind

## Known Limitations

- **Restart recovery is discovery plus explicit reconciliation.** There is no
  automatic boot-time reconciliation, and no enumeration of non-terminal Runs by
  Project: an operator discovers candidates and reconciles them one Run at a
  time by id. This is deliberate (see ADR-0001 §3.3), but it means a restart
  requires an operator action to resolve an unresolved Run.
- **A policy-blocked Run has no path to completion.** `REMEDIATION_BOUND_EXCEEDED`
  and `CONDITION_UNKNOWN` cannot be cleared by resume, and Phase 3 has no
  risk-acceptance mechanism, so such a Run stays `BLOCKED` until a human acts
  outside the product. WORKFLOW_CONTRACT §56 records this explicitly.
- **`UNKNOWN_EXECUTION_STATE` resume cannot fabricate proof.** Resume is
  permitted for this reason because the Executor is registered, but when the
  external session cannot be proven the Run does not reach completion and no
  replacement AgentRun is created. Resolution requires the Executor to become
  able to prove the session.
- **A `CONDITION_UNKNOWN` block is permanently unresumable**, because
  `changed_areas` cannot be amended after planning.
- **Reconciliation needs the Run id.** There is no route that reconciles all
  candidates returned by discovery.
- **The remediation loop is keyed to the `REVIEW` and `REMEDIATION` stage keys.**
  A workflow using different keys would not enter the loop.
- **Retry is bounded by a module constant** (one automatic retry) and applies
  only to optional-excluded, pre-start, explicitly-retryable failures.
  `RetryPolicy` backoff fields are not modelled.
- **The `except OwnershipError` branch in `GET /api/runs/{run_id}` remains
  unreachable**, unchanged from Phase 2: no HTTP route accepts a caller-supplied
  Project for Runs.
- `ORCHESTRATION_STEP_LIMIT` remains a non-resumable blocked state.
- **No frontend work was done**, so none of the Phase 3 control plane is
  reachable from the UI. That is the scope of Phase 5.

## Decision

```text
Phase 3 ACCEPTED
```

Every corrected Phase 3 requirement passed against real evidence:

```text
1   WorkflowDefinition versioned and validated                       PASS
2   Immutable WorkflowSnapshot, retained and authoritative           PASS
3   Run → Stage → AgentRun lifecycle                                 PASS
4   Fan-out produces separate AgentRuns                              PASS
5   Fan-in gates downstream start                                    PASS
6   Conditional stage skip with durable reason                       PASS
7   Blocker is a COMPLETED reviewer verdict, not a failure            PASS
8   Remediation loop completes on a clear re-review                  PASS
9   Remediation bounded; no cycle 4; Run BLOCKED                     PASS
10  Verification orchestration permits and prevents completion        PASS
11  Retry preserves failed attempt history                           PASS
12  UNKNOWN outcome never retried, never claimed complete             PASS
13  Required failure fails truthfully with no downstream execution    PASS
14  Completion decided only by the central gate                       PASS
15  cancel requested ≠ cancel confirmed                               PASS
16  Unproven cancellation never claims CANCELLED                      PASS
17  Started assignment keeps last authoritative status                PASS
18  Duplicate executor event → one logical effect                     PASS
19  Late event does not regress terminal state                        PASS
20  SSE ids are durable Event ids; Last-Event-ID replays              PASS
21  REST remains authoritative                                        PASS
22  Recovery discovery is read-only and performs no execution          PASS
23  Explicit reconciliation creates no duplicate AgentRun              PASS
24  Restart preserves identities, history, events, and audit           PASS
25  Manual interventions produce append-only AuditRecords              PASS
26  Audit survives restart and is scoped to one Run                    PASS
27  Canonical taxonomy closed; no invented or provider event            PASS
28  Two Projects remain isolated                                      PASS
29  No path or session leakage in any DTO                              PASS
30  ReferenceExecutor-only; no real AI executor introduced            PASS
```

The specification boundary is closed by ADR-0001, which re-anchors every
evidence-dependent requirement to the phase that can prove it without deleting
or weakening any of them.
