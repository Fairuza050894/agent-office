# Agent Office — MVP Acceptance Criteria

Status: Draft  
Version: 0.1  
Scope: Implementation acceptance matrix from foundation through operational MVP and Office View

---

## 1. Purpose

This document defines the acceptance criteria for the Agent Office MVP.

It is the implementation gate used to determine whether a phase is actually complete.

A coding agent must not mark a phase complete merely because:

- files exist
- the application starts
- a screen renders
- a provider returns a response
- one happy-path test passes
- the agent says the work is done

A phase is accepted only when its required functional, architectural, security, recovery, test, and UX criteria are demonstrated.

---

## 2. Product Goal

Agent Office MVP is a local-first, multi-project, multi-executor engineering control plane that can:

- register Git projects
- create Tasks and Runs
- execute reusable workflows
- instantiate AgentRuns
- use a deterministic ReferenceExecutor
- preserve durable Run state
- emit normalized Events
- create Findings and Evidence
- isolate write-capable work in Git worktrees
- survive restart without losing execution history
- expose operational state through a professional web UI
- integrate at least one real executor safely
- optionally visualize live execution through Office View

---

## 3. MVP Boundary

The MVP is considered successful when it can safely orchestrate one real engineering workflow against at least two different software repositories without coupling the core product to either repository.

The initial reference scenario is:

```text
Project A
Technical Documentation Platform

Project B
Another unrelated repository
```

Both must be manageable from one Agent Office instance.

---

## 4. MVP Non-Goals

The following are not required for MVP:

```text
cloud SaaS deployment
organization-wide multi-tenancy
enterprise SSO
Kubernetes
microservices
Kafka
Redis
distributed workers
automatic production deployment
automatic merge to main
automatic force push
mobile-first UI
AI-generated productivity scores
token-cost optimization engine
full OS sandbox
fully autonomous unrestricted agent spawning
marketplace/plugin ecosystem
```

Implementation must not introduce these merely to appear more advanced.

---

## 5. Acceptance Philosophy

Every requirement should be verified by one or more of:

```text
automated test
API demonstration
UI demonstration
filesystem/Git inspection
restart/recovery test
security negative test
documented limitation
```

Statements such as:

```text
"should work"
"probably safe"
"looks correct"
```

are not acceptance evidence.

---

## 6. Phase Overview

Recommended implementation phases:

```text
Phase 0  — Specification Baseline
Phase 1  — Application Foundation
Phase 2  — Project / Task / Run Persistence
Phase 3  — Workflow + ReferenceExecutor + Events
Phase 4  — Worktree Safety + Evidence + Review
Phase 5  — Operational Frontend
Phase 6  — First Real Executor
Phase 7  — Multi-Executor / Second Project Dogfood
Phase 8  — Office View
```

A later phase may not bypass critical safety gates from earlier phases.

---

# PHASE 0 — SPECIFICATION BASELINE

## 7. Phase 0 Goal

Create implementation-ready product, architecture, domain, workflow, event, executor, workspace, security, UX, and acceptance documentation.

---

## 8. Required Documents

The repository must contain:

```text
README.md
AGENTS.md

docs/product/PRD.md
docs/product/MVP_ACCEPTANCE.md

docs/architecture/SYSTEM_ARCHITECTURE.md
docs/architecture/DOMAIN_MODEL.md

docs/contracts/WORKFLOW_CONTRACT.md
docs/contracts/EVENT_CONTRACT.md
docs/contracts/EXECUTOR_ADAPTER.md

docs/security/WORKTREE_POLICY.md
docs/security/SECURITY_MODEL.md

docs/ux/INFORMATION_ARCHITECTURE.md
```

---

## 9. Phase 0 Acceptance

Phase 0 passes when:

- all required files exist
- documents are internally consistent
- Project, Task, Run, AgentRun, Executor, Workspace, Event, Finding, Evidence terminology is consistent
- AgentProfile and Executor remain distinct concepts
- Operations View is primary
- Office View is defined as a projection only
- worktree safety is explicit
- executor capability honesty is explicit
- Run completion is distinct from merge/deploy
- no document requires microservices/Kafka/Redis for MVP
- no document permits destructive main-tree Git behavior by default

---

## 10. Phase 0 Quality Gate

Before implementation begins:

```text
grep/review for contradictions
```

Examples of contradictions that must not exist:

```text
one document says auto_merge = false
another requires auto merge

one document says one writer per worktree
another allows two write agents in same worktree

one document says Office View is projection
another lets Office mutate Run state
```

---

# PHASE 1 — APPLICATION FOUNDATION

## 11. Phase 1 Goal

Create the application skeleton without prematurely implementing real AI executors.

---

## 12. Required Backend Foundation

Recommended:

```text
Python 3.12+
FastAPI
Pydantic
SQLite
pytest
```

The backend must:

- start locally
- bind to loopback by default
- expose a health endpoint
- provide version metadata
- load configuration from a bounded configuration layer
- initialize SQLite safely
- have modular package boundaries
- have structured logging
- have deterministic IDs/timestamps through testable abstractions where useful

---

## 13. Required Frontend Foundation

Recommended:

```text
React
TypeScript
Vite
Vitest
React Testing Library
```

The frontend must:

- start locally
- communicate with backend
- use an application shell
- have routing
- have error boundary behavior
- have basic loading/error states
- have a neutral enterprise visual baseline
- avoid Office View implementation at this phase

---

## 14. Backend Package Acceptance

Conceptual modules should exist only where behavior exists.

Target direction:

```text
projects
tasks
runs
workflows
agents
executors
workspaces
events
reviews
evidence
audit
shared
```

