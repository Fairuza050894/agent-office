# Agent Office — Workflow Contract

Status: Draft  
Version: 0.1  
Scope: Workflow orchestration, dependency, review, remediation, retry, cancellation, and completion semantics

---

## 1. Purpose

This document defines the workflow execution contract for Agent Office.

The Workflow Contract specifies how a Task becomes a Run, how stages and AgentRuns are created, how dependencies are enforced, how parallel work is coordinated, how reviews produce findings, how remediation loops work, how retries are represented, and when a Run may be considered complete.

This contract is provider-neutral.

Codex, Antigravity, OpenClaw, and future executors must conform through adapter behavior rather than changing core workflow semantics.

---

## 2. Goals

The workflow model must support:

- deterministic stage transitions
- explicit dependencies
- safe fan-out and fan-in
- role-based execution
- independent review
- remediation loops
- verification gates
- cancellation
- retry
- blocked states
- executor capability differences
- worktree isolation
- multi-project safety
- durable history
- honest uncertainty
- UI projection from canonical backend state

---

## 3. Non-Goals

This contract does not define:

- provider-specific prompt syntax
- provider-specific session APIs
- UI animation behavior
- detailed database schema
- organization RBAC
- cloud worker scheduling
- billing
- arbitrary user-defined executable workflow code

Those concerns belong to other contracts or future phases.

---

## 4. Core Workflow Terms

### WorkflowDefinition

Reusable workflow configuration.

### WorkflowSnapshot

Immutable copy of the workflow used by one Run.

### Stage

Logical execution phase.

### Stage Node

A workflow node representing stage execution requirements.

### Agent Assignment

A request to execute an AgentProfile within a stage.

### Dependency

A directed prerequisite relation between stages or agent assignments.

### Gate

A condition that must be satisfied before transition or completion.

### Fan-Out

One dependency unlocking multiple downstream executions.

### Fan-In

Multiple upstream executions required before one downstream transition.

### Review Finding

A durable review result that may affect workflow progression.

### Remediation

Work performed to address one or more findings.

---

## 5. Workflow Snapshot Rule

Every Run must execute against an immutable `WorkflowSnapshot`.

A mutable WorkflowDefinition may be edited for future Runs.

An active or historical Run must not change behavior because its source WorkflowDefinition changed.

Conceptually:

```text
WorkflowDefinition v3
        │
        ├── Run A → WorkflowSnapshot v3
        ├── Run B → WorkflowSnapshot v3
        │
WorkflowDefinition edited → v4
        │
        └── Run C → WorkflowSnapshot v4
```

Run A and Run B remain v3.

---

## 6. Workflow Graph

A workflow is represented as a validated directed graph.

Initial requirement:

- graph must be acyclic before the Run begins
- remediation is modeled as a controlled state transition, not an arbitrary DAG cycle
- dependencies must reference known nodes
- every required terminal path must eventually reach a completion or terminal state

Conceptual example:

```text
Architect ─┐
           ├──> Implementation ──> QA ──> Verify
Explorer ──┘
```

---

## 7. Stage Types

Initial stage keys may include:

```text
DISCOVERY
PLANNING
IMPLEMENTATION
INTEGRATION
REVIEW
REMEDIATION
VERIFICATION
DOCUMENTATION
FINALIZATION
```

Stage keys are semantic identifiers, not hard-coded UI tabs.

Projects may use subsets of these stages.

---

## 8. Stage Status

Canonical stage states:

```text
PENDING
READY
RUNNING
WAITING
COMPLETED
FAILED
BLOCKED
SKIPPED
CANCELLED
```

Meaning:

```text
PENDING
Dependencies not yet satisfied.

READY
Dependencies satisfied and execution may start.

RUNNING
One or more required assignments are actively executing.

WAITING
Stage is logically active but waiting for an external dependency,
approval, retry condition, or executor condition.

COMPLETED
All required assignments and gates for this stage passed.

FAILED
The stage failed according to workflow policy.

BLOCKED
Progress cannot continue until a resolvable condition is addressed.

SKIPPED
The stage was explicitly skipped by workflow condition.

CANCELLED
The stage was cancelled as part of Run cancellation.
```

---

## 9. Run State Mapping

Workflow execution drives the canonical Run state.

Example mapping:

```text
DISCOVERY / PLANNING active
→ PLANNING

IMPLEMENTATION / INTEGRATION active
→ RUNNING

REVIEW active
→ REVIEWING

REMEDIATION active
→ REMEDIATING

VERIFICATION active
→ VERIFYING
```

The Run state is not computed independently by the frontend.

---

## 10. Workflow Node

Conceptual workflow node:

```text
WorkflowNode
├── id
├── key
├── stage_key
├── node_type
├── required
├── execution_mode
├── condition?
├── agent_profile_id?
├── gate_definition?
└── metadata
```

Possible `node_type` values:

```text
AGENT
GATE
APPROVAL
JOIN
```

MVP may represent JOIN implicitly through dependency resolution rather than a dedicated persisted node type.

---

## 11. Agent Assignment

An Agent node creates an AgentRun when eligible.

Conceptual assignment:

```text
AgentAssignment
├── node_id
├── agent_profile_id
├── access_mode
├── executor_policy
├── workspace_policy
├── required
├── retry_policy
└── dependencies*
```

One AgentProfile may appear more than once in a workflow.

Example:

```text
Backend Developer
→ implementation

Backend Developer
→ remediation
```

These produce separate AgentRuns unless explicitly modeled otherwise.

---

## 12. Dependency Semantics

A downstream node becomes eligible only when all required upstream dependencies satisfy their completion condition.

Default dependency condition:

```text
upstream = COMPLETED
```

Alternative controlled conditions may include:

```text
COMPLETED_OR_SKIPPED
RESOLVED_FINDINGS
APPROVED
```

Arbitrary executable expressions are not permitted in MVP.

---

## 13. Fan-Out

Fan-out occurs when one completed dependency unlocks multiple nodes.

Example:

```text
Planning complete
      │
      ├── Backend
      └── Frontend
```

The orchestrator may start both only when:

- both nodes are READY
- required executor capabilities are available
- workspace safety allows concurrent execution
- workflow parallelism policy allows it
- project concurrency bounds allow it

---

## 14. Fan-In

Fan-in occurs when a downstream node waits for multiple required predecessors.

Example:

```text
Backend complete ──┐
                   ├──> QA
Frontend complete ─┘
```

QA must not start merely because one implementation node completed if the other is required.

Optional predecessors may be skipped according to workflow condition.

---

## 15. Required vs Optional Agent Nodes

An agent node may be:

```text
required = true
```

or:

```text
required = false
```

Optional does not mean silently ignored.

An optional node must end as one of:

```text
COMPLETED
SKIPPED
FAILED
CANCELLED
```

according to workflow policy.

The reason for SKIPPED must be recorded.

