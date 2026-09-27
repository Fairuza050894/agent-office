# Agent Office — Domain Model

Status: Draft  
Version: 0.1  
Scope: Core domain model for the standalone Agent Office control plane

---

## 1. Purpose

This document defines the core domain model for Agent Office.

The model is intentionally provider-neutral and project-agnostic.

Agent Office must be able to manage multiple repositories, multiple workflows, multiple agent roles, and multiple execution runtimes without coupling core domain objects to Codex, Antigravity, OpenClaw, or any one managed project.

The domain model is designed around the following principles:

- one Project may contain many Tasks
- one Task may have many Runs
- one Run executes one Workflow snapshot
- one Run may contain many AgentRuns
- one AgentRun uses one AgentProfile and one Executor reference
- write-capable AgentRuns use controlled Workspace allocations
- all meaningful activity may produce Events
- reviewers produce durable Findings
- tests, diffs, reports, screenshots, and similar outputs become Evidence
- executor-specific details remain outside core domain semantics

---

## 2. Core Aggregate Overview

```text
Project
  │
  ├── ProjectPolicy
  │
  ├── ProjectExecutorPreference
  │
  └── Task*
        │
        └── Run*
              │
              ├── WorkflowSnapshot
              │     └── WorkflowStage*
              │
              ├── AgentRun*
              │     ├── AgentProfileRef
              │     ├── ExecutorRef
              │     ├── Workspace?
              │     └── Event*
              │
              ├── Finding*
              ├── Evidence*
              ├── RunEvent*
              └── AuditRecord*
```

Reusable configuration objects exist outside a single Project or Run:

```text
WorkflowDefinition
AgentProfile
ExecutorConfiguration
PolicyDefinition
```

A Run stores immutable snapshots or references sufficient to preserve historical truth even if reusable definitions later change.

---

## 3. Aggregate Boundaries

The initial aggregate boundaries are:

### Project Aggregate

Owns:

- Project
- project-specific configuration
- archive state
- project executor preference
- project workflow preference
- project policy references

Does not own:

- repository source files
- executor sessions
- Run history

### Task Aggregate

Owns:

- Task intent
- constraints
- lifecycle metadata

A Task is stable user intent and may have multiple Runs.

### Run Aggregate

Owns authoritative execution state for one execution attempt.

Owns or coordinates:

- Run status
- WorkflowSnapshot
- stage state
- AgentRun identity and dependencies
- completion gate state
- remediation cycle state

### AgentRun Aggregate

Owns one concrete execution of one Agent Role through one Executor.

Owns:

- status
- executor assignment
- workspace assignment
- start/end timestamps
- normalized result
- capability snapshot where required

### Finding Aggregate

Owns review finding lifecycle.

### Evidence Aggregate

Owns engineering evidence metadata and artifact references.

### Event Aggregate

Events are append-oriented historical records and are not the sole source of current state.

### AuditRecord Aggregate

Owns the append-only record of manual control-plane interventions.

Owns:

- actor type and action
- the target the intervention applied to
- ownership references (`project_id`, `run_id`)
- bounded safe metadata

Does not own:

- operational Run history (that is the Event Aggregate)
- authorization decisions

AuditRecords are append-only. They are never updated or deleted, including after
the Run they reference becomes terminal. An AuditRecord is not an Event and does
not substitute for one.

---

## 4. Project

A Project represents one managed software repository.

### Required Fields

```text
Project
├── id
├── name
├── repository_path
├── repository_identity
├── default_branch
├── preferred_executor_id?
├── default_workflow_id?
├── status
├── created_at
├── updated_at
└── archived_at?
```

### ProjectStatus

```text
ACTIVE
ARCHIVED
```

### Invariants

1. `id` is stable and never reused.
2. `repository_path` must resolve to a validated Git repository before activation.
3. Agent Office must not silently change repository identity after registration.
4. Archived Projects may retain historical Runs.
5. New Runs must not start for an archived Project unless an explicit future policy allows it.
6. Project deletion is not required for MVP; archive is preferred to preserve audit history.

---

## 5. RepositoryIdentity

RepositoryIdentity records enough information to prevent Project path confusion.

Conceptual structure:

```text
RepositoryIdentity
├── canonical_path
├── git_common_dir
├── remote_origin?
└── initial_repository_fingerprint?
```

The implementation should avoid relying on a mutable display name alone.

This object is intended to help prevent a Run registered for one Project from accidentally operating on another repository.

---

## 6. ProjectPolicy

ProjectPolicy contains project-specific execution constraints.

Conceptual fields:

```text
ProjectPolicy
├── allowed_write_paths?
├── denied_write_paths?
├── required_verification_commands*
├── forbidden_commands*
├── restricted_commands*
├── auto_commit
├── auto_merge
├── allow_executor_fallback
└── max_parallel_writers
```

MVP defaults should be conservative:

```text
auto_commit = false
auto_merge = false
allow_executor_fallback = false
```

ProjectPolicy is distinct from natural-language agent instructions.

Where technically enforceable, safety policy should be implemented outside prompt text.

---

## 7. Task

A Task represents user intent.

### Fields

```text
Task
├── id
├── project_id
├── title
├── objective
├── constraints?
├── requested_workflow_id?
├── requested_executor_id?
├── created_at
├── updated_at
└── archived_at?
```