Do not create large empty Clean Architecture directory trees solely for symmetry.

---

## 15. Dependency Direction Acceptance

Domain/application code must not directly depend on:

```text
React
SQLite query implementation details
Codex SDK
Antigravity SDK
OpenClaw runtime internals
```

Infrastructure implements ports.

---

## 16. Configuration Acceptance

At minimum:

```text
listen host
listen port
data root
artifact root
workspace root
database path
log level
```

Defaults must be local and safe.

---

## 17. Local Binding Acceptance

Default backend binding:

```text
127.0.0.1
```

A test or configuration assertion must prove the default is not:

```text
0.0.0.0
```

---

## 18. SQLite Acceptance

Database initialization must:

- create schema deterministically
- not silently destroy existing DB
- support migrations or explicit schema versioning
- survive restart
- use transaction boundaries for state transitions

---

## 19. Foundation Test Gate

Required automated checks:

```text
backend unit tests
frontend unit tests
type checking
lint
build
```

A phase cannot pass with known new errors introduced by the phase.

Existing external warnings must be documented if any.

---

## 20. Phase 1 Exit Criteria

Phase 1 passes when:

- backend starts
- frontend starts
- frontend can call backend health endpoint
- SQLite persists a simple test record across restart
- test commands are documented
- no real executor dependency exists in core
- ReferenceExecutor interface can be introduced without redesign

---

# PHASE 2 — PROJECT / TASK / RUN PERSISTENCE

## 21. Phase 2 Goal

Implement durable Project, Task, and Run identity and ownership.

---

## 22. Project Acceptance

User can:

```text
register local Git repository
view registered Project
archive Project
```

Registration must validate Git identity without modifying repository.

---

## 23. Project Required Fields

At minimum:

```text
id
name
repository identity
default branch
preferred executor?
default workflow?
status
created_at
updated_at
```

---

## 24. Project Repository Validation

Acceptance scenarios:

```text
valid Git repository → accepted
non-Git directory → rejected
missing path → rejected
same repository duplicate → warned/rejected
path with spaces → supported
dirty working tree → accepted without modification
```

---

## 25. Dirty Repository Preservation

Acceptance test:

1. create tracked modified file
2. create untracked file
3. register Project
4. inspect files

Expected:

```text
both files unchanged
```

No reset, clean, stash, or commit.

---

## 26. Task Acceptance

User can create Task with:

```text
title/objective
constraints?
requested workflow?
requested executor?
```

Every Task belongs to exactly one Project.

---

## 27. Run Acceptance

User can create multiple Runs from one Task.

Example:

```text
Task A
├── Run 1 FAILED
└── Run 2 COMPLETED
```

Run 2 must not overwrite Run 1 history.

---

## 28. Ownership Acceptance

Reject:

```text
Run Project A
Task belonging to Project B
```

Project/Task/Run relationships must be validated server-side.

---

## 29. Archive Acceptance

Archived Project:

```text
historical Runs readable
new Run creation denied
```

unless future policy explicitly allows otherwise.

---

## 30. API Acceptance

At minimum provide safe CRUD/query surfaces for:

```text
Projects
Tasks
Runs
```

Exact route shape may evolve, but DTOs must not expose unnecessary absolute filesystem details.

---

## 31. Persistence Restart Acceptance

Procedure:

1. create Project
2. create Task
3. create Run
4. stop backend
5. restart backend
6. query all records

Expected:

```text
identities and relationships preserved
```

---

## 32. Phase 2 Exit Criteria

Phase 2 passes when:

- two unrelated Projects can be registered
- each can have Tasks/Runs
- cross-project ownership checks exist
- records survive restart
- dirty repo preservation tests pass
- frontend can display Project and Run registries without fake data

---

# PHASE 3 — WORKFLOW + REFERENCE EXECUTOR + EVENTS

## 33. Phase 3 Goal

Prove orchestration semantics without relying on a real AI provider.

Phase 3 proves **orchestration truth**: canonical state transitions, Events,
recovery, and auditability, driven only through the Executor port by a
deterministic ReferenceExecutor.

Phase 3 does **not** prove engineering-change truth. Real repository mutation,
durable Findings, real command/test execution, and Evidence are Phase 4
evidence acceptance (see `docs/architecture/ADR-0001-phase3-orchestration-evidence-boundary.md`).

A Phase 3 claim must never assert that a command ran, that a test passed, that a
Finding exists, or that Evidence was produced.

---

## 34. ReferenceExecutor Requirement

ReferenceExecutor is mandatory.

It must be deterministic and configurable for test scenarios.

It must not call an external AI model.

---

## 35. ReferenceExecutor Scenarios

Must support:

```text
SUCCESS
START_FAILURE
RUN_FAILURE
WAITING
REVIEW_BLOCKER
REMEDIATION_SUCCESS
REMEDIATION_FAILURE
CANCEL_CONFIRMED
CANCEL_UNKNOWN
DUPLICATE_EVENT
LATE_EVENT
UNKNOWN_RESULT
```

---

## 36. Workflow Definition Acceptance

At least one built-in workflow:

```text
enterprise-engineering
```

and one simpler workflow:

```text
bug-fix
```

Definitions must be versioned and validated.

---

## 37. Workflow Snapshot Acceptance

When Run starts:

```text
WorkflowDefinition
→ immutable WorkflowSnapshot
```

Editing source workflow later must not alter active/historical Run.

Automated test required.

---

## 38. Stage State Acceptance

Canonical runtime states supported:

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

---

## 39. Fan-Out Acceptance

Reference scenario:

```text
Architect
Explorer
```

run concurrently after Discovery becomes ready.

Both must be separate AgentRuns.

---

## 40. Fan-In Acceptance

Downstream implementation must not start until all required Discovery nodes complete.

Automated test required.

---

## 41. Conditional Stage Acceptance

Example:

```text
UX Review
IF_UI_CHANGED
```

When false:

```text
SKIPPED
```

with durable skip reason.

---

## 42. AgentRun Acceptance

Each concrete execution stores:

```text
role
stage
executor
state
attempt
timestamps
result
```

---

## 43. Agent Completed vs Run Completed

Test must prove:

```text
AgentRun COMPLETED
```

does not automatically transition:

```text
Run COMPLETED
```

---

## 44. Event Envelope Acceptance

Canonical Event must include:

```text
id
schema_version
event_type
project_id
run_id
source
occurred_at
recorded_at
payload
```

Agent-scoped event includes `agent_run_id`.

---

## 45. Event Taxonomy Acceptance

**Phase 3 orchestration acceptance.** At least support:

```text
run.created
run.started
run.blocked
run.completed
run.failed

stage.ready
stage.started
stage.completed
stage.skipped

agent.created
agent.start.requested
agent.started
agent.waiting
agent.completed
agent.failed
```

Phase 3 also supports the extended orchestration taxonomy it exercises
(planning/ready/resume/cancel/reviewing/remediating/verifying, stage
waiting/blocked/failed/cancelled, remediation and verification domain events,
and `executor.session.reconciled`).

**Phase 4 evidence acceptance.** The following remain required and are emitted
only once real review and real command/test execution exist:

```text
review.finding.created

evidence.created
```

Phase 3 must emit neither. A Phase 3 implementation that reports
`review.finding.created` or `evidence.created` without the Phase 4 aggregates
behind them is fabricating evidence, which §77 forbids.

---

## 46. Duplicate Event Acceptance

Send same executor event twice.

Expected:

```text
one durable workflow effect
no duplicate AgentRun
no duplicate downstream stage
```

---

## 47. Late Event Acceptance

Scenario:

```text
agent.completed
then late agent.activity
```

Expected:

```text
AgentRun remains COMPLETED
```

---

## 48. Unknown Result Acceptance

ReferenceExecutor returns:

```text
UNKNOWN
```

Expected:

```text
Run does not become COMPLETED
Run becomes BLOCKED or unresolved according to policy
```

---

## 49. Event Persistence Acceptance

Events survive backend restart.

Activity history remains queryable.

---

## 50. SSE Acceptance

Implement Run event stream with:

```text
Server-Sent Events
```

Acceptance:

- new event appears without full-page refresh
- reconnect supported
- Last-Event-ID or equivalent durable cursor works
- missing transient connection does not lose persisted history

---

## 51. REST Reconciliation Acceptance

Frontend must be able to refetch canonical Run state after SSE reconnect.

SSE alone is not authoritative.

---

## 52. Remediation Acceptance

**Phase 3 orchestration acceptance.** Scenario:

```text
Implementation complete
→ Security Reviewer completes with BLOCKER verdict
→ Run REMEDIATING
→ remediation AgentRun
→ re-review
→ verification
```

The reviewer AgentRun is COMPLETED, not FAILED: reporting a blocker is a
successful review outcome. The blocker is an orchestration-level verdict on the
completed reviewer AgentRun, bounded per cycle and counted durably.

**Phase 4 evidence acceptance.** The final step:

```text
→ Finding RESOLVED
```

remains required. It requires the Phase 4 Finding aggregate (§73–§74) and is
therefore not part of Phase 3 acceptance. Phase 3 proves the loop terminates
correctly on a clear re-review; Phase 4 proves the finding that the loop is
about is durable and attributable.

---

## 53. Remediation Bound Acceptance

Default:

```text
max remediation cycles = 3
```

When exceeded:

```text
Run BLOCKED
```

No endless autonomous loop.

---

## 54. Retry Acceptance

Operational retry and remediation are represented separately.

A retry must not erase failed attempt history.

---

## 55. Cancellation Acceptance

ReferenceExecutor scenarios prove:

```text
cancel requested
≠
cancel confirmed
```

---

## 56. Cancellation Unknown Acceptance

If cancellation outcome unknown:

```text
Run must not claim CANCELLED
```

and write workspace cleanup must later remain prohibited.

---

## 57. Phase 3 Exit Criteria

Phase 3 passes when the full workflow can be demonstrated using ReferenceExecutor with:

```text
fan-out
fan-in
blocker
remediation
verification
completion
failure
cancellation
restart
duplicate events
late events
```

without real AI runtime.

Additionally Phase 3 must demonstrate explicit operator control with durable
audit (`cancel`, `resume`, `reconcile`), recovery discovery of non-terminal Runs
after restart, and a provider-neutral canonical event taxonomy.

"blocker" and "verification" carry the Phase 3 meanings defined in
`docs/architecture/ADR-0001-phase3-orchestration-evidence-boundary.md` §2.2 and
§2.3 — orchestration verdicts and deterministic assignment completion, not
durable Findings or executed tests.

---

# PHASE 4 — WORKTREE SAFETY + REVIEW + EVIDENCE

## 58. Phase 4 Goal

Allow write-capable execution safely against real temporary Git repositories.

---

## 59. Worktree Manager Acceptance

Must support:

```text
validate repository
allocate worktree
capture base revision
acquire write ownership
inspect status
capture changes
release ownership
reconcile
cleanup
```

---

## 60. Main Working Tree Protection