---

## 16. Conditional Stages

Initial controlled conditions may include:

```text
ALWAYS
IF_FRONTEND_CHANGED
IF_BACKEND_CHANGED
IF_UI_CHANGED
IF_SECURITY_REVIEW_REQUIRED
IF_FINDINGS_EXIST
IF_DOCUMENTATION_REQUIRED
```

The orchestrator evaluates conditions from factual Run state or evidence.

Example:

```text
IF_UI_CHANGED
```

must be based on actual changed paths or explicit task metadata.

It must not be guessed by the UI.

---

## 17. Condition Evaluation Result

Condition evaluation produces:

```text
TRUE
FALSE
UNKNOWN
```

If a required workflow decision evaluates to UNKNOWN, the orchestrator must follow configured policy.

Default MVP policy:

```text
UNKNOWN
→ BLOCKED or require user decision
```

Do not silently interpret UNKNOWN as FALSE.

---

## 18. Workflow Planning

Before execution, the orchestrator validates:

- Project is active
- repository identity is valid
- WorkflowSnapshot is valid
- required AgentProfiles exist
- selected Executor exists
- required executor capabilities are known
- dependency graph is valid
- no unsafe parallel write plan is known
- required verification configuration exists where needed

If planning fails, Run should remain non-executing and expose a safe error.

---

## 19. Planning Output

Planning may produce a durable plan summary:

```text
RunPlan
├── resolved_workflow
├── resolved_executor_policy
├── planned_agent_nodes
├── planned_parallel_groups
├── required_gates
├── workspace_requirements
└── planning_warnings
```

RunPlan may be persisted as safe metadata or derived from WorkflowSnapshot.

It must not contain secrets.

---

## 20. Executor Resolution

Executor resolution happens before AgentRun start.

Resolution priority:

```text
agent-node explicit executor
        ↓
run explicit executor
        ↓
project preferred executor
        ↓
workflow configured executor
        ↓
user selection required
```

Exact priority may be simplified in implementation, but it must remain deterministic and documented.

---

## 21. Executor Capability Gate

Before AgentRun start, the orchestrator checks required capabilities.

Example:

```text
AgentProfile requires:
CANCELLATION
STATUS_QUERY
```

If selected Executor reports:

```text
CANCELLATION = UNKNOWN
```

the system must not pretend the requirement is satisfied.

Possible result:

```text
AgentRun = BLOCKED
Run = BLOCKED
```

with actionable reason.

---

## 22. Workspace Resolution

Before a write-capable AgentRun starts, the orchestrator requests a Workspace.

Conceptual sequence:

```text
Agent node READY
      ↓
resolve executor
      ↓
allocate workspace
      ↓
workspace READY
      ↓
AgentRun STARTING
      ↓
executor start
```

The executor must not begin write-capable work before workspace allocation is confirmed.

---

## 23. Read-Only Agent Execution

Read-only roles may inspect:

- main project read view
- integration worktree
- implementation worktree
- repository snapshot

according to workflow policy.

Read-only reviewers must not receive write-capable workspace permissions merely for convenience.

---

## 24. Write Agent Execution

Write-capable roles use isolated writable workspaces by default.

Examples:

```text
Backend Developer
Frontend Developer
Documentation Writer
Remediation Developer
```

Write ownership must be explicit.

---

## 25. Parallel Write Eligibility

Two write AgentRuns may execute concurrently only if:

1. both workflow nodes permit parallel execution
2. each has its own writable Workspace
3. write ownership does not knowingly overlap
4. no required shared mutable external resource creates a conflict
5. project policy permits concurrency

If safe independence cannot be established:

```text
serialize
```

rather than guess.

---

## 26. Write Scope

Optional configuration:

```text
WriteScope
├── allowed_paths*
└── denied_paths*
```

Example:

```text
backend/**

frontend/**
```

MVP may begin with per-worktree isolation without strict path enforcement.

However, the workflow model must leave room for path-based write policy.

---

## 27. Integration Stage

When parallel write work exists, integration may be required before review.

Example:

```text
Backend Agent complete
Frontend Agent complete
        ↓
Integration stage
        ↓
QA
```

MVP must not automatically merge changes into the project main branch.

Integration may use:

- controlled integration worktree
- explicit user action
- dedicated integration agent in a future version

---

## 28. AgentRun Creation

An AgentRun is created only when its workflow node becomes eligible.

Do not pre-create hundreds of AgentRuns for nodes that may never execute.

A node may remain represented through RunStageState or plan metadata until eligible.

---

## 29. AgentRun Start Contract

Before start:

```text
AgentRun.status = PENDING
```

Then:

```text
PENDING
→ STARTING
```

Only after executor acknowledgement:

```text
STARTING
→ RUNNING
```

If executor fails before acknowledgement:

```text
STARTING
→ FAILED
```

---

## 30. AgentRun Completion

AgentRun completion requires a normalized terminal result from the executor or an explicit reconciliation decision.

Possible terminal states:

```text
COMPLETED
FAILED
CANCELLED
```

`BLOCKED` may remain non-terminal.

The system must distinguish:

```text
executor session ended
```

from:

```text
assignment succeeded
```

where the provider exposes enough information to do so.

---

## 31. Agent Result

Conceptual normalized result:

```text
AgentResult
├── outcome
├── summary
├── structured_output?
├── artifacts*
├── safe_metadata
└── provider_result_ref?
```

Outcome:

```text
SUCCESS
FAILURE
CANCELLED
UNKNOWN
```

UNKNOWN must not be converted to SUCCESS.

---

## 32. Independent Review

Reviewer roles should be logically separate from implementation ownership.

Preferred:

```text
Backend Developer
        ↓
QA Reviewer
```

not:

```text
Backend Developer
        ↓
same Backend Developer self-certifies
```

The same executor technology may run both roles, but they must remain separate AgentRuns with separate instructions and responsibilities.

---

## 33. Review Stage

A Review stage may contain:

```text
QA
Security
UX
Architecture Review
```

Not all roles are required for every workflow.

Example:

```text
QA      required
Security required
UX      conditional IF_UI_CHANGED
```

---

## 34. Review Finding Creation

Reviewers create Findings through normalized output.

A finding must include at minimum:

```text
severity
title
description
```

Preferred additional data:

```text
repository-relative location
category
evidence reference
```

Reviewers must not silently rewrite implementation as a substitute for producing findings.

---

## 35. Finding Severity and Workflow Effect

Initial policy suggestion:

```text
INFO
→ does not block

WARNING
→ does not block by default

BLOCKER
→ blocks completion until resolved or explicitly accepted
```

Workflow-specific policy may strengthen rules.

Example:

```text
Security WARNING
→ block in high-security workflow
```

---

## 36. Review Fan-Out

Reviewers may run in parallel.

Example:

```text
Implementation complete
        │
        ├── QA
        ├── Security
        └── UX
```

