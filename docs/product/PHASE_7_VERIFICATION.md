# Agent Office Phase 7 Verification

Status: CLOSED

Phase: Phase 7 — Multi-Executor / Second Project Dogfood

Verification date: 2026-09-25

Verified implementation checkpoint:

```text
e1928c2 style: format phase 7 isolation tests
```

## Scope

Phase 7 proves that Agent Office is not a single-provider or single-repository prototype.

The acceptance source is `docs/product/MVP_ACCEPTANCE.md` §§126–137. The exit criterion requires two Projects to operate safely, at least two executor configurations to be representable, an explicit mixed-executor or executor-switch scenario to succeed, no cross-Project contamination, and provider-neutral workflow semantics.

Phase 7 deliberately does not add a speculative second external AI provider. The production registry can represent both the deterministic `ReferenceExecutor` and the real `CodexExecutor`; the Phase 7 exit criterion is satisfied through the explicit executor-switch path allowed by §137. Per-stage mixed-executor routing remains later work rather than a domain hack introduced solely for this phase.

## Implemented boundary

Phase 7 adds and verifies:

- cross-Project Workspace ownership validation at the application boundary
- SQLite schema v10 cross-Project ownership constraints
- persistence triggers rejecting mismatched Workspace, Event/AgentRun, and candidate-Workspace scope
- explicit operator executor selection when a Run is blocked on an unavailable executor
- no silent fallback to another registered executor
- capability-filtered executor options in the operational Run UI
- preserved requested-executor and historical execution truth across explicit switch/resume
- deterministic multi-Project dogfood through the production Codex adapter path using a local CLI stand-in
- documentation-only dogfood in an unrelated disposable repository
- small application bug-fix dogfood using Explorer → Developer → QA → Verification
- concurrent Project isolation where one Project can remain active while another completes

The existing safety boundary remains unchanged:

- no automatic commit
- no automatic merge
- no push or force-push
- no destructive Git against registered Project main working trees
- write-capable execution remains confined to managed isolated Workspaces
- normal CI consumes no real provider quota or credentials

## Canonical automated verification

GitHub Actions run:

```text
36141152436
```

at implementation checkpoint:

```text
e1928c2
```

completed successfully.

Observed result:

```text
BACKEND PYTEST
632 passed, 1 dependency warning

RUFF
All checks passed!

RUFF FORMAT
184 files already formatted

MYPY
Success: no issues found in 121 source files

FRONTEND TEST
10 test files passed
53 tests passed

FRONTEND TYPECHECK
PASS

FRONTEND LINT
PASS

FRONTEND BUILD
PASS

REPOSITORY WHITESPACE
PASS
```

The Python warning is the existing FastAPI/Starlette test-client dependency deprecation and is not a Phase 7 regression.

## Acceptance reconciliation

### Second Project acceptance — §127

**Accepted.** The Phase 7 dogfood suite registers two unrelated temporary Git repositories as separate Projects and executes independent Runs against them.

Verified separation includes:

- distinct Project IDs
- distinct Run IDs
- Project-bound AgentRuns
- Project-bound Events
- disjoint Workspace identities
- disjoint Codex executor session references
- independently preserved main repository HEAD and working-tree state

No Project configuration or runtime identity is reused as authority across Projects.

### Cross-Project rejection — §128

**Accepted.** Cross-Project attachment is rejected at both application and persistence boundaries.

The acceptance tests prove rejection of:

- allocating a Workspace for an AgentRun belonging to another Project/Run
- persisting a Workspace whose Run/Project ownership does not match
- persisting an Event whose AgentRun belongs to another Run/Project
- assigning a candidate Workspace that belongs to another Run/Project

SQLite schema v10 validates historical ownership consistency before installing the new constraints and fails closed on contradictory existing data.

### Second executor representation — §129

**Accepted.** Agent Office can represent both:

```text
ReferenceExecutor
CodexExecutor
```

through the same `ExecutorAdapter` architecture.

Phase 7 does not claim a second external AI provider. The acceptance text permits integrating or configuring another executor when a stable surface is available, and the exit criterion requires at least two executor configurations to be representable. Reference and Codex satisfy that representability without provider-specific core redesign.