### Invariants

1. Every Task belongs to exactly one Project.
2. Task text is not overwritten by Run execution results.
3. One Task may have multiple Runs.
4. A Run may execute with a different executor than an earlier Run while remaining attached to the same Task.
5. Historical Runs must preserve the Task intent used when they started.

---

## 8. Run

A Run represents one execution attempt of a Task.

### Fields

```text
Run
├── id
├── project_id
├── task_id
├── status
├── workflow_snapshot_id
├── requested_executor_id?
├── resolved_executor_policy
├── candidate_workspace_id?
├── started_at?
├── completed_at?
├── failure_code?
├── failure_summary?
├── created_at
└── updated_at
```

### RunStatus

```text
CREATED
PLANNING
READY
RUNNING
REVIEWING
REMEDIATING
VERIFYING
COMPLETED
BLOCKED
FAILED
CANCELLED
```

### Invariants

1. Every Run belongs to exactly one Task.
2. `Run.project_id` must equal the owning Task's Project.
3. A terminal Run does not become active again unless an explicit future resume model is introduced.
4. `COMPLETED` requires workflow completion gates to pass.
5. An implementation AgentRun ending does not automatically complete the Run.
6. Run status is backend-authoritative.
7. Office View and frontend components never mutate Run status directly.
8. `candidate_workspace_id`, when set, names the backend-authoritative Workspace
   whose state review and final verification evaluate; allocation order is not authority.

---

## 9. Run Terminality

Initial terminal states:

```text
COMPLETED
FAILED
CANCELLED
```

`BLOCKED` is not necessarily terminal.

A blocked Run may later continue after:

- user approval
- executor recovery
- finding remediation
- dependency resolution

If implementation later chooses to treat BLOCKED as terminal for MVP, that choice must be explicit and documented.

---

## 10. WorkflowDefinition

A WorkflowDefinition is reusable configuration describing stages, dependencies, role requirements, and gates.

### Fields

```text
WorkflowDefinition
├── id
├── name
├── description
├── version
├── status
├── stages*
├── created_at
└── updated_at
```

### WorkflowDefinitionStatus

```text
DRAFT
ACTIVE
ARCHIVED
```

### Important Rule

Runs must not depend on mutable WorkflowDefinitions for historical interpretation.

When a Run starts, it receives a `WorkflowSnapshot`.

---

## 11. WorkflowSnapshot

WorkflowSnapshot is the immutable workflow definition used by a specific Run.

### Fields

```text
WorkflowSnapshot
├── id
├── run_id
├── source_workflow_id?
├── source_workflow_version?
├── stages*
├── transitions*
├── completion_gates*
└── created_at
```

A later edit to a reusable WorkflowDefinition must not retroactively change old Run behavior or history.

---

## 12. WorkflowStage

A WorkflowStage represents a logical phase.

Example stage identifiers:

```text
DISCOVERY
PLANNING
IMPLEMENTATION
REVIEW
REMEDIATION
VERIFICATION
DOCUMENTATION
```

### Fields

```text
WorkflowStage
├── id
├── workflow_snapshot_id
├── key
├── name
├── order_hint?
├── execution_mode
├── required
└── role_assignments*
```

### StageExecutionMode

```text
SEQUENTIAL
PARALLEL_ALLOWED
```

`PARALLEL_ALLOWED` does not override workspace safety.

---

## 13. WorkflowDependency

Dependencies are explicit.

```text
WorkflowDependency
├── upstream_stage_or_agent
├── downstream_stage_or_agent
└── condition
```

Example:

```text
Architect.complete
Explorer.complete
        ↓
Backend.start
```

Dependencies must remain cycle-safe.

A WorkflowSnapshot should be validated as a DAG where the workflow model requires acyclic execution.

---

## 14. CompletionGate

CompletionGate defines evidence required before stage or Run completion.

Examples:

```text
AGENT_SUCCESS
NO_BLOCKING_FINDINGS
TEST_COMMAND_PASSED
BUILD_PASSED
REQUIRED_ROLE_COMPLETED
USER_APPROVAL
```

Conceptual structure:

```text
CompletionGate
├── id
├── scope
├── type
├── required
└── parameters
```

A gate may fail without necessarily marking the entire Run FAILED; workflow policy determines whether the Run becomes BLOCKED, REMEDIATING, or FAILED.

---

## 15. AgentProfile

AgentProfile defines a reusable responsibility.

### Fields

```text
AgentProfile
├── id
├── key
├── name
├── description
├── default_access_mode
├── instructions
├── capabilities_required*
├── status
└── version
```

Examples:

```text
architect
explorer
backend-developer
frontend-developer
qa-reviewer
security-reviewer
ux-reviewer
documentation-writer
```

### AgentProfileStatus

```text
ACTIVE
ARCHIVED
```

AgentProfile is executor-neutral.

There must not be separate domain roles such as:

```text
CodexBackendAgent
AntigravityBackendAgent
```

---

## 16. AgentAccessMode

Initial access modes:

```text
READ_ONLY
BOUNDED_WRITE
WRITE
```

These describe requested execution access.

Actual enforcement depends on Workspace and Executor capabilities.

If an Executor cannot guarantee the requested isolation level, the Run must not pretend the guarantee exists.