This is safe because reviewers are read-only by default.

---

## 37. Review Fan-In

Review stage completes only after all required reviewers reach terminal acceptable state.

Example:

```text
QA COMPLETED
Security COMPLETED
UX SKIPPED
        ↓
review fan-in satisfied
```

If Security FAILED:

```text
review fan-in not satisfied
```

unless workflow policy explicitly allows continuation.

---

## 38. Remediation Trigger

Remediation begins when blocking findings exist after review fan-in.

Conceptually:

```text
Review completed
      ↓
OPEN BLOCKER exists?
      ├── no  → Verification
      └── yes → Remediation
```

---

## 39. Remediation Ownership

Default remediation owner should be the original implementation owner when identifiable.

Example:

```text
Backend finding
→ Backend Developer remediation
```

A reviewer should not automatically become remediation owner.

---

## 40. Multi-Finding Remediation

One remediation AgentRun may address multiple related findings when:

- they share implementation ownership
- they belong to the same workspace/integration context
- workflow policy permits grouping

Grouping must preserve links to every Finding.

---

## 41. Remediation Stage

Conceptual flow:

```text
Finding BLOCKER
      ↓
Finding = REMEDIATING
      ↓
Remediation AgentRun
      ↓
implementation update
      ↓
Finding awaiting re-review
```

The finding is not marked RESOLVED solely because the developer says it is fixed.

---

## 42. Re-Review

A blocking Finding is resolved only after an authorized review step confirms remediation or an explicit human risk acceptance occurs.

Preferred:

```text
Developer remediation
      ↓
original reviewer or compatible reviewer
      ↓
Finding RESOLVED
```

---

## 43. Remediation Loop

Controlled loop:

```text
REVIEWING
   ↓ blockers
REMEDIATING
   ↓
REVIEWING
   ↓
VERIFYING
```

To prevent endless autonomous loops, workflow policy must define a maximum remediation cycle count.

Initial default:

```text
max_remediation_cycles = 3
```

If exceeded:

```text
Run = BLOCKED
```

requiring user decision.

---

## 44. Retry vs Remediation

Retry and remediation are different.

### Retry

Same assignment failed operationally.

Example:

```text
executor crashed
network failure
provider temporary error
```

### Remediation

Assignment completed, but review found implementation problems.

Example:

```text
authorization missing
test regression
incorrect UI behavior
```

Do not represent review remediation as a retry.

---

## 45. Retry Policy

Conceptual retry policy:

```text
RetryPolicy
├── max_attempts
├── retryable_failure_codes*
├── backoff_policy
└── require_user_after_exhaustion
```

MVP should remain conservative.

Default recommendation:

```text
max_attempts = 1 automatic retry
```

only for explicitly retryable operational failures.

Do not auto-retry uncertain side-effecting executions.

---

## 46. Retryable Failure Examples

Potentially retryable:

```text
temporary provider unavailable
transient connection failure
executor startup timeout before work began
```

Not automatically retryable:

```text
unknown execution state
workspace corruption
partial side-effecting command
failed implementation test
security blocker
```

---

## 47. Cancellation Request

User or orchestrator may request Run cancellation.

Run cancellation triggers cancellation requests for active AgentRuns.

Conceptual:

```text
Run cancellation requested
      ↓
active AgentRuns receive cancel request
      ↓
wait for acknowledgement/reconciliation
      ↓
safe workspace release
      ↓
Run CANCELLED
```

---

## 48. Cancellation Truthfulness

Do not transition:

```text
RUNNING → CANCELLED
```

merely because a cancel command was sent.

If provider cannot confirm termination, the system may need:

```text
WAITING / BLOCKED
```

or future recovery state.

---

## 49. Stage Cancellation

When Run cancellation is confirmed:

```text
PENDING stages
→ CANCELLED

READY stages
→ CANCELLED

RUNNING stages
→ cancellation coordinated through AgentRuns
```

Historical completed stages remain COMPLETED.

---

## 50. Workflow Failure

Run failure may result from:

- non-retryable required AgentRun failure
- required workspace failure
- unrecoverable workflow invariant violation
- required gate failure configured as terminal
- unrecoverable executor error
- invalid persisted state detected during recovery

Failure reason must be durable and safe.

---

## 51. Blocked Run

Use BLOCKED when progress may resume after intervention.

Examples:

```text
executor unavailable
approval required
remediation cycle exhausted
unknown cancellation result
workspace conflict
missing required project command
```

BLOCKED must include an actionable reason.

---

## 52. Verification Stage

Verification is separate from reviewer completion.

Verification may include:

```text
tests
lint
typecheck
build
required repository commands
finding closure check
workspace integrity
```

Evidence from implementation agents may be reused only if workflow policy allows it.

Independent final verification is preferred for critical workflows.

---

## 53. Verification Command

A verification command is configured, executed, and recorded.

Conceptual lifecycle:

```text
configured command
      ↓
execution started
      ↓
exit status captured
      ↓
Evidence created
      ↓
gate evaluated
```

Do not mark a command passed because an agent claims it ran.

Where possible, Agent Office should execute or independently observe verification commands.

### Phase 3 implementation status

Phase 3 does not execute verification commands and does not capture exit status.
Its verification stage proves only that the configured deterministic
ReferenceExecutor verification assignment completed.

Phase 3 therefore must not report that a command passed, that a command ran, or
that Evidence exists. No `command.*`, `test.*`, or `evidence.*` event is emitted.
Command execution, exit-status capture, and Evidence creation are Phase 4
evidence acceptance, at which point this section becomes fully binding.

---

## 54. Completion Gates

Typical Run completion gates:

```text
all required stages completed
no OPEN BLOCKER findings
required tests passed
required lint checks passed
required build passed
required documentation stage completed or skipped by policy
all write workspaces reconciled
no unresolved executor state
```

### Phase 3 implementation status

Phase 3 evaluates the gates it can prove from orchestration state:

```text
all required stages completed                      Phase 3
no unresolved executor state                       Phase 3
required documentation stage completed or skipped  Phase 3
no OPEN BLOCKER findings                           Phase 4 (requires Finding)
required tests passed                              Phase 4 (requires execution)
required lint checks passed                        Phase 4 (requires execution)
required build passed                              Phase 4 (requires execution)
all write workspaces reconciled                    Phase 4 (requires Workspace)
```

The Phase 3 gate additionally refuses completion while a bounded remediation loop
is unresolved or exhausted, which is the orchestration-level expression of
"no OPEN BLOCKER findings" that Phase 3 can actually prove. The Phase 4 gates are
not satisfied by Phase 3 and are not claimed by it.

---

## 55. Completed Run

A Run may become COMPLETED only when:

1. WorkflowSnapshot terminal path is satisfied.
2. Required nodes are completed or validly skipped.
3. Completion gates pass.
4. No blocking Finding remains unless formally accepted by policy.
5. No required AgentRun has unresolved execution state.
6. Required Evidence exists.
7. Run finalization succeeds.