Automated test must prove Agent Office never modifies dirty main-tree changes during:

```text
allocation
execution
review
cancellation
cleanup
```

---

## 61. One Writer Rule

Attempt two active writers on same Workspace.

Expected:

```text
second write ownership denied
```

---

## 62. Parallel Writer Acceptance

Backend and Frontend may execute concurrently only when each has a separate worktree.

Automated test required.

---

## 63. Workspace Lifecycle Acceptance

Supported:

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

## 64. Base Revision Acceptance

Every writable worktree records exact base revision.

---

## 65. Change Capture Acceptance

Git-based change summary detects:

```text
added
modified
deleted
untracked
```

files.

Provider self-report is not authoritative.

---

## 66. Path Safety Acceptance

Tests must reject:

```text
../ traversal
arbitrary absolute path
symlink escape
cleanup outside managed workspace root
```

---

## 67. Cleanup Safety Acceptance

Cleanup API receives Workspace ID.

It does not accept arbitrary raw delete path from frontend/model.

---

## 68. Cancellation Cleanup Acceptance

Scenario:

```text
AgentRun RUNNING
cancel requested
cleanup requested
```

Expected:

```text
Workspace retained
```

until terminal execution is confirmed.

---

## 69. Unknown State Cleanup Acceptance

If executor state unknown:

```text
Workspace remains
Run BLOCKED
```

---

## 70. Cleanup Idempotency

Calling cleanup twice must not corrupt Git metadata or fail dangerously.

---

## 71. Orphan Recovery Acceptance

Simulate crash leaving partially allocated worktree.

After restart:

```text
Workspace reconciled
```

or:

```text
ORPHANED
```

No duplicate worktree created blindly.

---

## 72. Review Read-Only Acceptance

QA/Security reviewer receives read-only execution context.

If reviewer modifies files unexpectedly:

```text
policy violation detected
```

---

## 73. Finding Acceptance

Reviewer can create durable Finding:

```text
severity
category
title
description
location?
reviewer
status
```

---

## 74. Finding Lifecycle Acceptance

Support:

```text
OPEN
ACKNOWLEDGED
REMEDIATING
RESOLVED
ACCEPTED_RISK
```

Original finding remains visible after resolution.

---

## 75. Accepted Risk Acceptance

Only user/human control plane action may set:

```text
ACCEPTED_RISK
```

with reason and audit entry.

ReferenceExecutor/AI cannot self-approve.

---

## 76. Evidence Acceptance

Support at minimum:

```text
TEST_RESULT
LINT_RESULT
BUILD_RESULT
DIFF_SUMMARY
REVIEW_REPORT
SECURITY_REVIEW
COMMAND_RESULT
DOCUMENT
SCREENSHOT
```

where behavior exists.

---

## 77. Evidence Truthfulness

No test execution:

```text
status = UNAVAILABLE
```

not:

```text
0 failed
```

---

## 78. Artifact Acceptance

Large Evidence uses Artifact reference.

Artifact storage must:

- remain inside configured root
- prevent traversal
- prevent unsafe symlink escape
- enforce bounded size
- persist metadata in DB

---

## 79. Test Evidence Acceptance

Actual test execution captures:

```text
exit code
passed?
failed?
skipped?
duration?
artifact?
```

Unknown counts remain null.

---

## 80. Verification Gate Acceptance

A Run with required failing test must not become COMPLETED.

---

## 81. Merge Truth Acceptance

At end of workflow:

```text
Run COMPLETED
Integration UNMERGED
Main branch unchanged
```

must be representable.

---

## 82. No Auto-Merge Acceptance

MVP must not automatically merge into default branch.

---

## 83. No Auto-Commit Default Acceptance

Default setting remains false.

If no explicit commit feature exists, that is acceptable.

---

## 84. Phase 4 Exit Criteria

Phase 4 passes when a ReferenceExecutor-driven write workflow can modify a temporary repository safely, produce Findings/Evidence, preserve the main tree, and clean/reconcile worktrees correctly.

---

# PHASE 5 — OPERATIONAL FRONTEND

## 85. Phase 5 Goal

Build the serious engineering operations UI before Office View.

---

## 86. Required Global Navigation

MVP operational UI includes:

```text
Overview
Projects
Runs
Agents
Workflows
Executors
Activity
Evidence
Audit
Settings
```

---

## 87. Required Project Detail

Project detail includes at least:

```text
Overview
Tasks
Runs
Repository
Settings
```

---

## 88. Required Run Detail

Run detail includes:

```text
Overview
Workflow
Agents
Activity
Changes
Tests
Findings
Evidence
```

Office tab may remain placeholder until Phase 8.

---

## 89. Overview Acceptance

Global Overview shows:

```text
Needs attention
Active runs
Recent activity
Executor status
```

No fake KPI scores.

---

## 90. Project Registry Acceptance

Table includes:

```text
Project
Repository
Default branch
Preferred executor
Workflow
Active runs
Status
```

---

## 91. Run Registry Acceptance

Table includes:

```text
Run
Project
Task
Stage
State
Active agents
Executor
Started
```

---

## 92. Run Overview Acceptance

User can answer within one screen:

```text
What is running?
What is blocked?
Who is active?
Which executor?
What changed?
What evidence exists?
Is it merged?
```

---

## 93. Workflow View Acceptance

Render real WorkflowSnapshot.

Each node shows:

```text
state
role
executor where instantiated
duration where known
block reason
skip reason
```

No fake progress percentage.

---

## 94. Agent View Acceptance

Distinguish:

```text
AgentProfile
```

from:

```text
AgentRun
```

clearly.

---

