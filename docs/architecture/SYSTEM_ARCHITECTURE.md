# Agent Office — System Architecture

Status: Draft  
Version: 0.1  
Architecture Style: Local-first Modular Monolith  
Deployment Target: Developer Workstation  
Primary Integration Model: Adapter-based

---

## 1. Purpose

Agent Office is a standalone engineering control plane for orchestrating AI-assisted software development across multiple repositories and multiple coding-agent runtimes.

It must support multiple projects, reusable workflows, specialized agent roles, isolated worktrees, durable run state, normalized events, review/remediation cycles, engineering evidence, operational monitoring, and an optional virtual-office projection.

Managed repositories such as TDP or Hermes QA remain external projects. Agent Office must not become coupled to any one project.

## 2. Architectural Goals

1. Truthful execution state.
2. Provider neutrality.
3. Project isolation.
4. Safe parallelism.
5. Deterministic workflow transitions.
6. Auditable activity.
7. Bounded autonomy.
8. Local-first operation.
9. Recoverable execution.
10. Extensibility without premature distributed infrastructure.

## 3. High-Level Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                    AGENT OFFICE WEB                          │
│ Projects · Tasks · Runs · Agents · Workflows · Executors   │
│ Activity · Evidence · Audit · Office                        │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTP + Realtime
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                       API LAYER                              │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                    APPLICATION CORE                          │
│ Project Registry · Task Service · Run Coordinator           │
│ Workflow Orchestrator · Agent Run Coordinator               │
│ Executor Policy · Review/Remediation · Verification         │
│ Event Service · Evidence Service · Workspace Coordinator    │
└──────────┬────────────────┬────────────────┬─────────────────┘
           │                │                │
           ▼                ▼                ▼
     Domain Model      Executor Ports   Workspace Ports
                           │                │
                  ┌────────┼────────┐       ▼
                  ▼        ▼        ▼      Git
               Codex   Antigravity OpenClaw Worktree
               Adapter    Adapter   Adapter
```

## 4. Architectural Style

Agent Office starts as a modular monolith. One backend deployment may contain multiple strongly separated modules.

Initial reasons:

- local workstation deployment
- low operational complexity
- transactional workflow state
- easier debugging
- easier executor integration
- no demonstrated need for distributed infrastructure

Do not introduce Kafka, Redis, Kubernetes, microservices, or distributed workflow engines without a concrete requirement.

## 5. Logical Modules

Initial backend modules:

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
```

Modules should communicate through application-level contracts rather than arbitrary cross-module infrastructure imports.

## 6. Project Registry

A Project represents an external Git repository managed by Agent Office.

Project configuration may include:

- stable project ID
- name
- repository path
- repository identity
- default branch
- preferred executor
- default workflow
- project policy
- verification configuration
- archive state

Agent Office stores references and execution metadata, not complete project source code in its database.

## 7. Task and Run Separation

A Task represents user intent. A Run represents one execution attempt.

```text
Task
├── Run 1 — Codex — Failed
└── Run 2 — Codex — Completed
```

This allows retry, alternate executors, alternate workflows, historical comparison, and audit without overwriting prior execution history.

## 8. Workflow Engine

Workflow definitions are declarative and may form a DAG.

```text
Discovery
 ├─ Architect
 └─ Explorer
      ↓
Implementation
 ├─ Backend
 └─ Frontend
      ↓
Review
 ├─ QA
 ├─ Security
 └─ UX
      ↓
Remediation
      ↓
Verification
      ↓
Documentation
```

The workflow engine owns dependency and transition semantics. Individual agents cannot declare the entire Run complete.

## 9. Safe Parallelism

Parallel execution is permitted only when dependencies are satisfied and workspace safety permits it.

Parallel readers may inspect the same repository. Parallel writers should use isolated worktrees. Overlapping write ownership must be serialized or explicitly integrated.

## 10. Agent Role vs Executor

Agent Role and Executor are separate concepts.

Agent Roles:

- Architect
- Explorer
- Backend Developer
- Frontend Developer
- QA
- Security Reviewer
- UX Reviewer
- Documentation Writer

Executors:

- Codex
- Antigravity
- OpenClaw

The role defines responsibility. The executor defines how that role is run.

## 11. Executor Abstraction

Agent Office Core depends on an executor port rather than vendor APIs directly.

Conceptual operations:

```text
capabilities()
start()
send_instruction()
status()
cancel()
events()
result()
```

Concrete implementations may include `CodexAdapter`, `AntigravityAdapter`, and `OpenClawAdapter`.

## 12. Executor Capabilities

Capabilities may include:

```text
STREAM_EVENTS
SUBAGENTS
PARALLEL_AGENTS
TOOL_EVENTS
TOKEN_USAGE
CANCELLATION
SESSION_RESUME
FILE_DIFF
STRUCTURED_RESULT
```

Missing capabilities must be shown as unavailable, never fabricated.

## 13. Executor Selection

Initial deterministic selection:

```text
explicit run executor
        ↓
project preferred executor
        ↓
if unavailable
        ↓
user selection required
```

High-risk work must not silently fall back to another executor.

## 14. Workspace Architecture

```text
Project
   ↓
Run
   ├─ Architect → read-only project view
   ├─ Backend   → isolated worktree
   ├─ Frontend  → isolated worktree
   └─ QA        → read-only implementation view
```

The main project working tree is not the default autonomous write target.

## 15. Worktree Manager

Responsibilities:

- allocate isolated worktree
- associate it with Run/AgentRun
- validate project boundaries
- inspect status
- calculate diff metadata
- release safely
- detect unsafe conditions

Suggested local storage:

```text
~/.agent-office/workspaces/<project-id>/<run-id>/<agent-role>/
```

## 16. Run State Machine

Minimum states:

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

Normal path:

```text
CREATED → PLANNING → READY → RUNNING → REVIEWING → VERIFYING → COMPLETED
```

Remediation loop:

```text
REVIEWING → REMEDIATING → REVIEWING
```

Backend state is authoritative. The frontend must not derive a contradictory workflow state.

## 17. AgentRun State Machine

Minimum states:

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

State changes originate from normalized executor events or explicit orchestration decisions.

## 18. Event Architecture

Provider-specific events are normalized before entering core state.

Examples:

```text
run.created
run.started
run.completed
run.failed
agent.started
agent.waiting
agent.completed
agent.failed
workspace.created
workspace.changed
workspace.released
test.started
test.completed
review.started
review.finding
review.completed
remediation.started
remediation.completed
artifact.created
```

```text
Vendor event → Adapter → Normalized Event → State update + Event Store → Realtime UI
```

## 19. State vs Event

Current state and event history are related but distinct.

```text
Event: agent.started
State: AgentRun.status = RUNNING
```

MVP does not require full event sourcing. Current entity state is persisted explicitly.

## 20. Evidence Architecture

Evidence represents durable engineering proof such as:

- test results
- lint results
- build results
- diff summaries
- review reports
- security findings
- screenshots
- generated documentation

Evidence references its Project, Task, Run, AgentRun when applicable, timestamp, and source.

Large artifact files should live outside SQLite with metadata stored in persistence.

## 21. Review Architecture

Review Findings are first-class records with lifecycle such as:

```text
OPEN
ACKNOWLEDGED
REMEDIATING
RESOLVED
ACCEPTED_RISK
```

Reviewers are read-only by default. Findings normally return to the implementation owner for remediation.

## 22. Verification Gate

A Run may become `COMPLETED` only after workflow-defined completion gates are satisfied.

Stopping an implementation agent is not proof of successful completion.

## 23. Persistence

Initial persistence uses SQLite.

Potential tables:

```text
projects
tasks
runs
workflow_definitions
workflow_stages
agent_profiles
agent_runs
executors
events
findings
evidence
workspaces
audit_events
```