---

## 17. AgentRun

AgentRun is one concrete execution instance of one AgentProfile within one Run.

### Fields

```text
AgentRun
├── id
├── run_id
├── stage_id
├── agent_profile_id
├── agent_profile_version
├── executor_id
├── executor_session_ref?
├── workspace_id?
├── status
├── attempt
├── started_at?
├── completed_at?
├── result_summary?
├── failure_code?
├── failure_summary?
└── created_at
```

### AgentRunStatus

```text
PENDING
STARTING
RUNNING
WAITING
COMPLETED
FAILED
BLOCKED
CANCELLED
```

### Invariants

1. Every AgentRun belongs to exactly one Run.
2. Every AgentRun uses exactly one AgentProfile snapshot/reference.
3. Every executing AgentRun resolves to exactly one Executor.
4. Write-capable AgentRuns must have an approved writable Workspace before mutation.
5. `COMPLETED` means the AgentRun completed its assigned work, not that the Run is complete.
6. Failure and cancellation must be distinguished.
7. An AgentRun may have multiple attempts, but each attempt must remain auditable.

---

## 18. AgentRun Attempt Model

Retries should not silently overwrite history.

Two acceptable implementation patterns:

### Pattern A — New AgentRun per retry

```text
backend-01 attempt 1 FAILED
backend-02 attempt 2 COMPLETED
```

### Pattern B — Stable AgentRun with durable Attempt records

```text
AgentRun backend
├── Attempt 1 FAILED
└── Attempt 2 COMPLETED
```

MVP recommendation:

Use a stable AgentRun plus explicit `AgentRunAttempt` if retry behavior is implemented early.

Otherwise create a new AgentRun and link it with `retry_of_agent_run_id`.

Whichever model is selected must preserve full history.

---

## 19. Executor

Executor represents a configured external execution runtime.

Examples:

```text
Codex
Antigravity
OpenClaw
```

### Fields

```text
Executor
├── id
├── kind
├── name
├── status
├── endpoint_or_runtime_ref?
├── configuration_ref
├── capability_snapshot
├── created_at
└── updated_at
```

### ExecutorStatus

```text
AVAILABLE
UNAVAILABLE
DEGRADED
DISABLED
UNKNOWN
```

Availability must reflect known state only.

Do not fabricate provider quota status if the provider does not expose it.

---

## 20. ExecutorKind

Initial values may include:

```text
CODEX
ANTIGRAVITY
OPENCLAW
REFERENCE
```

`REFERENCE` is the deterministic local executor used during foundation development before connecting a real external runtime.

Future kinds may be added without changing core workflow semantics.

---

## 21. ExecutorCapability

Capabilities describe what an Executor can actually provide.

Potential capability values:

```text
START_EXECUTION
CANCEL_EXECUTION
STATUS_QUERY
EVENT_STREAM
SUBAGENTS
PARALLEL_AGENTS
TOOL_EVENTS
TOKEN_USAGE
SESSION_RESUME
FILE_DIFF
STRUCTURED_RESULT
```

Capability support may be:

```text
SUPPORTED
UNSUPPORTED
UNKNOWN
```

The difference between UNSUPPORTED and UNKNOWN is important.

---

## 22. ExecutorSessionRef

Executor-specific session identifiers must not leak into core behavior.

Conceptually:

```text
ExecutorSessionRef
├── executor_id
├── opaque_session_id
└── safe_metadata
```

The opaque identifier may be persisted for resume or reconciliation.

Raw secrets must not be included.

---

## 23. Workspace

Workspace represents a controlled filesystem context.

### Fields

```text
Workspace
├── id
├── project_id
├── run_id
├── owner_agent_run_id?
├── kind
├── access_mode
├── path_ref
├── base_revision?
├── git_branch?
├── status
├── created_at
├── updated_at
├── released_at?
├── reason_code?
└── reason_summary?
```

`base_revision` is required for every writable Workspace (WORKTREE_POLICY §10):
it is the immutable commit SHA the isolated worktree was created from, so a
later branch movement cannot change what a historical Workspace means.

`reason_code` and `reason_summary` record why a Workspace is not ready — an
unresolved worktree, unrecorded changes, or a failed allocation.

`path_ref` answers §69.3 in favour of **opaque storage references**. It is an
opaque, system-generated reference (three identifier segments) relative to the
configured workspace root. The absolute filesystem location is never stored on
the aggregate and is recomputed and containment-checked on every infrastructure
operation, so a caller cannot substitute a path.

### WorkspaceKind

```text
PROJECT_READ_VIEW
GIT_WORKTREE
INTEGRATION_WORKTREE
TEMPORARY
```

### WorkspaceStatus

```text
ALLOCATING
READY
IN_USE
RELEASING
RELEASED
FAILED
ORPHANED
```

---

## 24. Workspace Invariants

1. Workspace belongs to one Project and one Run.
2. A writable Workspace has a clearly identified write owner.
3. Two concurrent autonomous write AgentRuns must not share one writable Workspace.
4. Workspace release must wait until attached execution is actually safe to release.
5. Main Project working tree is not the default write Workspace.
6. Workspace paths exposed through API must be sanitized where necessary.
7. A Workspace marked RELEASED must not accept new writes.

---

