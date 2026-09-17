# ADR-0001 — Phase 3 Orchestration Truth vs Phase 4 Engineering Evidence

Status: Accepted
Version: 1.0
Scope: Phase 3 boundary and specification reconciliation

---

## 1. Context

Agent Office must not claim a fact it has not proven.

Phase 3 proves workflow orchestration using ReferenceExecutor, a deterministic
local executor that performs no real repository mutation, runs no commands, and
calls no AI provider. Phase 4 introduces safe writable worktrees, durable
Findings, real command/test execution, and Evidence.

Before this decision the specification set was internally inconsistent about
where engineering evidence belongs. Three concrete contradictions existed.

### 1.1 MVP_ACCEPTANCE §45 (Phase 3) required evidence-domain events

`docs/product/MVP_ACCEPTANCE.md` §45 "Event Taxonomy Acceptance" lists
`review.finding.created` and `evidence.created` inside the Phase 3 acceptance
body, while §§73–80 assign Findings and Evidence to Phase 4.

### 1.2 MVP_ACCEPTANCE §52 (Phase 3) required a durable Finding transition

§52 "Remediation Acceptance" ends its Phase 3 scenario with `Finding RESOLVED`,
a lifecycle transition that requires the Phase 4 Finding aggregate.

### 1.3 PRD §25 numbers the phases differently

`docs/product/PRD.md` §25 defines a phase plan in which "Orchestration" is
Phase 2 and "Real Executor" is Phase 4, while `MVP_ACCEPTANCE.md` §6 defines
Phase 3 as Workflow + ReferenceExecutor + Events and Phase 6 as the first real
executor. Two documents therefore disagree about what "Phase 3" means.

The reconciliation constraint is that the final product behaviour must not
change. Phase 3 must be closable without pretending Phase 4 already exists, and
without deleting the requirements that the finished MVP still owes.

---

## 2. Decision

**Phase 3 proves orchestration semantics. Phase 4 proves engineering-change
truth. Neither may claim the other's facts.**

`MVP_ACCEPTANCE.md` §6 is the authoritative phase map. `PRD.md` §25 is a
historical ordering and is not the delivery contract.

### 2.1 What Phase 3 proves

Phase 3 proves the control plane transitions canonical state correctly, using
only the Executor port and normalized Events:

```text
WorkflowDefinition
→ immutable WorkflowSnapshot
→ Run
→ RunStageState
→ AgentRun
→ ReferenceExecutor
→ normalized durable Event
```

including fan-out, fan-in, conditional skip, retry, blocker, remediation
bounded by an explicit maximum, verification orchestration, completion, failure,
cancellation, restart/recovery discovery, duplicate-event safety, late-event
safety, SSE replay, explicit operator control, and auditability.

### 2.2 Phase 3 "review blocker"

Phase 3 blocker means:

> a deterministic ReferenceExecutor reviewer AgentRun successfully completed
> and reported a bounded orchestration-level `BLOCKER` verdict.

It does **not** mean a durable Finding exists. No Finding aggregate, severity
workflow, location, or `RESOLVED`/`ACCEPTED_RISK` lifecycle is required for
Phase 3 acceptance, because those require Phase 4 persistence.

The reviewer Assignment is **COMPLETED**, not FAILED. Reporting a blocker is a
successful review outcome, not an operational failure.

### 2.3 Phase 3 "verification"

Phase 3 verification means:

> the configured deterministic ReferenceExecutor verification assignment
> completed.

It does **not** mean real commands ran, that tests passed, or that Evidence
exists. Phase 3 records no exit status, no pass/fail counts, no duration, and no
artifact reference, and never emits a `test.*`, `evidence.*`, or
`review.finding.*` event.

### 2.4 Phase 4 engineering evidence

Phase 4 introduces factual engineering-change truth:

```text
Workspace
→ actual repository mutation
→ Review
→ Finding
→ real verification command/test
→ Evidence
```

Only Phase 4 may assert that a test executed, that an exit status occurred, that
a Finding was resolved, or that risk was accepted.

### 2.5 Evidence-dependent requirements are moved, not deleted