Exact schema belongs in `DOMAIN_MODEL.md`.

## 24. Local Storage

Suggested layout:

```text
~/.agent-office/
├── data/agent-office.sqlite
├── artifacts/<project-id>/<run-id>/...
├── workspaces/...
└── logs/...
```

Secrets must not be stored in ordinary project configuration.

## 25. Realtime Architecture

Initial preference is REST for mutations and Server-Sent Events for server-to-browser operational updates.

WebSocket may be introduced later if genuine bidirectional realtime requirements appear.

## 26. API Boundary

Initial resource groups may include:

```text
/api/projects
/api/tasks
/api/runs
/api/workflows
/api/agents
/api/executors
/api/events
/api/findings
/api/evidence
/api/audit
```

APIs expose safe DTOs. Raw provider payloads do not automatically leak through responses.

## 27. Frontend Architecture

Initial direction:

```text
React
TypeScript
Vite
```

Primary surfaces:

```text
Projects
Tasks
Runs
Agents
Workflows
Executors
Activity
Evidence
Office
Settings
Audit
```

The frontend consumes canonical backend state rather than owning workflow truth.

## 28. Operations View

Run detail should expose:

```text
Overview
Workflow
Agents
Activity
Changes
Tests
Findings
Evidence
Office
```

Operational information takes precedence over decorative visualization.

## 29. Office View

Office View is a projection over authoritative AgentRun and Event state.

Example projection:

```text
PENDING   → waiting area
STARTING  → moving to station
RUNNING   → active at workstation
WAITING   → waiting indicator
BLOCKED   → blocked indicator
FAILED    → failure indicator
COMPLETED → finished/inactive state
```

Office View never fabricates activity and never mutates workflow truth.

## 30. Multi-Project Isolation

Every Run belongs to exactly one Project. Every workspace action is scoped by Project identity.

A task for Project A must never execute against Project B.

## 31. Project Onboarding

Initial onboarding:

```text
Select local repository
→ validate Git repository
→ detect basic metadata
→ user confirms
→ create Project
```

Future detection may include languages, package managers, tests, lint commands, and project instructions. Detected data remains reviewable.

## 32. Security Boundary

Executors are external capability-bearing systems.

```text
Agent Office Core → Executor Adapter → External AI Runtime
```

Data crossing the boundary must be intentional, bounded, attributable, and sanitized where needed.

## 33. Command Policy

Agent Office distinguishes allowed, restricted, and forbidden commands.

Forbidden by default include:

```text
git reset --hard
git clean -fd
git push --force
rm -rf outside workspace
```

Safety must not rely only on natural-language model instructions when enforceable controls are possible.

## 34. Network Policy

MVP is localhost-first and should bind to `127.0.0.1` by default.

Remote exposure is outside initial MVP unless explicitly configured.

## 35. Failure, Cancellation, and Recovery

Agent failure must preserve durable Run state.

Cancellation distinguishes requested, acknowledged, and actually terminated states.

Workspace cleanup occurs only when safe.

After restart, Project, Task, Run, AgentRun, Event, Finding, and Evidence records remain available.

Potentially side-effecting orphaned executions must not be automatically rerun when their actual external state is uncertain.

## 36. Logging and Audit

Logs must avoid secrets, authorization values, raw provider credentials, unnecessary source dumps, and private environment variables.

Audit records capture important human/system actions such as Project creation, Run creation, executor changes, cancellations, finding acceptance, policy overrides, and workspace release.

Operational events and audit events are related but distinct.

## 37. Extension Points

Initial extension points:

```text
ExecutorAdapter
WorkflowDefinition
AgentProfile
ProjectPolicy
EvidenceProducer
OfficeRenderer
```

## 38. Deployment Model

Initial deployment:

```text
Developer Mac
├── Agent Office Backend
├── Agent Office Frontend
├── SQLite
├── Artifact Store
├── Git Worktrees
├── optional Codex runtime
├── optional Antigravity runtime
└── optional OpenClaw runtime
```