## 25. WorktreeOwnership

Conceptual structure:

```text
WorktreeOwnership
├── workspace_id
├── agent_run_id
├── write_scope?
└── acquired_at
```

The initial system may implement one writer per worktree rather than per-file locking.

A future write-scope model can support safe parallel ownership of non-overlapping repository regions.

---

## 26. Event

Event is an append-oriented normalized record of something that happened.

### Fields

```text
Event
├── id
├── project_id
├── run_id
├── agent_run_id?
├── event_type
├── source
├── occurred_at
├── recorded_at
├── payload
└── schema_version
```

### EventSource

```text
ORCHESTRATOR
EXECUTOR
WORKSPACE
REVIEW
TEST
USER
SYSTEM
```

### Invariants

1. Events are immutable after persistence except for explicitly modeled redaction metadata.
2. Events are normalized before UI consumption.
3. Provider raw payloads must not be treated as safe Event payloads by default.
4. Event payloads must not contain secrets.
5. An Event explains activity but does not replace explicit current entity state.

---

## 27. Event Type Naming

Recommended naming style:

```text
run.created
run.started
run.completed
run.failed
run.blocked
run.cancelled

agent.created
agent.started
agent.waiting
agent.completed
agent.failed
agent.cancelled

workspace.created
workspace.ready
workspace.changed
workspace.released

test.started
test.completed

review.started
review.finding.created
review.completed

remediation.started
remediation.completed

evidence.created

executor.status.changed
```

Event naming is further defined in `EVENT_CONTRACT.md`.

---

## 28. Finding

Finding is a durable reviewer observation.

### Fields

```text
Finding
├── id
├── project_id
├── run_id
├── reviewer_agent_run_id
├── category
├── severity
├── title
├── description
├── status
├── location?
├── remediation_owner_agent_run_id?
├── resolution_summary?
├── created_at
├── updated_at
└── resolved_at?
```

### FindingSeverity

```text
INFO
WARNING
BLOCKER
```

### FindingStatus

```text
OPEN
ACKNOWLEDGED
REMEDIATING
RESOLVED
ACCEPTED_RISK
```

---

## 29. Finding Invariants

1. Findings are not silently deleted when remediated.
2. Reviewer identity is retained.
3. A BLOCKER remains visible after resolution.
4. Resolution does not rewrite the original Finding text.
5. `ACCEPTED_RISK` requires an attributable actor and reason.
6. Workflow policy determines whether an OPEN BLOCKER prevents completion.

---

## 30. Finding Location

Optional source location:

```text
FindingLocation
├── repository_relative_path?
├── line_start?
├── line_end?
├── symbol?
└── artifact_ref?
```

Never store an absolute developer-machine path where a repository-relative path is sufficient.

---

## 31. Evidence

Evidence represents durable engineering proof.

### Fields

```text
Evidence
├── id
├── project_id
├── task_id
├── run_id
├── agent_run_id?
├── kind
├── status
├── summary
├── artifact_ref?
├── metadata
├── created_at
└── schema_version
```

### EvidenceKind

Initial kinds may include:

```text
TEST_RESULT
LINT_RESULT
TYPECHECK_RESULT
BUILD_RESULT
DIFF_SUMMARY
REVIEW_REPORT
SECURITY_REVIEW
UX_REVIEW
SCREENSHOT
DOCUMENT
COMMAND_RESULT
WORKSPACE_STATUS
```

Do not create one generic `AI_OUTPUT` evidence type for everything.

---

## 32. EvidenceStatus

Potential values:

```text
AVAILABLE
PARTIAL
FAILED
UNAVAILABLE
```

Evidence status describes the evidence collection result, not overall Run success.

Example:

```text
Security review evidence = UNAVAILABLE
Run status = BLOCKED
```

or, under another policy:

```text
Security review evidence = UNAVAILABLE
Run status = COMPLETED
```

only if the workflow did not require security review.

---

## 33. ArtifactRef

Large evidence payloads are stored outside SQLite.

```text
ArtifactRef
├── id
├── storage_kind
├── safe_relative_location
├── media_type?
├── size_bytes?
├── digest?
└── created_at
```

Potential storage kind:

```text
LOCAL_IMMUTABLE_FILE
```

Artifact access must remain bounded to the configured Agent Office artifact root.

---

## 34. TestResult

TestResult may be represented as typed Evidence metadata.

Conceptual fields:

```text
TestResult
├── command_ref?
├── suite?
├── passed?
├── failed?
├── skipped?
├── duration_ms?
├── exit_code?
└── artifact_ref?
```

Unknown values remain unknown.

Do not infer zero failures if no test result was collected.

---

## 35. DiffSummary

DiffSummary is evidence describing repository changes.

Conceptual fields:

```text
DiffSummary
├── workspace_id
├── files_changed
├── insertions?
├── deletions?
├── paths*
├── base_revision?
└── current_revision?
```

Do not expose full source diffs by default in event payloads.

Detailed diffs may be separate artifacts.

---

## 36. AuditRecord

AuditRecord captures significant control-plane actions.

### Fields

```text
AuditRecord
├── id
├── project_id?
├── run_id?
├── actor_type
├── actor_id?
├── action
├── target_type
├── target_id?
├── occurred_at
└── safe_metadata
```