## 95. Activity Acceptance

Activity derives from normalized Events.

No provider-specific raw chatter.

---

## 96. Findings Acceptance

Blocker is visible and actionable.

Original text remains visible after remediation.

---

## 97. Test View Acceptance

Unknown test values render as:

```text
Unavailable
```

not zero.

---

## 98. Changes Acceptance

Show:

```text
Workspace
files changed
insertions/deletions where available
integration state
```

---

## 99. Executor Acceptance

Executor detail displays:

```text
status
capabilities
runtime
security limitations
last check
```

No invented score.

---

## 100. Blocked UX Acceptance

Example:

```text
Run blocked
Codex unavailable
Action: choose another executor or retry
```

must be clearer than a generic error toast.

---

## 101. Unknown Execution UX Acceptance

Must show:

```text
Execution status unknown
Workspace retained for safety
```

not silently "Failed" or "Cancelled".

---

## 102. Empty State Acceptance

Every primary empty state explains:

```text
what is missing
why
next valid action
```

---

## 103. Visual Quality Acceptance

At:

```text
1600px
1280px
1024px
```

verify:

- no page-level accidental horizontal overflow
- tables usable
- form controls styled
- sidebar usable
- Run tabs usable
- dialogs readable
- blockers visible
- empty states compact
- no giant decorative whitespace

---

## 104. Design Anti-Slop Gate

Reject UI if it contains:

```text
giant gradient hero
glassmorphism dashboard
rainbow status cards
emoji navigation
fake AI score
fake health ring
fake productivity metrics
unnecessary card grid
decorative "AI is thinking" animation
```

---

## 105. Accessibility Acceptance

At minimum:

- semantic labels
- keyboard focus visible
- dialog keyboard behavior
- buttons have accessible names
- table headers semantic
- state represented with text, not color only
- Office View not required for product operation

---

## 106. Frontend State Acceptance

Frontend does not independently mark Run/Stage/AgentRun completed.

Backend canonical state wins.

---

## 107. SSE Failure UX

Disconnect stream.

Expected:

```text
Live updates disconnected
```

Then REST reconciliation remains possible.

---

## 108. Phase 5 Exit Criteria

Phase 5 passes when the entire ReferenceExecutor workflow can be operated and inspected from UI without Office View.

---

# PHASE 6 — FIRST REAL EXECUTOR

## 109. Phase 6 Goal

Integrate one real AI executor through the ExecutorAdapter contract.

---

## 110. Precondition Gate

Do not start real write-capable integration until all are true:

```text
ReferenceExecutor passes
Worktree safety passes
Event redaction passes
Command policy exists
Cancellation semantics exist
Unknown-state handling exists
Secret storage approach exists
```

---

## 111. Real Adapter Selection

Select provider based on currently verified integration surfaces.

The choice must not require domain redesign.

---

## 112. Adapter Required Operations

At minimum, where provider supports them:

```text
describe
capabilities
health
start
status
cancel
reconcile
result
event normalization
```

Unsupported features must be explicit.

---

## 113. Capability Honesty Acceptance

Example:

```text
TOKEN_USAGE = UNKNOWN
```

is acceptable.

Fabricated token usage is not.

---

## 114. Session Acceptance

External session reference maps to one AgentRun.

Cross-project session reuse rejected.

---

## 115. Start Ambiguity Acceptance

Simulate timeout after submission where provider outcome cannot be proven.

Expected:

```text
UNKNOWN
no automatic duplicate retry
Run BLOCKED
```

---

## 116. Cancellation Acceptance

Provider cancellation states map truthfully.

```text
REQUESTED
```

must not directly become:

```text
CANCELLED
```

---

## 117. Reconciliation Acceptance

Restart Agent Office during external execution.

On startup:

```text
load session
reconcile
resume safely or BLOCK
```

No blind rerun.

---

## 118. Event Mapping Acceptance

Provider lifecycle maps to canonical Event types.

Frontend must not require provider-specific branching for core lifecycle.

---

## 119. Raw Provider Data Acceptance

Raw provider payload must not appear in ordinary Event API or UI.

---

## 120. Secret Acceptance

Real provider credential:

- not stored in Project/Run/Event
- not rendered in UI
- not logged
- not included in artifacts

---

## 121. Worktree Acceptance With Real Executor

Real write-capable executor must operate in assigned isolated Workspace.

Main project tree remains unchanged.

---

## 122. Test/Verification Acceptance

Agent claim:

```text
"tests pass"
```

does not satisfy verification unless actual TestResult evidence exists.

---

## 123. Real Adapter Conformance Tests

Shared adapter conformance suite must pass.

Provider-specific tests must cover mappings and failure modes.

---

## 124. Live Smoke Test

Opt-in only.

Must:

- use a non-critical test repository
- be non-destructive
- document quota usage
- preserve worktree
- avoid production credentials

---

## 125. Phase 6 Exit Criteria

Phase 6 passes when one real executor can safely perform a bounded engineering AgentRun in an isolated worktree and Agent Office truthfully reflects lifecycle, evidence, cancellation, and result.

---

# PHASE 7 — MULTI-EXECUTOR / SECOND PROJECT DOGFOOD

## 126. Phase 7 Goal

Prove Agent Office is not a single-provider or single-repository prototype.

---

## 127. Second Project Acceptance

Register an unrelated repository.

It must not share:

```text
workspaces
Run IDs
Task ownership
session refs
Project configuration
```

with first Project.

---

## 128. Cross-Project Test

Attempt to attach Run/Workspace/Event from Project A to Project B.

Expected:

```text
rejected
```

---

## 129. Second Executor Acceptance