Not every executor must be installed simultaneously.

## 39. Example Multi-Project Deployment

```text
Agent Office
├── TDP
│   ├── preferred executor: Codex
│   └── workflow: enterprise-engineering
├── Hermes QA Dashboard
│   ├── preferred executor: Antigravity
│   └── workflow: web-application
└── Small Utility
    ├── preferred executor: OpenClaw
    └── workflow: bug-fix
```

## 40. Dependency Direction

Preferred dependency direction:

```text
Presentation → Application → Domain
Infrastructure → Application Ports
```

Domain must not depend on FastAPI, SQLite, Codex SDKs, Antigravity, OpenClaw, React, or Git CLI implementation details.

## 41. Suggested Backend Shape

```text
src/agent_office/
├── projects/
├── tasks/
├── runs/
├── workflows/
├── agents/
├── executors/
├── workspaces/
├── events/
├── reviews/
├── evidence/
├── audit/
└── shared/
```

Use domain/application/infrastructure/presentation separation where complexity justifies it; do not create empty layers merely for symmetry.

## 42. Suggested Frontend Shape

```text
frontend/src/
├── app/
├── projects/
├── tasks/
├── runs/
├── agents/
├── workflows/
├── executors/
├── activity/
├── evidence/
├── office/
└── shared/
```

Frontend organization should follow product domains.

## 43. Initial Technology Direction

Recommended starting point:

```text
Backend: Python 3.12+, FastAPI, Pydantic, SQLite
Frontend: React, TypeScript, Vite
Testing: pytest, Vitest, React Testing Library
Browser validation: Playwright when needed
Git: native Git CLI behind workspace abstraction
```

These are implementation recommendations rather than immutable product requirements.

## 44. Architectural Decisions

### No distributed queue initially
Do not add Redis/Celery solely because the product contains jobs.

### No vendor-specific domain types
Prefer `Run`, `AgentRun`, and `ExecutorRef` over `CodexRun`, `AntigravityTask`, or `OpenClawAgent`.

### No fake universal capability
Capabilities are explicit and may differ by executor.

### Operations first, Office second
Implementation order is Domain → Workflow → Events → Executor → Worktree → Operations UI → Office UI.

### Standalone product
Agent Office remains independently deployable and is not a TDP module.

## 45. Future TDP Integration

Potential future relationship:

```text
Agent Office
   ├── implementation evidence
   ├── QA evidence
   ├── security findings
   └── documentation evidence
            ↓
           TDP
    Evidence / Governance
```

This is outside Agent Office MVP.

## 46. Scalability Boundary

Initial target:

- single workstation
- single primary user
- multiple repositories
- bounded concurrent local AgentRuns

Remote workers, central databases, organization RBAC, and distributed orchestration are future concerns only if justified.

## 47. Quality Attributes

- Reliability: durable state and explicit failures.
- Security: least privilege and controlled execution.
- Auditability: important transitions are attributable.
- Extensibility: executor and workflow adapters.
- Usability: one coherent operational view.
- Maintainability: modular monolith with clear boundaries.
- Truthfulness: no fabricated execution information.

## 48. Primary Architectural Invariants

1. Every Run belongs to exactly one Project.
2. Every AgentRun belongs to exactly one Run.
3. Agent Role is not Executor.
4. UI does not own workflow truth.
5. Office View does not own workflow truth.
6. Provider events are normalized before entering core state.
7. Reviewer findings are durable.
8. Write-capable parallel agents use isolated workspaces.
9. Main project worktree is not the default autonomous write target.
10. Missing executor capabilities are not fabricated.
11. A stopped agent does not automatically mean a successful Run.
12. Run completion requires workflow-defined gates.
13. Dangerous Git operations are forbidden by default.
14. Secrets must not appear in ordinary project configuration or event payloads.
15. Project boundaries must be preserved throughout execution.
16. Normal executor changes must not require redesigning core domain models.