### ActorType

```text
USER
SYSTEM
AGENT
EXECUTOR
```

Audit records differ from operational Events.

Examples:

```text
USER changed executor
USER approved restricted command
SYSTEM archived project
USER accepted risk
```

### Phase status

Phase 3 implements this aggregate for the interventions it supports:

```text
RUN_CANCELLATION_REQUESTED
RUN_RESUME_REQUESTED
RUN_RECONCILIATION_REQUESTED
RUN_EXECUTOR_SELECTED
```

`actor_type` is recorded as `USER` for these, because they all originate from an
operator-initiated control-plane request. Agent Office does not authenticate
operators in the local MVP, so `actor_id` stays unset rather than naming a human
that was never identified. `AGENT` and `EXECUTOR` remain canonical actor types
for phases where an agent or executor itself triggers an audited intervention.

`approved restricted command` and `accepted risk` belong to the phases that own
command approval and risk acceptance (see
`docs/architecture/ADR-0001-phase3-orchestration-evidence-boundary.md`).

---

## 37. CommandDecision

Sensitive command policy may create a durable decision.

Conceptual model:

```text
CommandDecision
├── id
├── project_id
├── run_id
├── agent_run_id
├── normalized_command
├── classification
├── decision
├── reason
├── approved_by?
└── created_at
```

### CommandClassification

```text
ALLOWED
RESTRICTED
FORBIDDEN
UNKNOWN
```

### CommandDecisionStatus

```text
APPROVED
DENIED
PENDING_APPROVAL
```

This model may be deferred from MVP persistence if command enforcement remains local and simple, but the domain concept should remain explicit.

---

## 38. Approval

Some workflow transitions or restricted operations may require Approval.

Conceptual model:

```text
Approval
├── id
├── project_id
├── run_id
├── type
├── requested_by
├── status
├── reason
├── resolved_by?
├── created_at
└── resolved_at?
```

### ApprovalStatus

```text
PENDING
APPROVED
REJECTED
EXPIRED
CANCELLED
```

Approval is distinct from Finding.

A Finding describes a problem.

Approval authorizes an action or accepts a condition.

---

## 39. Remediation

Remediation can initially be represented through Finding status plus AgentRun linkage.

If dedicated modeling becomes useful:

```text
Remediation
├── id
├── run_id
├── finding_ids*
├── owner_agent_run_id
├── status
├── started_at
└── completed_at?
```

Avoid introducing this aggregate until actual implementation complexity justifies it.

---

## 40. RunStageState

Runtime state of each workflow stage should be explicit.

```text
RunStageState
├── id
├── run_id
├── stage_key
├── status
├── started_at?
├── completed_at?
└── failure_summary?
```

### RunStageStatus

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

This lets UI render workflow progression without inferring it from AgentRun counts.

---

## 41. Stage Skip Semantics

A stage may be `SKIPPED` only when the WorkflowSnapshot permits it.

Example:

```text
UX Review
```

may be skipped when the Run has no frontend/UI changes and the workflow condition explicitly allows that.

Do not mark stages skipped merely because no matching agent was started.

---

## 42. Workflow Conditions

Initial condition evaluation should be explicit and bounded.

Examples:

```text
always
if_frontend_changed
if_backend_changed
if_security_sensitive
if_findings_exist
```

MVP should avoid arbitrary user-provided executable expressions.

Prefer controlled condition types and parameters.

---

## 43. ProjectVerificationConfig

Projects may define verification commands.

Conceptual model:

```text
ProjectVerificationConfig
├── test_commands*
├── lint_commands*
├── typecheck_commands*
├── build_commands*
└── additional_checks*
```

These are configuration inputs, not evidence.

A command becomes Evidence only after it is executed and its actual result is recorded.

---

## 44. ExecutorPreference

Project default preference:

```text
ProjectExecutorPreference
├── project_id
├── executor_id
└── fallback_policy
```

Run-level explicit selection may override the Project default.

The resolved executor must be recorded in Run/AgentRun history.

---

## 45. FallbackPolicy

Initial values:

```text
NO_FALLBACK
ASK_USER
ALLOW_CONFIGURED_FALLBACK
```

MVP default:

```text
ASK_USER
```

High-risk tasks should not silently change executor.

---

## 46. Provider Metadata

Provider-specific details may be stored only in bounded metadata.

Examples:

```text
Codex session reference
Antigravity run identifier
OpenClaw agent session identifier
```

Rules:

- metadata is not part of core workflow semantics
- secrets are forbidden
- UI must not depend on undocumented provider internals
- historical records remain understandable if adapter code changes later

---

## 47. Canonical Identifiers

Use stable identifiers rather than mutable names for relationships.

Recommended domain identifiers:

```text
ProjectId
TaskId
RunId
WorkflowDefinitionId
WorkflowSnapshotId
AgentProfileId
AgentRunId
ExecutorId
WorkspaceId
EventId
FindingId
EvidenceId
ArtifactId
AuditRecordId
```

Implementation may use UUIDs.

IDs should not encode provider type.

---

## 48. Timestamp Rules

Persist timestamps in UTC.

UI may render local time.

Important timestamps include:

- created_at
- updated_at
- started_at
- completed_at
- occurred_at
- recorded_at
- resolved_at
- released_at