Integrate or configure a second executor when its stable surface is available.

It may initially be read-only.

---

## 130. Mixed Executor Run Acceptance

If policy permits:

```text
Architect → Executor A
Backend   → Executor A
QA        → Executor B
```

must be representable without domain hacks.

---

## 131. Executor Switch Acceptance

Blocked Run due unavailable executor:

```text
choose compatible executor
resume
```

History retains old executor records.

---

## 132. No Silent Fallback Acceptance

Disable primary executor.

Expected:

```text
Run BLOCKED
user action required
```

unless explicit configured fallback exists.

---

## 133. Concurrent Project Acceptance

Project A and Project B may run concurrently within configured global bounds.

Workspaces remain isolated.

---

## 134. Dogfood Scenario A

Use Agent Office on its own repository or another safe project for:

```text
documentation-only change
```

This validates bounded write behavior.

---

## 135. Dogfood Scenario B

Use on an unrelated application for:

```text
small bug fix
```

Workflow:

```text
Explorer
Developer
QA
Verification
```

---

## 136. Dogfood Evidence

For each pilot Run capture:

```text
Run history
AgentRuns
Events
DiffSummary
Tests
Findings
Workspace state
executor state
final integration state
```

---

## 137. Phase 7 Exit Criteria

Phase 7 passes when:

- two Projects work
- at least two executor configurations are representable
- one mixed-executor or executor-switch scenario succeeds
- no cross-project contamination occurs
- workflows remain provider-neutral

---

# PHASE 8 — OFFICE VIEW

## 138. Phase 8 Goal

Add Gather-style visual execution projection without changing workflow authority.

---

## 139. Office View Precondition

Do not begin Office View until operational UI is accepted.

---

## 140. Run Office Route

Required:

```text
/runs/:runId/office
```

Global Office is optional.

---

## 141. Agent Presence Acceptance

Visible working character count must correspond to real instantiated AgentRuns.

No fake workers.

---

## 142. State Mapping Acceptance

At minimum:

```text
PENDING   → inactive/waiting
STARTING  → transitioning
RUNNING   → active at station
WAITING   → waiting indicator
BLOCKED   → blocked indicator
FAILED    → failed indicator
COMPLETED → finished/inactive
```

---

## 143. Event-Driven Animation Acceptance

Animation may react to:

```text
agent.started
agent.waiting
agent.completed
agent.failed
review.finding.created
test.started
test.completed
```

Do not animate fictional behavior.

---

## 144. Office Agent Detail Acceptance

Click character shows real:

```text
role
state
executor
stage
workspace type
started time
last factual activity
```

---

## 145. Office Failure Independence

Break/disable Office renderer.

Expected:

```text
workflow continues
operations UI continues
```

---

## 146. Historical Replay Acceptance

If implemented, replay is explicitly labeled:

```text
Historical replay
```

Not required for MVP.

---

## 147. Asset License Acceptance

Every third-party visual asset has documented license/provenance.

Preferred: original assets.

---

## 148. Office Accessibility Acceptance

All information visible in Office exists in operational views.

Office is not required for:

- cancelling Run
- reviewing Finding
- reading Evidence
- changing executor
- approval

---

## 149. Office Performance Acceptance

At reasonable desktop hardware:

- interaction remains responsive
- no runaway CPU while idle
- event bursts do not create unbounded animation backlog

Exact benchmark may be set during implementation.

---

## 150. Office Visual Quality Gate

Reject if:

- characters imply agents that do not exist
- animation implies progress not supported by Events
- labels are unreadable
- operational status is hidden
- layout requires Office to understand blockers
- asset licensing is unclear

---

## 151. Phase 8 Exit Criteria

Office View passes when it is a truthful, optional, visually useful projection of existing Run state and Events.

---

# CROSS-CUTTING ACCEPTANCE

## 152. Architecture Acceptance

Implementation remains a modular monolith.

Adding executor/provider does not require modifying core domain semantics.

---

## 153. Domain Acceptance

The application can represent:

```text
Project
Task
Run
WorkflowSnapshot
RunStageState
AgentProfile
AgentRun
Executor
Workspace
Event
Finding
Evidence
Artifact
AuditRecord
```

without provider-specific core entities.

---

## 154. Workflow Acceptance

Workflow is deterministic given:

```text
WorkflowSnapshot
ProjectPolicy
Task
normalized Events
factual Evidence
```

---

## 155. Event Acceptance

Events are:

```text
provider-neutral
append-oriented
secret-safe
scoped
versioned
idempotent
```

---

## 156. Security Acceptance

Security tests include:

```text
path traversal
symlink escape
cross-project mismatch
secret redaction
forbidden Git
restricted command approval
unknown cancellation
reviewer mutation
malicious repository instruction
```

---

## 157. Worktree Acceptance

No test or workflow path may use:

```text
git reset --hard
git clean -fd
```

against user repository.

---

## 158. Recovery Acceptance

Restart testing required for:

```text
Project/Task/Run persistence
event history
non-terminal Run
active AgentRun reconciliation
Workspace reconciliation
```

---

## 159. Truthfulness Acceptance

The UI must never fabricate:

```text
progress percentage
test success
security success
token usage
cost
quota
agent activity
merge state
deployment state
```

---

## 160. Observability Acceptance

User can determine:

```text
what happened
when
which agent
which executor
which Project
which Run
what evidence exists
why blocked
```

---

## 161. Performance Acceptance

MVP should remain responsive for:

```text
dozens of Projects
hundreds of Runs
thousands of Events per Run
```

without requiring distributed infrastructure.