### Phase 3 implementation status

Phase 3 enforces conditions 1, 2, 3, 5, and 7. Condition 3 is evaluated against
the Phase 3 gate subset in §54.

Conditions 4 and 6 require the Phase 4 Finding and Evidence aggregates. They are
not enforced in Phase 3 — not because they were dropped, but because Phase 3
cannot prove them, and a gate that always passes is worse than an absent gate.
They become mandatory when Phase 4 lands.

---

## 56. Accepted Risk

If future policy permits a blocker to be accepted:

```text
Finding
OPEN BLOCKER
      ↓
human approval
      ↓
ACCEPTED_RISK
```

The original Finding remains durable.

Completion gate may then treat it as resolved-by-policy.

AI agents must not self-approve accepted risk in MVP.

### Phase 3 implementation status

Not implemented. Accepting risk requires a durable Finding to accept and an
attributable human control-plane action. Phase 3 has no Finding aggregate and no
operator identity, so it provides no risk-acceptance path.

The Phase 3 consequence is deliberate and bounded: a Run blocked by an exhausted
remediation bound stays BLOCKED until a human acts. It cannot be forced to
COMPLETED, and no agent can accept the risk on the operator's behalf.

---

## 57. Documentation Stage

Documentation runs after implementation stabilizes unless the workflow explicitly requires earlier documentation.

Documentation Agent must document actual final implementation.

Preferred:

```text
Implementation
→ Review
→ Remediation
→ Verification
→ Documentation
```

Alternative:

```text
Documentation
→ Final Verification
```

may be used when docs themselves require verification.

---

## 58. Documentation Failure

Documentation failure should not silently disappear.

Workflow policy determines whether documentation is:

```text
required
optional
conditional
```

If required and it fails:

```text
Run = BLOCKED or FAILED
```

according to policy.

---

## 59. Workflow Definition Example: Enterprise Engineering

Conceptual YAML:

```yaml
id: enterprise-engineering
version: 1

stages:
  - key: discovery
    mode: parallel_allowed
    agents:
      - role: architect
        required: true
        access: read_only
      - role: explorer
        required: true
        access: read_only

  - key: implementation
    depends_on:
      - discovery
    mode: parallel_allowed
    agents:
      - role: backend-developer
        condition: if_backend_changed
        access: write
      - role: frontend-developer
        condition: if_frontend_changed
        access: write

  - key: review
    depends_on:
      - implementation
    mode: parallel_allowed
    agents:
      - role: qa-reviewer
        required: true
        access: read_only
      - role: security-reviewer
        required: true
        access: read_only
      - role: ux-reviewer
        condition: if_ui_changed
        access: read_only

  - key: remediation
    condition: if_findings_exist

  - key: verification
    depends_on:
      - review

  - key: documentation
    depends_on:
      - verification
```

This example is illustrative.

The implementation schema must be versioned and validated.

---

## 60. Workflow Definition Example: Bug Fix

```yaml
id: bug-fix
version: 1

stages:
  - key: discovery
    agents:
      - role: explorer
        required: true

  - key: implementation
    depends_on:
      - discovery
    agents:
      - role: developer
        required: true

  - key: review
    depends_on:
      - implementation
    agents:
      - role: qa-reviewer
        required: true

  - key: verification
    depends_on:
      - review
```

---

## 61. Workflow Definition Example: Documentation

```yaml
id: documentation
version: 1

stages:
  - key: discovery
    agents:
      - role: explorer
        required: true
        access: read_only

  - key: documentation
    depends_on:
      - discovery
    agents:
      - role: documentation-writer
        required: true
        access: bounded_write

  - key: review
    depends_on:
      - documentation
    agents:
      - role: documentation-reviewer
        required: true
        access: read_only
```

---

## 62. Workflow Validation

Before activation, validate:

- unique workflow ID/version
- unique stage keys
- known AgentProfile references
- valid dependency references
- no invalid dependency cycle
- at least one reachable terminal path
- valid gate types
- valid condition types
- valid access modes
- valid executor requirements
- valid parallelism declarations

Invalid WorkflowDefinitions must remain DRAFT and cannot start Runs.

---

## 63. Workflow Versioning

WorkflowDefinition version is immutable once used by a Run.

Editing an active workflow produces a new version.

Example:

```text
enterprise-engineering v1
enterprise-engineering v2
```

Historical Runs preserve their source version.

---

## 64. Agent Profile Versioning

WorkflowSnapshot should record the AgentProfile version used by each assignment.

A future edit to QA instructions must not rewrite historical Run meaning.

---

## 65. Instruction Composition

Final executor instruction may be composed from:

```text
AgentProfile instructions
+ Workflow node instruction
+ Task objective
+ Project constraints
+ Repository instructions
+ Run context
```

Composition order and precedence must be deterministic.

Secrets must not be injected unless explicitly required by a secure executor integration.

---

## 66. Instruction Precedence

Recommended precedence from highest to lowest:

```text
Agent Office safety policy
Workflow constraints
Project policy
AgentProfile instructions
Task objective
Repository guidance
Executor-specific formatting
```

Repository instructions must not override Agent Office safety policy.

---

## 67. Repository Instructions

Repository instruction files may include:

```text
AGENTS.md
CONTRIBUTING.md
README.md
project policy files
```

The orchestrator or executor adapter may include relevant instructions.

Agent Office must record which instruction sources were used where practical.

---

## 68. Human Approval Node

A future workflow may include:

```text
APPROVAL
```

Example:

```text
Security finding
      ↓
User approval required
      ↓
Continue or cancel
```

Approval node status:

```text
PENDING
APPROVED
REJECTED
EXPIRED
CANCELLED
```

MVP may implement only the approvals needed for restricted command or risk acceptance.

---

## 69. Manual Intervention

The user may:

- cancel Run
- retry eligible AgentRun
- choose executor after BLOCKED
- approve restricted action
- accept risk
- reopen Finding
- resume blocked workflow
- archive Task/Project after completion

Manual interventions must produce AuditRecords.

### Phase 3 implementation status

Phase 3 implements the minimal append-only AuditRecord required by this section
for the interventions it supports:

```text
Run cancellation request      → RUN_CANCELLATION_REQUESTED
Run resume                    → RUN_RESUME_REQUESTED
Run reconciliation request    → RUN_RECONCILIATION_REQUESTED
explicit executor selection   → RUN_EXECUTOR_SELECTED
```

The remaining interventions — `approve restricted action`, `accept risk`,
`reopen Finding`, `retry eligible AgentRun`, `archive Task/Project` — belong to
the phases that own the underlying capability and must produce AuditRecords when
those capabilities exist. `accept risk` additionally requires human
control-plane authority per §56.