## 49. Next Documents

This architecture is refined by:

```text
DOMAIN_MODEL.md
WORKFLOW_CONTRACT.md
EVENT_CONTRACT.md
EXECUTOR_ADAPTER.md
WORKTREE_POLICY.md
SECURITY_MODEL.md
INFORMATION_ARCHITECTURE.md
MVP_ACCEPTANCE.md
```

These documents must remain consistent with the invariants above.


## 37. Phase 9 Planning Architecture

Phase 9 introduces a second durable application boundary alongside operational
execution.

```text
Universal Composer UI
        │
        ▼
Planning API
        │
        ▼
Planning Application Services
├── ComposerThreadService
├── TeamProposalService
├── PlanningArtifactService
├── RequirementService
└── PlanningEventService
        │
        ├──────────────► AuditService
        │                 explicit requirement decisions
        ▼
Planning Persistence
├── composer_threads
├── composer_messages
├── team_proposals
├── team_proposal_members
├── planning_artifacts
├── requirement_candidates
└── planning_events
```

This boundary is intentionally independent from:

```text
Run Coordinator
Workflow Orchestrator
AgentRun Coordinator
Workspace Coordinator
Operational Event Store
```

### Realtime boundary

Planning updates use a dedicated planning event endpoint:

```text
/api/composer/threads/{thread_id}/events
/api/composer/threads/{thread_id}/events/stream
```

This stream is separate from Run Event SSE.

The frontend must not merge the two histories into one canonical event model.

### Persistence version

Phase 9B advances SQLite schema version:

```text
v10 → v11
```

The migration is additive and retains all existing operational tables.

### PlanningRuntime port

The application core depends on a PlanningRuntime protocol rather than a provider
SDK.

Conceptual operations:

```text
describe_capabilities()
contribute(role_key, instruction)
cancel()
```

Phase 9B ships only a deterministic ReferencePlanningRuntime.

A real planning adapter in a later phase must prove read-only repository access.
A provider that cannot enforce the required boundary must not be silently used
for planning.

### Security

Planning content has bounded size and rejects secret-bearing structured keys.

Project-scoped requirements and PlanningEvents are storage-enforced to match the
owning ComposerThread Project.

Planning does not receive Workspace write authority.

### Promotion boundary

Phase 9B does not promote a RequirementCandidate into Task/Run execution.

The future bridge is conceptually:

```text
ComposerThread
→ APPROVED RequirementCandidate
→ explicit ExecutionProposal
→ explicit user Start Run
→ Task / Run
```

That bridge belongs to a later Phase 9 slice.

### Phase 9C interaction lifecycle

Phase 9C wires the Office Universal Composer to the durable planning boundary:

    Project Registry
          │
          ▼
    Universal Composer
          │  create/recover ComposerThread
          │  append ComposerMessage
          ▼
    Deterministic IntentResolver
          │
          ▼
    DynamicTeamFormationService
          │
          ├── INCLUDED roles
          ├── DEFERRED roles
          └── EXCLUDED roles + concise reason
          │
          ▼
    Planning artifacts / Decision Queue
          │
          ▼
    Bottom Operations Dock

On Project entry or browser reload, the frontend reconstructs its planning view
from persisted truth rather than React-only state:

    GET Project ComposerThreads
    → select latest persisted thread
    → load messages
    → load TeamProposals
    → load PlanningArtifacts
    → load RequirementCandidates
    → load PlanningEvents

A user may reopen another persisted thread through the Composer planning-history
selector. Selecting "New planning thread" clears the active planning snapshot
without deleting history.

This rehydration is read-only. It does not create or infer Run, AgentRun,
Workspace, operational Event, Finding, or Evidence records.

The deterministic Phase 9C Project Re-entry Brief records unavailable
repository-derived facts as NOT_INSPECTED_IN_PHASE_9C. Phase 9D owns bounded
read-only repository context resolution; Phase 9E owns approved-requirement
promotion into execution.