The distinction between event occurrence and event ingestion should be preserved where executor events may arrive late.

---

## 49. Versioning

Objects likely to require versioning:

```text
WorkflowDefinition
AgentProfile
Event schema
Evidence schema
Executor capability schema
```

Historical Runs must remain interpretable after definitions evolve.

---

## 50. Soft Delete and Archive

Prefer archive semantics for domain records with historical value.

Examples:

```text
Project → ARCHIVED
WorkflowDefinition → ARCHIVED
AgentProfile → ARCHIVED
Executor → DISABLED
```

Historical Runs, Findings, Events, and Evidence should not be deleted merely because reusable configuration is retired.

---

## 51. Relationships Summary

```text
Project 1 ── * Task
Task    1 ── * Run

Run 1 ── 1 WorkflowSnapshot
Run 1 ── * RunStageState
Run 1 ── * AgentRun
Run 1 ── * Event
Run 1 ── * Finding
Run 1 ── * Evidence
Run 1 ── * Workspace

AgentRun * ── 1 AgentProfile
AgentRun * ── 1 Executor
AgentRun 0..1 ── 1 Workspace owner relation

Finding * ── 1 reviewer AgentRun
Finding 0..1 ── 1 remediation owner AgentRun

Evidence 0..1 ── 1 AgentRun
Evidence 0..1 ── 1 ArtifactRef
```

---

## 52. Aggregate Interaction Example

User creates:

```text
Project: TDP
Task: Improve FastAPI extraction accuracy
```

Agent Office creates:

```text
Task
└── Run
    └── WorkflowSnapshot
```

Workflow prepares:

```text
RunStageState: DISCOVERY = READY
```

Then:

```text
AgentRun architect = RUNNING
AgentRun explorer  = RUNNING
```

Their events are persisted.

When both complete:

```text
DISCOVERY = COMPLETED
IMPLEMENTATION = READY
```

Backend AgentRun receives an isolated Workspace.

After implementation:

```text
Evidence: DIFF_SUMMARY
Evidence: TEST_RESULT
```

QA reviews and creates:

```text
Finding BLOCKER
```

Run changes:

```text
REVIEWING → REMEDIATING
```

Backend remediation occurs.

QA resolves Finding.

Verification gates pass.

Run becomes:

```text
COMPLETED
```

No object in this sequence needs to know whether Codex or Antigravity supplied the implementation except the relevant Executor/AgentRun metadata.

---

## 53. State Ownership Matrix

| State | Authoritative Owner |
| --- | --- |
| Project status | Project application service |
| Task identity/intent | Task service |
| Run status | Workflow Orchestrator / Run Coordinator |
| Stage status | Workflow Orchestrator |
| AgentRun status | Agent Run Coordinator |
| Executor availability | Executor adapter/policy layer |
| Workspace status | Workspace Coordinator |
| Finding status | Review application service |
| Evidence status | Evidence service |
| Office animation state | none; projection only |

The frontend is not authoritative for any of these domain states.

---

## 54. Domain Events vs Stored Events

The implementation may internally use domain events to coordinate modules.

Do not assume every internal domain event must be exposed as a persisted user-visible Event.

Persist events that materially contribute to:

- auditability
- workflow observability
- recovery
- Office projection
- evidence provenance

Avoid event spam.

---

## 55. Secret-Safety Rule

The following fields must never contain secret values:

```text
Event.payload
Evidence.metadata
Finding.description
AuditRecord.safe_metadata
Project configuration
Executor display metadata
```

Adapters must sanitize external payloads before converting them into domain-safe records.

---

## 56. Path-Safety Rule

Persist repository-relative file references whenever possible.

Avoid exposing:

```text
/Users/person/...
```

through general-purpose API responses.

Absolute paths may exist in trusted local infrastructure records when operationally required, but safe DTOs should avoid exposing unnecessary machine-specific information.

---

## 57. Concurrency Rules

1. Project registration mutation uses optimistic or transactional protection.
2. Run transition operations must reject invalid current-state assumptions.
3. AgentRun completion must be idempotent.
4. Event ingestion should deduplicate provider retries when stable external event IDs exist.
5. Workspace allocation must prevent duplicate active writer ownership.
6. Finding resolution must not erase concurrent reviewer updates.

Detailed persistence mechanisms belong in implementation design.

---

## 58. Idempotency

Operations that may be retried should have idempotent semantics where practical.

Examples:

```text
create Run with idempotency key
record executor callback/event
complete AgentRun
attach Evidence
cancel Run
release Workspace
```

Duplicate retries must not create duplicate evidence or contradictory terminal states.

---

## 59. Cancellation Model

Run cancellation is coordinated, not instantaneous.

Conceptual fields may include:

```text
Run.cancel_requested_at?
Run.cancelled_at?
```

Likewise AgentRun may distinguish request from confirmation if executor behavior requires it.

Do not free a Workspace simply because cancellation was requested.

---

## 60. Recovery Model

On application restart:

- durable records remain
- non-terminal Runs are inspected
- active AgentRuns are reconciled with their Executor
- uncertain external state is represented explicitly
- no side-effecting retry occurs merely because the application restarted

If a dedicated `UNKNOWN` AgentRun state is later needed, add it deliberately after executor reconciliation design is complete.