Exact performance benchmarks can be established after first implementation.

---

## 162. Database Acceptance

SQLite remains sufficient unless measured evidence proves otherwise.

No migration to external DB solely for architectural fashion.

---

## 163. Dependency Acceptance

Every dependency added has a real need.

Reject dependencies added solely to:

```text
look enterprise
reduce a few lines of straightforward code
introduce unused abstraction
```

---

## 164. Code Quality Acceptance

Code should demonstrate:

- clear naming
- bounded modules
- explicit types
- no giant god service
- no provider-specific core branching
- no hidden background tasks without lifecycle
- no broad exception swallowing
- no placeholder production logic
- no fake sample metrics in real UI

---

## 165. Async Lifecycle Acceptance

No detached long-running task without:

```text
identity
durable state
cancellation semantics
recovery semantics
```

---

## 166. Process Lifecycle Acceptance

CLI executor process must have:

```text
process identity
cwd
Workspace
start time
termination/reconciliation behavior
```

---

## 167. Testing Pyramid

At minimum:

```text
unit tests
application/service tests
repository/infrastructure tests
API tests
frontend component tests
workflow scenario tests
security negative tests
small end-to-end smoke tests
```

---

## 168. No Real Provider in Unit Tests

Normal automated test suite must not consume:

```text
paid quota
real AI provider tokens
real developer repositories
real credentials
```

---

## 169. Temporary Repository Requirement

All destructive/worktree tests use temporary Git repositories.

---

## 170. Coverage

No arbitrary coverage percentage is required for MVP.

Coverage should be used to identify untested critical paths.

Critical state machines and safety logic require explicit tests regardless of aggregate percentage.

---

## 171. Lint Acceptance

New phase must not introduce lint violations in touched code.

---

## 172. Type Safety Acceptance

Backend/frontend type checks pass for supported tooling.

Avoid broad `Any`/`unknown` escapes without justification.

---

## 173. API Error Acceptance

Errors expose:

```text
stable code
safe summary
optional correlation ID
```

No raw stack traces in normal UI.

---

## 174. API Scope Acceptance

Cross-project API lookup should fail safely.

Do not leak existence of unrelated resource in future multi-user mode.

---

## 175. Logging Acceptance

Logs remain useful without containing plaintext secrets.

---

## 176. Audit Acceptance

At minimum audit:

```text
Project created/archived
Run created/cancelled/resumed
executor changed
restricted action approved/denied
risk accepted
Workspace manually released
```

---

## 177. Documentation Acceptance

Implementation changes that alter contracts must update corresponding docs.

Docs and code must not diverge silently.

---

## 178. AGENTS.md Acceptance

Repository-level `AGENTS.md` should instruct coding agents to:

- read relevant specs before coding
- preserve architecture boundaries
- avoid destructive Git
- avoid commits unless requested
- run required verification
- report limitations truthfully
- not invent provider capability
- not implement Office before operational foundation
- not modify unrelated files

---

# RELEASE GATES

## 179. MVP Gate A — Foundation Ready

Required:

```text
Phase 0
Phase 1
Phase 2
```

Result:

Agent Office can register Projects and persist Tasks/Runs.

---

## 180. MVP Gate B — Orchestrator Ready

Required:

```text
Phase 3
```

Result:

ReferenceExecutor proves orchestration, events, retries, blockers, cancellation, and recovery.

---

## 181. MVP Gate C — Safe Write Ready

Required:

```text
Phase 4
```

Result:

Agent Office may safely run write-capable work in isolated worktrees.

No real write executor before this gate.

---

## 182. MVP Gate D — Operations Product Ready

Required:

```text
Phase 5
```

Result:

User can operate the entire ReferenceExecutor workflow through professional UI.

---

## 183. MVP Gate E — Real Executor Ready

Required:

```text
Phase 6
```

Result:

One real executor works through the same architecture safely.

---

## 184. MVP Gate F — Product Generalization Ready

Required:

```text
Phase 7
```

Result:

Agent Office is proven across multiple Projects/executor configurations.

---

## 185. MVP Gate G — Office Ready

Required:

```text
Phase 8
```

Result:

Visual Office accurately reflects real system state.

---

# FINAL MVP ACCEPTANCE

The scenarios below are final product acceptance. They are complete only when
every step is proven, including the evidence steps, which are Phase 4 evidence
acceptance per
`docs/architecture/ADR-0001-phase3-orchestration-evidence-boundary.md`.
Phase 3 does not partially satisfy them, and does not claim to.

---

## 186. End-to-End Scenario 1 — Safe Bug Fix

Given:

```text
Project A
Bug-fix workflow
ReferenceExecutor or real compatible executor
```

When user creates Task:

```text
Fix incorrect validation behavior.
```

Then system demonstrates:

```text
Task created
Run created
Explorer starts
Developer gets isolated worktree
Developer changes files
QA reviews
Tests execute
Evidence created
No blockers remain
Run COMPLETED
Changes remain UNMERGED
Main tree remains untouched
```

---

## 187. End-to-End Scenario 2 — Security Blocker

Given implementation completes.

When Security Reviewer creates BLOCKER:

```text
Run → REMEDIATING
```

Developer remediates.

Reviewer confirms.

Finding becomes:

```text
RESOLVED
```

Verification runs again.

Only then may Run complete.

`Finding RESOLVED` and `Verification runs again` require the Phase 4 Finding
aggregate and real command execution. Within Phase 3 the equivalent orchestration
behaviour is a bounded remediation loop terminated by a clear re-review verdict.
This scenario is not satisfied by Phase 3 alone.

---