### Mixed executor / executor switch — §§130–131

**Accepted through the executor-switch alternative.**

Phase 7 does not invent per-stage mixed-provider routing where no approved contract requires it. Instead, the explicit executor-switch scenario is proven:

```text
Run requests unavailable Executor
→ Run BLOCKED / EXECUTOR_UNAVAILABLE
→ no fallback execution occurs
→ operator selects registered compatible Executor
→ resume
→ Run completes
```

The Run retains its original requested executor identity while the resolved executor records the explicit replacement. The operator action is audited as `RUN_EXECUTOR_SELECTED` and `RUN_RESUME_REQUESTED`.

Historical AgentRun records remain immutable and executor-attributed.

### No silent fallback — §132

**Accepted.** An explicitly selected unavailable executor is never silently replaced by another registered executor.

Before the operator chooses a replacement:

- the Run is `BLOCKED`
- failure code is `EXECUTOR_UNAVAILABLE`
- the available ReferenceExecutor receives zero start calls

The operational UI exposes compatible executor choices explicitly and keeps Resume disabled until the operator makes a selection.

### Concurrent Projects — §133

**Accepted.** A deterministic acceptance scenario keeps Project A active/waiting while Project B independently completes.

Their Run, AgentRun, Event, and Workspace identities remain Project-scoped and disjoint.

### Dogfood Scenario A — §134

**Accepted.** The documentation-only pilot uses a disposable unrelated repository and the production Codex adapter path with a deterministic local CLI stand-in.

The implementation creates only the intended `phase7-docs.md` change inside its isolated Workspace. The registered main repository remains unchanged.

### Dogfood Scenario B — §135

**Accepted.** The unrelated application pilot starts with a deliberately incorrect calculator implementation and exercises:

```text
Explorer
→ Developer
→ QA
→ Verification
```

The implementation corrects `calculator.py` only in the isolated Workspace. Agent Office then runs the declared regression verification and records a successful `TEST_RESULT` Evidence item.

The registered application repository remains unchanged.

### Dogfood evidence — §136

**Accepted.** The acceptance suite inspects factual control-plane evidence for the pilot Runs, including:

- Run state/history
- AgentRuns and executor attribution
- normalized Events
- Workspace change summaries / changed paths
- verification TestResult Evidence
- Finding state and open-blocker count
- Workspace state
- executor configuration/state
- preserved main repository state
- separate executor session references per Project

No provider self-report substitutes for Git or verification evidence.

### Exit criteria — §137

All Phase 7 exit conditions are satisfied:

- two unrelated Projects operate successfully
- Reference and Codex executor configurations are representable
- explicit unavailable-executor switch/resume succeeds
- cross-Project contamination is rejected
- workflow orchestration remains provider-neutral

## Security and isolation verification

Phase 7 strengthens defense in depth rather than relying only on service-layer checks.

The SQLite persistence boundary now independently enforces ownership consistency for mutable cross-entity links. A caller bypassing normal application services cannot silently attach a Workspace, AgentRun-scoped Event, or candidate Workspace across Project boundaries.

Dogfood repositories are temporary test repositories. Main repository HEADs and working trees remain byte/logically unchanged after isolated execution.

## Known limitations and deferred items

Phase 7 intentionally does not claim:

- a second external AI provider integration
- per-stage mixed real-provider routing inside one Run
- automatic fallback policy
- automatic commit or merge
- remote workers
- production multi-user authorization

A second external executor may be added later only when it has a stable supported surface and only through the existing `ExecutorAdapter` contract.

## Final conclusion

The Phase 7 exit criterion in `MVP_ACCEPTANCE.md` §137 is satisfied.

Agent Office has now demonstrated:

```text
multiple unrelated Projects
cross-Project ownership isolation
two executor configurations
explicit executor switching
no silent fallback
concurrent Project independence
documentation-only dogfood
application bug-fix dogfood
provider-neutral orchestration
truthful verification evidence
```

Therefore:

```text
Phase 7 CLOSED
Phase 8 NEXT — Office View
```