An AuditRecord is not an Event. An Event records what Run execution did; an
AuditRecord records that an operator intervened. A manual intervention must not
be represented as an operational Event, and an operational Event must not be
used as an audit trail.

Audit records are append-only. They are never updated or deleted, including
after the Run they reference reaches a terminal state.

---

## 70. Workflow Resume

A BLOCKED Run may resume only when:

- the blocking condition is resolved
- workflow state is revalidated
- required resources remain valid
- workspaces are safe
- executor sessions are reconciled where needed

Resume does not mean restarting from the beginning.

---

## 71. Application Restart Recovery

After Agent Office restart:

```text
load non-terminal Runs
      ↓
validate durable stage state
      ↓
inspect active AgentRuns
      ↓
query/reconcile Executor where supported
      ↓
reconcile Workspace status
      ↓
resume orchestration only when safe
```

Do not auto-rerun uncertain side-effecting AgentRuns.

### Phase 3 implementation status

Phase 3 separates two concepts that this section describes as one sequence:

```text
RECOVERY DISCOVERY
  durable query only; no external I/O
  identifies non-terminal Runs that may need operator action
        ↓
RECONCILIATION
  bounded, explicit, operator-triggered
  POST /api/runs/{id}/reconcile
        ↓
RESUME
  only after the blocking condition is proven resolved
```

Phase 3 deliberately does **not** query or reconcile executors during process
boot. Starting a web server is not evidence that investigating external
sessions is side-effect-free, so reconciliation stays an explicit bounded
action. `load non-terminal Runs`, `inspect active AgentRuns`, and `resume
orchestration only when safe` are satisfied by recovery discovery plus explicit
reconciliation.

`reconcile Workspace status` requires the Phase 4 Workspace aggregate and is not
part of Phase 3.

Automatic startup reconciliation may be introduced once an executor integration
can demonstrate that reconciliation is side-effect-free.

---

## 72. Unknown External State

If Agent Office cannot prove whether an external AgentRun is still active, do not infer success or failure.

Default:

```text
Run = BLOCKED
```

with an explicit reconciliation reason.

A future `UNKNOWN` AgentRun state may be added if repeated provider needs justify it.

---

## 73. Idempotent Transition Requirement

Workflow transitions must be idempotent.

Repeated processing of:

```text
agent.completed
```

must not:

- duplicate downstream AgentRuns
- duplicate Findings
- duplicate Evidence
- advance the stage twice

---

## 74. Transition Guard

Every state transition must validate expected current state.

Example:

```text
AgentRun RUNNING → COMPLETED
```

valid.

Example:

```text
AgentRun CANCELLED → RUNNING
```

invalid unless a future explicit resume model exists.

Invalid transitions should fail safely and create diagnostics.

---

## 75. Event Ordering

Executor events may arrive late or duplicated.

The orchestrator must use:

- stable event identity where available
- occurred_at
- recorded_at
- current state guards
- provider reconciliation

Do not trust network arrival order as workflow truth.

---

## 76. Workflow Event Examples

Important normalized events may include:

```text
workflow.snapshot.created
stage.ready
stage.started
stage.completed
stage.blocked
stage.skipped
stage.failed

agent.created
agent.start.requested
agent.started
agent.completed
agent.failed
agent.cancel.requested
agent.cancelled

review.finding.created
review.finding.resolved

verification.started
verification.completed

run.completed
```

This list spans the whole product, not one phase. `review.finding.created` and
`review.finding.resolved` are Phase 4 evidence acceptance and are not emitted by
the ReferenceExecutor workflow milestone, which proves orchestration with the
`remediation.*` and `verification.*` events instead (see
`docs/architecture/ADR-0001-phase3-orchestration-evidence-boundary.md`).

Detailed event schema belongs in `EVENT_CONTRACT.md`.

---

## 77. Orchestrator Responsibilities

The orchestrator owns:

- eligibility evaluation
- dependency resolution
- fan-out scheduling
- fan-in completion
- stage state
- Run state
- remediation cycle
- completion gates
- retry policy
- cancellation coordination
- blocked-state reasoning

The orchestrator does not own:

- provider API implementation
- Git command implementation
- frontend rendering
- project application code

---

## 78. Executor Adapter Responsibilities

Executor Adapter owns:

- translating AgentRun start into provider operation
- provider capability reporting
- provider session identity
- status reconciliation
- provider event normalization
- cancellation request
- safe result extraction

Executor Adapter must not independently mark entire Run complete.

---

## 79. Workspace Coordinator Responsibilities

Workspace Coordinator owns:

- workspace allocation
- worktree lifecycle
- write ownership
- status inspection
- safe release
- repository identity validation

Workspace Coordinator does not decide workflow completion.

---

## 80. Review Service Responsibilities

Review Service owns:

- Finding creation
- Finding lifecycle
- reviewer attribution
- remediation linkage
- resolution
- accepted-risk metadata

Workflow Orchestrator consumes Finding state to evaluate gates.

---

## 81. Evidence Service Responsibilities

Evidence Service owns:

- evidence metadata
- artifact association
- evidence status
- source attribution
- safe persistence

Workflow gates may depend on Evidence.

---

## 82. UI Responsibilities

UI may:

- display workflow graph
- display Run state
- display stage state
- display AgentRun state
- show blockers
- request user actions
- visualize Office projection

UI may not:

- invent stage completion
- infer successful tests
- create fake agent activity
- bypass backend transition guards

---

## 83. Office View Responsibilities

Office View is a visualization of:

```text
Run
Stage
AgentRun
Event
```

It may animate transitions.

It must not become a second orchestration engine.

---

## 84. Concurrency Limit

Agent Office should define bounded concurrency.

Potential settings:

```text
max_active_agent_runs_global
max_active_agent_runs_per_project
max_active_write_agent_runs_per_project
max_active_review_agents_per_run
```

Defaults should be conservative.

Exact values belong to implementation configuration.

---

## 85. Project-Level Concurrency

Two unrelated Runs in one Project may still conflict.

MVP recommendation:

- multiple read-only Runs may coexist
- concurrent write Runs against the same Project should be restricted unless isolated worktree/integration policy is proven safe

Project policy may initially permit only one active write Run per Project.

---

## 86. Cross-Project Concurrency

Runs belonging to different Projects may execute concurrently when:

- global executor capacity allows
- global resource limits allow
- their workspaces are isolated

Project identity must remain explicit in every orchestration operation.

---

## 87. Executor Capacity

Executor adapter may report capacity information when available.

Examples:

```text
AVAILABLE
DEGRADED
UNAVAILABLE
UNKNOWN
```

Do not fabricate queue position or quota.

---

## 88. Quota Handling

When an Executor reports quota exhaustion:

```text
AgentRun cannot start
      ↓
Run BLOCKED
      ↓
user may wait or select another executor
```

Switching executor must be explicit unless configured fallback policy permits it.