Every requirement that depends on real Findings or Evidence remains binding. It
is re-anchored to the phase that can prove it:

```text
Phase 3 orchestration acceptance   → orchestration state, Events, recovery, audit
Phase 4 evidence acceptance        → Findings, Evidence, commands, tests, worktrees
```

Final MVP acceptance is unchanged in strength. Requirement count is preserved.

---

## 3. Consequences

### 3.1 Specification changes

- `MVP_ACCEPTANCE.md` §45 now separates Phase 3 orchestration events from the
  Phase 4 evidence-closure events, which remain listed and binding.
- `MVP_ACCEPTANCE.md` §52 now distinguishes the Phase 3 orchestration loop from
  the Phase 4 durable Finding transition, which remains required.
- `MVP_ACCEPTANCE.md` §33/§57 state the boundary explicitly and point here.
- `MVP_ACCEPTANCE.md` §§186–187 annotate the evidence-dependent end-to-end steps
  as Phase 4 evidence closure. The scenarios themselves are unchanged.
- `WORKFLOW_CONTRACT.md` §53, §56, §69, §71 and §120 state their Phase 3
  implementation status against this decision.
- `EVENT_CONTRACT.md` records that the evidence-domain taxonomy is Phase 4
  and that Phase 3 emits no such event.

### 3.2 Auditability in Phase 3

`WORKFLOW_CONTRACT.md` §69 requires manual interventions to produce
AuditRecords. Phase 3 implements the minimal correct append-only AuditRecord for
the interventions it supports — Run cancellation request, Run resume, Run
reconciliation request, and explicit executor selection. Wider intervention
classes named in §69 (`approve restricted action`, `accept risk`, `reopen
Finding`) belong to the phases that own the underlying capability.

An AuditRecord is distinct from an Event. An Event is the normalized operational
history of Run execution. An AuditRecord is the record of a manual control-plane
intervention. Neither substitutes for the other, and no audit fact is written as
an operational Event.

### 3.3 Restart recovery in Phase 3

`WORKFLOW_CONTRACT.md` §71 describes loading and reconciling non-terminal Runs
after restart. Phase 3 implements the safe subset:

```text
restart
→ recovery discovery (durable query only, no external I/O)
→ operator inspects candidates
→ explicit POST /api/runs/{id}/reconcile
→ executor truth proven? yes → record fact
                          no  → BLOCKED
→ explicit resume only when safe
```

Phase 3 does not perform broad external I/O because FastAPI started. Boot-time
executor reconciliation is deferred until an executor integration can prove it
is side-effect-free.

### 3.4 What this decision forbids

Phase 3 must not:

- emit `review.finding.*`, `evidence.*`, `test.*`, or `command.*` events
- persist a Finding or Evidence aggregate
- assert that a command or test executed
- claim `ACCEPTED_RISK`
- execute against a real repository worktree
- treat executor self-report as Evidence

### 3.5 What remains owed

The following stay binding and are delivered by the phases that own them:

```text
Finding aggregate + lifecycle                  Phase 4
Evidence aggregate + truthfulness rules         Phase 4
real command/test execution + exit status       Phase 4
safe writable worktrees                         Phase 4
verification command gate                       Phase 4
human risk acceptance                           Phase 4
first real executor                             Phase 6
```

---

## 4. Alternatives Considered

**Implement Findings and Evidence in Phase 3.** Rejected. Findings require real
reviewed repository changes to be truthful; Evidence requires real command
execution. Building the aggregates early would either persist fabricated facts
or force worktree execution into Phase 3, which AGENTS.md §9 forbids.

**Delete the evidence requirements from the specification set.** Rejected. It
would weaken final MVP acceptance and lose the product's central guarantee that
review and verification are evidence-backed.

**Renumber the phases to match PRD §25.** Rejected. Phase 0–2 are already
committed and verified under the §6 numbering, and two accepted verification
records depend on it.

---

## 5. Compliance

A Phase 3 claim violates this decision if it asserts any fact in §3.4. A Phase 4
or later claim violates final MVP acceptance if it omits any item in §3.5.

Neither direction is permitted. The boundary is symmetric.