---

## 61. ReferenceExecutor

Foundation development should include a deterministic `REFERENCE` Executor.

It can simulate:

```text
agent.started
agent.waiting
agent.completed
agent.failed
agent.cancelled
```

without invoking an AI runtime.

It must not simulate:

```text
review.finding.created
test.started
test.completed
evidence.created
command.*
workspace.*
```

Those events assert that a Finding, a command, a test, or a workspace mutation
actually occurred. The ReferenceExecutor performs no repository mutation and
executes no command, so emitting them would fabricate engineering evidence.
Review-blocker behaviour is expressed at the orchestration level instead, as a
bounded blocker verdict on a COMPLETED reviewer AgentRun, and verification as a
completed deterministic verification assignment.

See `docs/architecture/ADR-0001-phase3-orchestration-evidence-boundary.md`.

Purpose:

- validate orchestration
- validate persistence
- validate UI
- validate Office projection
- test retry/remediation
- avoid provider dependency during foundation work

It must be clearly identified as simulated execution.

---

## 62. Office Projection Model

Office View should consume a projection such as:

```text
OfficeAgentProjection
├── agent_run_id
├── role
├── state
├── station
├── current_activity_summary?
└── last_event_at
```

This projection is derived.

It is not a persisted business aggregate.

---

## 63. Derived Operational Projections

Other read models may include:

```text
ProjectSummary
RunSummary
WorkflowProgress
AgentActivitySummary
FindingSummary
EvidenceSummary
ExecutorHealthSummary
```

Read models may denormalize data for UI performance but must remain derivable from authoritative domain state.

---

## 64. Database Mapping Direction

The domain model must not be shaped solely around SQL tables.

Recommended implementation direction:

```text
Domain concept
    ↓
Persistence mapping
```

not:

```text
SQLite table
    ↓
accidental domain model
```

SQLite storage remains an infrastructure concern.

---

## 65. Suggested Initial Persistence Tables

A possible initial schema:

```text
projects
tasks
runs
workflow_definitions
workflow_snapshots
workflow_stages
run_stage_states
agent_profiles
agent_runs
executors
workspaces
events
findings
evidence
artifacts
audit_records
```

Optional later tables:

```text
approvals
agent_run_attempts
command_decisions
executor_capability_history
```

Do not create optional tables until corresponding behavior exists.

---

## 66. Initial MVP Domain Scope

Must implement:

```text
Project
Task
Run
WorkflowDefinition
WorkflowSnapshot
RunStageState
AgentProfile
AgentRun
Executor
Workspace
Event
Finding
Evidence
ArtifactRef
```

May defer:

```text
Approval
CommandDecision persistence
dedicated Remediation aggregate
fine-grained per-file ownership
complex executor capability history
organization/user RBAC
```

---

## 67. Cross-Module Dependency Rules

Recommended ownership:

```text
projects
→ Project

tasks
→ Task

runs
→ Run, RunStageState

workflows
→ WorkflowDefinition, WorkflowSnapshot

agents
→ AgentProfile, AgentRun

executors
→ Executor and executor ports

workspaces
→ Workspace

events
→ Event

reviews
→ Finding

evidence
→ Evidence, ArtifactRef

audit
→ AuditRecord
```

Modules should communicate through application services/ports rather than importing each other's infrastructure repositories.

---

## 68. Domain Anti-Patterns

Avoid:

### Provider leakage

```text
Run.codex_thread_id
```

Prefer:

```text
AgentRun.executor_session_ref
```

### UI-owned workflow state

```text
frontend decides Run is completed
```

### Role/provider conflation

```text
CodexQAAgent
```

### Mutable historical workflow

Old Run changes because workflow definition was edited.

### Fake progress

```text
AgentRun.progress = 78
```

unless the executor provides a real, meaningful progress contract.

### Evidence inferred from absence

No security evidence does not mean zero security issues.

---

## 69. Domain Questions Reserved for Implementation

The following decisions should be finalized before persistence migrations are considered stable:

1. Whether retry is a new AgentRun or AgentRunAttempt.
2. Whether BLOCKED is terminal in MVP.
3. Whether Workspace stores absolute paths internally or opaque storage references.

   Resolved in Phase 4A: **opaque storage references**. `Workspace.path_ref` is a
   relative, system-generated reference, and the absolute location is derived and
   containment-checked per operation, so a caller can never substitute a path.
   See §23.
4. Whether WorkflowSnapshot is serialized JSON or normalized tables initially.
5. Whether completion gates are normalized rows or snapshot JSON.
6. Whether SSE cursors use Event IDs directly.
7. Whether ArtifactRef digest is mandatory.
8. Whether executor capability snapshots are stored per Run or per AgentRun.

These are implementation choices, not reasons to change the overall domain boundaries.

---

## 70. Domain Acceptance Criteria

The domain model is acceptable when it can represent all of the following without provider-specific hacks:

1. one Project with many Tasks
2. one Task retried through multiple Runs
3. one Run using Codex
4. another Run using Antigravity
5. Architect and Explorer running concurrently
6. Backend and Frontend using separate writable Workspaces
7. QA reviewing without write access
8. a BLOCKER Finding
9. remediation by the original implementation owner
10. re-review and resolution
11. test Evidence
12. build Evidence
13. Run completion after verification gates
14. application restart with durable history
15. Office View derived from the same AgentRun state
16. a second unrelated repository managed by the same Agent Office instance