---

## 89. Executor Replacement

If a blocked Run changes executor:

- existing completed AgentRuns remain historical
- new AgentRuns record the new Executor
- workflow does not rewrite old execution metadata
- user-visible audit records executor change

---

## 90. Model Selection

Executor-specific model selection belongs to executor configuration or AgentRun metadata.

Core workflow may express capability requirements such as:

```text
reasoning_high
vision_required
browser_required
```

but must not hard-code vendor model names into domain logic.

---

## 91. Security-Sensitive Workflow

A workflow may declare stronger requirements:

```text
Security Reviewer required
No automatic executor fallback
No auto-commit
Manual approval for restricted commands
Independent verification required
```

These are workflow/policy attributes, not UI-only labels.

---

## 92. High-Risk Command Interaction

If an AgentRun requests a restricted command:

```text
command requested
      ↓
policy evaluation
      ↓
PENDING_APPROVAL
      ↓
AgentRun WAITING
```

After approval:

```text
WAITING
→ RUNNING
```

After rejection:

workflow policy may fail or block the AgentRun.

---

## 93. Forbidden Command

Forbidden commands must be denied automatically.

Example:

```text
git reset --hard
git clean -fd
git push --force
```

unless a future explicit policy changes classification.

An AI agent cannot override a forbidden policy through prompt text.

---

## 94. Stage Timeout

A stage may have optional timeout policy.

Timeout does not necessarily mean failure.

Possible policy:

```text
timeout
→ AgentRun cancellation request
→ reconciliation
→ retry or BLOCKED
```

Do not release Workspace before actual execution safety is known.

---

## 95. AgentRun Timeout

Executor-specific timeout may include:

```text
startup_timeout
idle_timeout
maximum_duration
```

Use only when the Executor can enforce or reliably observe the condition.

---

## 96. Waiting Semantics

WAITING must include a reason.

Examples:

```text
WAITING_FOR_DEPENDENCY
WAITING_FOR_APPROVAL
WAITING_FOR_EXECUTOR
WAITING_FOR_REVIEW
WAITING_FOR_RECONCILIATION
```

Do not present generic waiting without context where a reason is known.

---

## 97. Blocked Semantics

BLOCKED must include:

```text
block_reason_code
safe_summary
required_action
```

Example:

```text
EXECUTOR_QUOTA_EXHAUSTED
"Codex cannot start this AgentRun."
"Wait for reset or choose another executor."
```

---

## 98. Failure Codes

Use controlled failure codes where practical.

Examples:

```text
EXECUTOR_START_FAILED
EXECUTOR_UNAVAILABLE
EXECUTOR_RESULT_UNKNOWN
WORKSPACE_ALLOCATION_FAILED
WORKSPACE_CONFLICT
WORKFLOW_INVALID
DEPENDENCY_FAILED
VERIFICATION_FAILED
REVIEW_REQUIRED
CANCELLATION_UNCONFIRMED
INTERNAL_STATE_CONFLICT
```

Raw exception text is not a stable API contract.

---

## 99. Skip Reason Codes

Examples:

```text
CONDITION_FALSE
NOT_APPLICABLE
USER_DECISION
WORKFLOW_POLICY
```

Skip reason must be durable for required auditability.

---

## 100. Workflow Progress

Agent Office must not fabricate percentage completion.

Allowed:

```text
4 of 7 required nodes complete
Stage: Review
2 blockers open
```

Avoid:

```text
73% complete
```

unless a future mathematically defined progress contract exists.

---

## 101. Workflow Summary Projection

Safe derived summary:

```text
WorkflowProgress
├── current_stage
├── required_nodes_total
├── required_nodes_completed
├── active_agent_runs
├── waiting_agent_runs
├── open_blockers
└── completion_gate_status
```

This projection is factual.

---

## 102. Agent Activity Summary

Safe derived activity:

```text
AgentActivity
├── role
├── status
├── executor
├── started_at
├── last_event_at
└── safe_current_activity?
```

`safe_current_activity` should come from real normalized provider events or executor-reported status.

---

## 103. Activity Text

Avoid inventing text such as:

```text
"Thinking deeply about architecture..."
```

unless the provider explicitly supplies a safe activity event.

Prefer:

```text
Running
Executing tests
Waiting for review
```

when proven.

---

## 104. Finalization

Before Run completion:

```text
verify gates
      ↓
persist final Run summary
      ↓
finalize remaining evidence
      ↓
mark workflow stages terminal
      ↓
mark Run COMPLETED
      ↓
emit run.completed
```

Artifact/workspace retention policy may operate after completion.

---

## 105. Workspace Retention

Completed Run workspaces should not be deleted automatically until retention policy allows it.

Possible future policies:

```text
KEEP
DELETE_AFTER_N_DAYS
DELETE_AFTER_INTEGRATION
MANUAL
```

MVP recommendation:

```text
MANUAL or conservative retention
```

until workflow reliability is proven.

---

## 106. Run Summary

Completion report should be derivable from durable state.

Example:

```text
Run Summary
Project
Task
Workflow
Executor(s)
Completed AgentRuns
Tests
Findings
Resolved Findings
Remaining Warnings
Evidence
Changed Files
Final State
```

Do not depend on the final AI message as the only completion record.

---

## 107. ReferenceExecutor Workflow Testing

ReferenceExecutor must support deterministic scenarios:

```text
SUCCESS
AGENT_FAILURE
REVIEW_BLOCKER
REMEDIATION_SUCCESS
REMEDIATION_FAILURE
CANCELLATION
EXECUTOR_UNAVAILABLE
DUPLICATE_EVENT
LATE_EVENT
```

This enables orchestration tests without real AI providers.

---

## 108. Workflow Test Matrix

The implementation must cover at least:

```text
single sequential AgentRun
parallel read-only fan-out
parallel write with isolated workspaces
fan-in
conditional skip
required node failure
optional node failure
review blocker
remediation loop
remediation max-cycle block
verification failure
retryable executor failure
non-retryable unknown failure
Run cancellation
duplicate event
late event
restart recovery
executor unavailable
project archived before Run start
```

---

## 109. Determinism Requirement

Given the same:

- WorkflowSnapshot
- ProjectPolicy
- Task
- factual conditions
- normalized events

the orchestrator should produce the same transition decisions.

Random orchestration behavior is not allowed in core state transitions.

---

## 110. AI Planning Boundary

AI may propose a workflow plan in future versions.

However:

```text
AI proposal
      ↓
schema validation
      ↓
policy validation
      ↓
user/orchestrator approval
      ↓
WorkflowSnapshot
```

AI output does not directly mutate workflow state without validation.

---

## 111. Dynamic Workflow Expansion

Future orchestrators may request extra specialist agents.

MVP rule:

dynamic expansion is disabled unless the workflow explicitly permits a bounded extension point.

This prevents uncontrolled spawning.