## 188. End-to-End Scenario 3 — Executor Unavailable

Given selected executor unavailable.

Expected:

```text
AgentRun does not start
Run BLOCKED
UI explains reason
user may retry or choose compatible executor
```

No silent fallback.

---

## 189. End-to-End Scenario 4 — Unknown Start

Executor submission times out and actual provider state is unknown.

Expected:

```text
no duplicate start
Workspace retained
Run BLOCKED
reconciliation required
```

---

## 190. End-to-End Scenario 5 — Cancellation Race

Agent is writing.

User requests cancellation.

Expected:

```text
cancel request recorded
Workspace retained
execution reconciled
only after confirmed terminal:
  changes captured
  release may occur
```

---

## 191. End-to-End Scenario 6 — Restart

During non-terminal Run:

```text
stop Agent Office
start Agent Office
```

Expected:

```text
Run history present
AgentRun history present
Events present
Workspace state reconciled
external execution reconciled or Run BLOCKED
no duplicate AgentRun
```

---

## 192. End-to-End Scenario 7 — Two Projects

Register Project A and Project B.

Run tasks concurrently.

Expected:

```text
no workspace collision
no Event ownership collision
no session reuse
no Project context leakage
```

---

## 193. End-to-End Scenario 8 — Office Projection

During live Run:

```text
Backend AgentRun RUNNING
QA PENDING
```

Office must show:

```text
Backend active
QA not falsely active
```

When Backend completes:

```text
Office reacts to canonical state/event
```

Workflow itself remains unaffected by Office rendering.

---

# STOP CONDITIONS

## 194. Implementation Must Stop for Review If

Any of the following occurs:

```text
architecture requires destructive main-tree Git
provider integration cannot establish session identity
write execution cannot be isolated
cancellation outcome is unknowable and code attempts cleanup
secrets appear in Events/logs
cross-project ownership is ambiguous
workflow needs provider-specific domain redesign
Office View requires fake status
real provider integration requires undocumented unsafe behavior
```

Do not paper over these with prompt instructions.

---

## 195. Scope Escalation Stop

Stop and review before adding:

```text
Redis
Celery
Kafka
Kubernetes
microservices
Neo4j
cloud database
remote workers
multi-user authentication
production deployment
```

unless measured MVP need exists.

---

# IMPLEMENTATION REPORT CONTRACT

## 196. Coding Agent Completion Report

Every implementation phase report should include:

```text
Scope implemented

Files changed

Architecture decisions

Tests run
- command
- result

Manual verification

Security verification

Known limitations

Deferred items

Git status

Commit status
```

---

## 197. No "Done" Without Evidence

Unacceptable:

```text
Done. Everything works.
```

Required style:

```text
Implemented X.

Verification:
pytest ... → 84 passed
npm test ... → 41 passed
npm run build → passed

Manual:
registered temporary repo
created Run
confirmed worktree path
confirmed main tree unchanged

Known limitation:
cancellation reconciliation not supported by ReferenceExecutor scenario Y
```

---

## 198. Screenshot Review

Frontend milestones should provide screenshots/renders at:

```text
1600
1280
1024
```

for review before acceptance.

---

## 199. Diff Review

Before checkpoint commit:

```text
git status --short
git diff --check
git diff --stat
```

For untracked files, inspect them explicitly because `git diff` alone does not include untracked content.

---

## 200. Commit Policy

During implementation:

```text
no automatic commit unless explicitly requested
no force push
no destructive reset
no clean
```

Checkpoint commits may be created after review.

---

# MVP DEFINITION OF DONE

## 201. Functional Definition of Done

Agent Office MVP is functionally done when:

- multiple Git Projects can be registered
- Tasks/Runs are durable
- WorkflowSnapshot is immutable
- ReferenceExecutor proves orchestration
- normalized Events drive activity
- AgentRuns are observable
- Findings/remediation work
- Evidence/Artifacts work
- worktree isolation works
- cancellation/recovery work
- operational UI works
- at least one real executor works safely
- second Project proves generalization
- Office View truthfully projects real state

---

## 202. Safety Definition of Done

MVP is safety-ready when:

- main user working tree is preserved
- destructive Git is denied
- one writer per writable Workspace is enforced
- unknown execution does not trigger cleanup
- secret redaction tests pass
- traversal/symlink escape tests pass
- cross-project scope tests pass
- reviewer mutation is detected
- real executor secrets are not persisted in ordinary domain data
- localhost remains default

---

## 203. Truthfulness Definition of Done

MVP never invents:

```text
agent progress
tests
security results
quota
cost
merge status
deployment status
executor capability
agent activity
```

Unavailable information is labeled unavailable/unknown.

---

## 204. Product Quality Definition of Done

The product feels like:

```text
engineering operations software
```

not:

```text
AI demo dashboard
```

The user can understand and operate a Run without entering Office View.

---

## 205. Final Acceptance Statement

Agent Office is ready to be called an MVP only when:

```text
it can safely orchestrate real engineering work,
across more than one repository,
through a provider-neutral workflow,
with truthful state,
durable evidence,
controlled filesystem mutation,
recoverable execution,
and an operational UI that remains authoritative
even when the virtual office is absent.
```

---

## 206. Implementation Start Gate

After this document is approved, implementation should begin with:

```text
Phase 1 — Application Foundation
```

The first coding milestone should not connect Codex, Antigravity, or OpenClaw.

It should establish:

```text
backend shell
frontend shell
configuration
SQLite
domain foundations
Project registry skeleton
ReferenceExecutor interface boundary
tests
```

This preserves the architecture before provider-specific complexity enters the codebase.