---

## 71. Primary Domain Invariants

These invariants must remain true across future implementation:

1. A Task belongs to one Project.
2. A Run belongs to one Task and one Project.
3. An AgentRun belongs to one Run.
4. AgentProfile is independent of Executor.
5. Executor-specific identifiers do not define core domain identity.
6. Historical Run workflow meaning is immutable.
7. Workflow state is backend-authoritative.
8. Office View is derived.
9. Review Findings are durable.
10. Evidence is factual and source-attributed.
11. Missing evidence is not converted into a positive result.
12. Write concurrency requires workspace isolation.
13. Project identity is preserved through all execution records.
14. Secrets never belong in general domain metadata.
15. Terminal execution history is never silently overwritten.
16. Run completion requires defined gates rather than agent self-declaration.

---

## 72. Next Documents

This domain model is refined by:

```text
WORKFLOW_CONTRACT.md
EVENT_CONTRACT.md
EXECUTOR_ADAPTER.md
WORKTREE_POLICY.md
SECURITY_MODEL.md
INFORMATION_ARCHITECTURE.md
MVP_ACCEPTANCE.md
```

The next document should define the workflow orchestration contract, including stage dependencies, fan-out/fan-in behavior, review gates, remediation loops, retries, cancellation, and completion semantics.


## 36. Phase 9B Planning Domain

Phase 9B introduces a persistent planning aggregate that is deliberately
separate from the operational Run aggregate.

Planning truth records that planning activity happened. It does not prove that
engineering execution happened.

### ComposerThread

```text
ComposerThread
├── id
├── project_id?
├── requested_intent
├── resolved_intent?
├── status
├── title?
├── timezone
├── executor_id?
├── workflow_id?
├── created_at
├── updated_at
└── completed_at?
```

Supported requested intents:

```text
AUTO
ASK
PLAN
BRAINSTORM
RUN
```

A resolved intent may not remain `AUTO`.

Thread status:

```text
OPEN
ACTIVE
AWAITING_USER
COMPLETED
ARCHIVED
```

A Project is optional for general planning records, but later repository-changing
execution still requires a concrete registered Project.

### ComposerMessage

```text
ComposerMessage
├── id
├── thread_id
├── actor_type
├── role_key?
├── message_kind
├── content
└── created_at
```

Messages are append-only.

Actor types:

```text
USER
ROLE
SYSTEM
```

Only ROLE messages may carry a role key.

### TeamProposal

```text
TeamProposal
├── id
├── thread_id
├── phase
├── status
├── rationale_summary
├── created_at
├── decided_at?
└── members*
```

Phases:

```text
PLANNING
IMPLEMENTATION
REVIEW
DOCUMENTATION
```

A TeamProposal is planning truth. Accepting a proposal does not instantiate an
AgentRun.

### PlanningArtifact

Structured planning output:

```text
BRIEF
NOTE
DECISION
QUESTION
RISK
ACTION
```

Artifact content is bounded structured scalar data. Secret-bearing keys such as
password, token, authorization, credential, or private-key fields are rejected
before persistence.

### RequirementCandidate

```text
RequirementCandidate
├── id
├── thread_id
├── project_id?
├── title
├── problem
├── requirement
├── rationale
├── acceptance_hint?
├── source_roles*
├── status
├── created_at
├── updated_at
├── approved_at?
└── decided_at?
```

Lifecycle:

```text
PROPOSED
   ├── APPROVED
   ├── REJECTED
   └── DEFERRED
```

The first decision is immutable.

APPROVED requires `approved_at == decided_at`.

Requirement Project scope must equal the owning ComposerThread Project scope.

Approval, rejection, and deferral are explicit USER audit actions.

### PlanningEvent

PlanningEvent is append-only history for the planning aggregate.

It is not the operational Event entity.

```text
PlanningEvent
├── id
├── thread_id
├── project_id?
├── event_type
├── role_key?
├── occurred_at
├── recorded_at
├── sequence
└── payload
```

Sequence is unique inside one thread.

Examples:

```text
composer.thread.created
composer.message.received
intent.resolved
team.proposed
team.accepted
team.rejected
planning.started
planning.contribution.recorded
planning.artifact.created
requirement.proposed
requirement.approved
requirement.rejected
requirement.deferred
planning.completed
```

PlanningEvent history is served through a planning-specific API/SSE boundary and
must never be inserted into the operational Run Event table.

### PlanningRuntime

Phase 9B defines a provider-neutral PlanningRuntime port.

The deterministic `ReferencePlanningRuntime` exists only to prove lifecycle and
persistence boundaries.

It declares:

```text
read_only = true
structured_output = true
cancellable = true
```

It is not production provider intelligence and is not wired to the Universal
Composer as a real planner.

Real provider planning remains a later Phase 9 slice.

### Planning vs operational truth

```text
Planning
ComposerThread
ComposerMessage
TeamProposal
PlanningArtifact
RequirementCandidate
PlanningEvent

        ≠

Operational execution
Task
Run
AgentRun
Workspace
Event
Finding
Evidence
```

No Phase 9B planning operation may create operational execution truth.