---

## 112. Specialist Agent Request

Future model:

```text
Agent requests specialist
      ↓
orchestrator validates allowed role
      ↓
dependency inserted into active plan
      ↓
audit record created
```

This must not bypass project or executor policy.

---

## 113. Spawn Limits

Future dynamic agent spawning must obey:

```text
max_agents_per_run
max_spawn_depth
allowed_agent_profiles
executor capacity
```

No unbounded recursive agent delegation.

---

## 114. Parent / Child AgentRun

If executor-native subagents are surfaced, Agent Office may represent:

```text
AgentRun
└── ChildAgentRun*
```

Only when provider identity and lifecycle can be observed reliably.

Do not invent child AgentRuns from opaque internal reasoning.

---

## 115. Provider-Native Multi-Agent Runtime

OpenClaw or future executors may perform their own internal delegation.

Adapter choices:

```text
opaque mode
→ Agent Office sees one AgentRun

observable mode
→ adapter maps supported child sessions to child AgentRuns/events
```

Capability determines which model is available.

---

## 116. Codex / Antigravity Native Subagents

If native subagent lifecycle is exposed:

- normalize to Agent Office events
- preserve provider session refs
- do not assume their role semantics equal Agent Office AgentProfiles
- map only when configured and provable

---

## 117. Workflow Portability

A workflow should remain executable across Executors when capability requirements are met.

Example:

```text
enterprise-engineering
```

should not require a rewrite solely to move from Codex to Antigravity.

Executor-specific overrides may exist outside the core WorkflowDefinition.

---

## 118. Workflow Compatibility Check

Before Run creation/start, provide:

```text
COMPATIBLE
PARTIALLY_COMPATIBLE
INCOMPATIBLE
UNKNOWN
```

based on required capabilities.

Do not claim compatibility solely because the provider is reachable.

---

## 119. User-Facing Workflow Explanation

Every workflow should be explainable.

Example:

```text
Discovery:
Architect + Explorer run in parallel.

Implementation:
Backend and Frontend may run in isolated worktrees.

Review:
QA and Security are required.
UX runs only if UI changed.

Remediation:
Blocking findings return to implementation owner.

Completion:
All blockers resolved and configured verification passes.
```

This explanation should derive from the workflow definition.

---

## 120. Workflow Audit

Important workflow actions should produce AuditRecords:

```text
workflow selected
executor changed
stage manually skipped
retry approved
risk accepted
Run resumed
Run cancelled
```

### Phase 3 implementation status

Phase 3 produces AuditRecords for the actions an operator can currently perform:

```text
executor changed   → RUN_EXECUTOR_SELECTED
Run resumed        → RUN_RESUME_REQUESTED
Run cancelled      → RUN_CANCELLATION_REQUESTED
```

plus `Run reconciliation request`, the explicit intervention Phase 3 adds for
unknown external state.

`workflow selected` is a Run-creation input rather than an operator intervention
on an existing Run, and is recorded durably by the Run's frozen
`WorkflowSnapshot`. `stage manually skipped` and `retry approved` have no manual
path in Phase 3: stages are skipped only by evaluating a declared condition, and
retries are automatic and bounded. `risk accepted` requires §56.

Each of these must produce an AuditRecord once its capability exists.

---

## 121. Anti-Patterns

The implementation must avoid:

### Agent self-finalization

```text
Developer says "done"
→ Run COMPLETED
```

### UI-derived state

```text
all visible cards green
→ frontend marks Run complete
```

### Silent fallback

```text
Codex unavailable
→ automatically switch to OpenClaw
```

without policy/user approval.

### Unsafe fan-out

```text
two agents edit same working tree
```

### Reviewer auto-fix

```text
Security reviewer finds issue
→ silently edits code itself
```

### Infinite remediation

```text
review → fix → review forever
```

### Fake agent count

Do not display agents that were never instantiated.

---

## 122. Initial Workflow Defaults

Recommended initial built-in workflow profiles:

```text
enterprise-engineering
bug-fix
frontend-change
backend-api
documentation
review-only
```

Do not add many profiles before real usage proves the need.

---

## 123. Enterprise Engineering Default

Recommended initial behavior:

```text
Discovery
  Architect required
  Explorer required
  parallel

Implementation
  Backend conditional
  Frontend conditional
  isolated writes

Review
  QA required
  Security required
  UX conditional

Remediation
  on blockers
  max 3 cycles

Verification
  required configured commands

Documentation
  conditional or required by project policy

Finalization
  no blockers
  required evidence available
```

---

## 124. Workflow API Requirements

The backend should eventually support:

```text
GET  /api/workflows
GET  /api/workflows/{id}
POST /api/workflows
POST /api/workflows/{id}/versions
POST /api/workflows/{id}/validate

POST /api/projects/{project_id}/tasks
POST /api/tasks/{task_id}/runs
GET  /api/runs/{run_id}
POST /api/runs/{run_id}/cancel
POST /api/runs/{run_id}/resume
```

Exact API design is implementation work, not frozen by this document.

---

## 125. Orchestration Transaction Boundary

State transition and downstream scheduling decisions must avoid partial persistence.

Conceptually:

```text
mark upstream complete
+ evaluate dependencies
+ mark downstream READY
+ persist normalized event
```

should be coordinated transactionally where practical.

External executor start happens after durable intent is recorded.

---

## 126. Durable Intent Before Side Effect

Before invoking external side effects, persist enough state to recover.

Preferred pattern:

```text
AgentRun = STARTING
start_requested event persisted
        ↓
call executor
```

Then reconcile acknowledgement.

Do not invoke executor first and only later create the AgentRun record.

---

## 127. Outbox Consideration

MVP may not need a full distributed outbox.

However, internal design should recognize the difference between:

- durable workflow state
- external side effects
- event publication

If failures reveal inconsistency risk, an outbox pattern may be introduced later.

Do not add it prematurely without need.

---

## 128. Scheduler

Initial scheduler may be local and bounded.

Requirements:

- no duplicate simultaneous execution of the same node
- concurrency limits
- restart reconciliation
- idempotent pickup
- project isolation

A distributed scheduler is not required for MVP.

---

## 129. Claim Semantics

If a local worker loop is used, eligible work should have atomic claim semantics.

Example:

```text
READY
→ STARTING
```

must be claimed once.

Two loops must not start the same AgentRun.

---

## 130. Lease Semantics

MVP should avoid lease/heartbeat complexity unless long-running separate workers require it.

If execution remains in-process/local and provider session is externally reconcilable, simpler durable state may be sufficient.

---

## 131. Notification

Workflow changes may publish UI notifications.

Examples:

```text
Run blocked
Review blocker created
Approval required
Run completed
```

Notifications are projections.

They do not replace durable state.

---

## 132. Workflow Metrics

Safe operational metrics include:

```text
active Runs
blocked Runs
active AgentRuns
open blockers
completed Runs
median Run duration
```

Avoid gamified productivity scores in MVP.

---

## 133. Quota and Cost

If executor exposes factual quota/cost data:

```text
ExecutorHealth
CostEvidence
```

may display it.

If not:

```text
Unavailable
```

Do not estimate provider quota from observed failures alone.

---

## 134. Workflow Definition Storage

WorkflowDefinition may initially be stored as:

- validated JSON/YAML payload plus indexed metadata

or normalized tables.

Recommendation:

use a versioned validated serialized definition for MVP if it reduces schema complexity.

Runtime state remains normalized enough for reliable querying.

---

## 135. Schema Version

Every WorkflowDefinition and WorkflowSnapshot should include:

```text
schema_version
```

Unknown future schema versions must fail safely.

---

## 136. Workflow Import / Export

Future feature:

```text
workflow.yaml
```

MVP may support built-in definitions first.

If import is added:

- strict schema
- no executable code
- no arbitrary shell in condition expressions
- validation before activation

---

## 137. Workflow Naming

Names are mutable display values.

Stable identity uses ID/version.

Do not depend on:

```text
"Enterprise Engineering"
```

for business logic.

---

## 138. Stage Naming

Likewise:

```text
"Review"
```

is display text.

Stable stage keys remain machine identifiers.

---

## 139. Agent Role Naming

Display:

```text
Security Reviewer
```

Stable key:

```text
security-reviewer
```

Executor mapping must use stable identifiers.

---

## 140. Workflow Debug View

Operations UI should eventually expose enough information to understand:

```text
why is this AgentRun waiting?
why did this stage skip?
why is the Run blocked?
which dependency is unresolved?
which gate failed?
```

This is critical for trust.

---

## 141. Explainability Requirement

Every blocked or skipped transition should produce a machine-readable reason and human-readable safe summary.

Examples:

```text
DEPENDENCY_NOT_COMPLETE
WAITING_FOR_QA

CONDITION_FALSE
UX review skipped because no UI changes were recorded.

OPEN_BLOCKER
Security finding SEC-14 blocks verification.
```

---

## 142. Workflow Integrity on Project Archive

If Project becomes ARCHIVED:

- no new Run may start
- existing active Run policy must be explicit

MVP recommendation:

allow active Run to continue only if already running, but deny creation/start of new Runs.

Alternative policy may be selected during implementation.

---

## 143. Workflow Integrity on Repository Change

Repository state may change outside Agent Office.

Before starting write AgentRun:

- revalidate repository identity
- capture base revision
- detect unexpected main worktree state where relevant

Do not assume repository is unchanged since Project registration.

---

## 144. Base Revision

Run or writable Workspace should record:

```text
base_revision
```

when available.

This helps:

- diff calculation
- integration
- audit
- retry reasoning

---

## 145. Dirty Main Worktree

If project main working tree is dirty, Agent Office must not destroy or overwrite user changes.

Possible MVP policy:

```text
dirty main working tree
→ still allow isolated worktree creation if Git permits and repository identity is safe
→ show warning
```

Never clean/reset it automatically.

---

## 146. External Branch Changes

If default branch moves during a Run, existing worktrees continue from recorded base revision.

Do not silently rebase autonomous work.

Rebase/integration requires explicit future policy.

---

## 147. Final Diff

Before Run completion, produce DiffSummary for each writable Workspace or integrated result.

If no integrated final workspace exists, completion report must clearly indicate separate worktrees remain.

Do not imply changes are merged when they are not.

---

## 148. Merge Status

Possible future projection:

```text
NOT_APPLICABLE
UNMERGED
INTEGRATED
MERGED_TO_PROJECT_BRANCH
```

MVP should not claim merge status beyond what Git proves.

---

## 149. Completion Without Merge

A Run may complete its engineering workflow while changes remain unmerged.

Example:

```text
Run COMPLETED
Integration status UNMERGED
```

if project policy defines completion as "ready for user review."

This distinction must be visible.

---

## 150. Workflow Completion Mode

Future workflow configuration may define:

```text
READY_FOR_REVIEW
MERGED
DEPLOYED
```

MVP default:

```text
READY_FOR_REVIEW
```

because automatic merge/deployment is out of scope.

---

## 151. Provider Independence Acceptance

This contract is considered provider-neutral only if the same core workflow can represent:

```text
Run A
Executor: Codex

Run B
Executor: Antigravity

Run C
Executor: ReferenceExecutor
```

without changing Run/Stage/Finding/Evidence semantics.

---

## 152. Workflow Acceptance Scenarios

The implementation must demonstrate:

```text
Scenario A
Architect + Explorer fan-out
→ fan-in
→ Backend
→ QA
→ Verify
→ Complete

Scenario B
Backend + Frontend separate worktrees
→ fan-in
→ QA + Security + UX
→ Complete

Scenario C
Security BLOCKER
→ Remediation
→ Security re-review
→ Resolve
→ Verify
→ Complete

Scenario D
Executor unavailable
→ Run BLOCKED
→ user selects another executor
→ resume

Scenario E
Agent operational failure
→ one safe retry
→ success

Scenario F
unknown external state
→ no retry
→ Run BLOCKED

Scenario G
Run cancellation
→ cancel active AgentRuns
→ reconcile
→ release workspaces
→ CANCELLED

Scenario H
app restart
→ reconcile non-terminal Run
→ no duplicate AgentRun
```

---

## 153. Workflow Invariants

Mandatory invariants:

1. WorkflowSnapshot is immutable for a Run.
2. Downstream execution never starts before required dependencies are satisfied.
3. Required fan-in waits for all required upstream nodes.
4. Parallel writes require isolated writable Workspaces.
5. Reviewer roles are read-only by default.
6. Open BLOCKER findings prevent completion unless explicitly accepted by policy.
7. Remediation does not auto-resolve findings.
8. Retry is not remediation.
9. Cancellation request is not proof of cancellation.
10. Unknown execution outcome is never treated as success.
11. Run completion requires gates.
12. UI cannot advance workflow state.
13. Provider-specific events cannot directly bypass normalized transition logic.
14. Duplicate events cannot duplicate downstream execution.
15. Historical workflow meaning is immutable.
16. High-risk executor fallback is not silent.
17. Remediation loops are bounded.
18. Main working tree is never destructively modified to satisfy automation.
19. Completed AgentRun does not imply completed Run.
20. Office View remains a projection only.

---

## 154. Next Documents

This workflow contract is refined by:

```text
EVENT_CONTRACT.md
EXECUTOR_ADAPTER.md
WORKTREE_POLICY.md
SECURITY_MODEL.md
INFORMATION_ARCHITECTURE.md
MVP_ACCEPTANCE.md
```

The next document should define the normalized event envelope, event taxonomy, idempotency, ordering, redaction, storage, and realtime delivery contract.
