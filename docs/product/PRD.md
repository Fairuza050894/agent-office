# Agent Office — Product Requirements Document

Status: Draft
Version: 0.1
Product Type: Local-first Multi-Agent Engineering Control Plane
Primary Mode: Standalone application
Initial Target: macOS developer workstation
Repository Scope: Multi-project
Executor Scope: Multi-provider / multi-agent runtime

---

## 1. Product Summary

Agent Office is a local-first engineering control plane for managing AI-assisted software development across multiple repositories and multiple coding-agent executors.

It provides one place to:

- register software projects
- create engineering tasks
- choose an AI executor
- execute structured multi-agent workflows
- isolate parallel implementation work
- monitor agent activity
- capture tests and review findings
- manage remediation cycles
- preserve engineering evidence
- inspect execution history
- visualize active agents through both operational and virtual-office views

Agent Office is not tied to one repository, one programming language, or one AI provider.

Example supported projects may include:

- Technical Documentation Platform
- QA automation platforms
- backend services
- frontend applications
- internal tools
- new repositories added later

Example executor integrations may include:

- Codex
- Antigravity
- OpenClaw
- future compatible agent runtimes

The core product must remain executor-neutral.

---

## 2. Product Vision

The product should allow a user to provide an engineering objective such as:

"Improve API authentication, test it, review security, and update documentation."

Agent Office should then coordinate an appropriate workflow such as:

User
  ↓
Orchestrator
  ↓
Architect + Explorer
  ↓
Backend / Frontend
  ↓
QA + Security + UX
  ↓
Remediation when required
  ↓
Documentation
  ↓
Final Verification

The user should be able to observe the real state of this workflow without manually managing every individual agent conversation.

---

## 3. Problem Statement

Modern AI coding tools are powerful but fragmented.

A user may use different agents for:

- architecture
- implementation
- testing
- UI/UX review
- security review
- documentation

However, these activities often happen in separate conversations without a common execution model.

Common problems include:

- multiple agents editing the same working tree
- unclear ownership of files
- duplicated or conflicting changes
- tests performed by the same agent that wrote the code
- reviewers silently changing implementation
- missing audit history
- fake or ambiguous progress indicators
- difficulty knowing which agent is currently working
- difficulty switching between Codex, Antigravity, OpenClaw, or future runtimes
- project-specific prompts repeatedly rewritten from scratch
- no centralized record of findings, tests, artifacts, or remediation
- context lost between agents
- no safe multi-project control plane

Agent Office addresses these problems by separating:

- project
- task
- workflow
- agent role
- executor
- workspace
- events
- findings
- evidence

---

## 4. Product Principles

### 4.1 Truthful State

The system must never fabricate:

- agent progress
- completion percentage
- test results
- review results
- token usage
- file changes
- executor availability
- architecture findings

If an executor only reports RUNNING, the UI must show RUNNING.

It must not invent "72% complete."

### 4.2 Evidence Before Presentation

Visualizations must be projections of real execution state.

The Office View must not maintain an independent fictional state.

Example:

agent.started
  ↓
AgentRun = RUNNING
  ↓
Operations UI = Running
  ↓
Office View = agent works at desk

### 4.3 Executor Neutrality

Agent Office Core must not depend directly on Codex, Antigravity, OpenClaw, or another vendor.

Provider-specific behavior belongs behind executor adapters.

### 4.4 Multi-Project by Design

One installation must support multiple repositories.

Each project can have:

- its own repository
- preferred executor
- workflow defaults
- agent roles
- verification commands
- security policies

### 4.5 Controlled Autonomy

Agents may automate engineering work, but critical transitions must remain governed by explicit policy.

High-risk operations must not happen merely because an AI agent requested them.

### 4.6 Precision Over Agent Theater

The product is an engineering tool, not an AI company simulator.

Do not introduce roles merely for visual appeal.

Only spawn agents that materially contribute to the current task.

### 4.7 Independent Review

Implementation and verification should be separable.

Where practical:

Developer Agent
  ↓
Independent QA Agent

rather than:

Developer Agent
  ↓
Developer Agent reviews itself

### 4.8 Safe Parallelism

Parallel agents may inspect the same project.

Parallel write agents must use isolated workspaces/worktrees unless explicitly proven safe.

---

## 5. Primary Users

### 5.1 Solo Developer / Vibe Coder

Wants to:

- give a high-level task
- avoid manually coordinating multiple AI agents
- review consolidated results
- see progress visually
- retain control over dangerous operations

### 5.2 Technical Lead

Wants to:

- define workflows
- enforce review stages
- control implementation boundaries
- inspect diffs
- inspect test results
- identify unresolved findings

### 5.3 QA / Reviewer

Wants to:

- independently validate implementation
- record findings
- verify remediation
- inspect test evidence

### 5.4 Engineering Manager

Wants to:

- understand active work
- see blocked tasks
- inspect execution history
- review engineering evidence without reading every agent conversation

---

## 6. Core Concepts

### Project

A registered software repository managed by Agent Office.

### Task

A user-defined engineering objective.

Example:

"Improve FastAPI architecture extraction accuracy."

### Run

One execution attempt of a Task using a selected workflow and executor configuration.

### Workflow

A directed sequence or graph of engineering stages.

Example:

Discovery
  ↓
Implementation
  ↓
Review
  ↓
Remediation
  ↓
Verification

### Agent Role

A reusable responsibility definition.

Examples:

- Architect
- Explorer
- Backend Developer
- Frontend Developer
- QA
- Security Reviewer
- UX Reviewer
- Documentation Writer

### Executor

The runtime capable of executing an Agent Role.

Examples:

- Codex
- Antigravity
- OpenClaw

### AgentRun

One execution instance of an Agent Role within a Run.

### Workspace

The filesystem context used for an AgentRun.

### Worktree

An isolated Git working tree used by write-capable agents.

### Event

An immutable record of something that happened during a Run.

### Finding

A review issue produced by QA, Security, UX, Architecture, or another reviewer.

### Evidence

A persisted artifact supporting a claim about the run.

Examples:

- test output
- diff summary
- lint result
- review report
- build result

---

## 7. Project Registry

Users must be able to register multiple local repositories.

Minimum project information:

- project ID
- project name
- repository path
- default branch
- preferred executor
- default workflow profile
- created timestamp
- archived timestamp

The system must not copy entire repositories into its database.

Repository contents remain in Git/worktree storage.

---

## 8. Task Creation

A user must be able to create a task by providing:

- project
- objective
- optional constraints
- executor selection
- workflow profile

Example:

Project:
Technical Documentation Platform

Task:
Improve real-repository FastAPI extraction accuracy.

Executor:
Codex

Workflow:
Enterprise Engineering

The task description must remain available throughout all agent stages.

---

## 9. Executor Selection

Supported selection modes:

- explicit executor
- project preferred executor
- future AUTO policy

Initial AUTO behavior must remain deterministic.

Example:

1. use requested executor when available
2. otherwise use project preferred executor
3. if unavailable, require user action

The system must not silently switch an important run to another executor.

A future low-risk fallback policy may be added separately.

---

## 10. Agent Roles

Initial reusable roles:

### Architect

Responsibilities:

- inspect architecture
- review boundaries
- identify implementation constraints
- identify design risks

Default:
read-only

### Explorer

Responsibilities:

- inspect repository
- identify relevant files and patterns
- locate tests and configuration
- report existing implementation

Default:
read-only

### Backend Developer

Responsibilities:

- implement approved backend changes
- run targeted backend validation

Default:
write-capable isolated worktree

### Frontend Developer

Responsibilities:

- implement approved frontend changes
- run frontend validation

Default:
write-capable isolated worktree

### QA

Responsibilities:

- independently inspect implementation
- execute tests
- identify regressions
- create findings

Default:
read-only unless explicitly permitted

### Security Reviewer

Responsibilities:

- review authorization
- credential handling
- filesystem safety
- network exposure
- destructive operations

Default:
read-only

### UX Reviewer

Responsibilities:

- inspect rendered UI
- detect layout, hierarchy, accessibility, and interaction issues
- create findings

Default:
read-only

### Documentation Writer

Responsibilities:

- update documentation after implementation stabilizes
- document actual behavior only

Default:
bounded write

---

## 11. Workflow Profiles

Agent Office must support reusable workflow profiles.

### Enterprise Engineering

Discovery:
- Architect
- Explorer

Implementation:
- Backend Developer
- Frontend Developer
  when applicable

Review:
- QA
- Security
- UX when UI changed

Remediation:
- implementation owner

Documentation:
- Documentation Writer

Verification:
- final validation

### Bug Fix

Explorer
  ↓
Developer
  ↓
QA
  ↓
Complete

### Documentation

Explorer
  ↓
Documentation Writer
  ↓
Reviewer

Workflow profiles must not require every agent role.

---

## 12. Run Lifecycle

Minimum Run states:

CREATED
PLANNING
READY
RUNNING
REVIEWING
REMEDIATING
VERIFYING
COMPLETED

Alternative terminal/interruption states:

BLOCKED
FAILED
CANCELLED

State transitions must be authoritative in the backend.

Frontend components must not infer workflow state independently.

---

## 13. AgentRun Lifecycle

Minimum AgentRun states:

PENDING
STARTING
RUNNING
WAITING
COMPLETED
FAILED
BLOCKED
CANCELLED

An AgentRun must record:

- role
- executor
- start time
- completion time
- workspace/worktree
- status
- result summary

---

## 14. Review and Remediation

Reviewer findings must be first-class records.

Minimum severity:

INFO
WARNING
BLOCKER

Example:

Security Reviewer
  ↓
BLOCKER
"Authorization check missing"

A BLOCKER may transition:

REVIEWING
  ↓
REMEDIATING
  ↓
REVIEWING

Review agents should not silently modify the implementation they are reviewing.

Fixes should normally return to the implementation owner.

---

## 15. Worktree Isolation

Write-capable concurrent agents must use isolated Git worktrees.

Example:

project/
  main-working-tree

agent-office-workspaces/
  run-001/
    backend/
    frontend/

Default policies:

- no autonomous force push
- no autonomous git clean
- no autonomous destructive reset
- no write agent directly modifies another active agent worktree
- no automatic merge in MVP
- no automatic commit unless explicitly enabled

Review agents may inspect an implementation worktree read-only.

---

## 16. Event Model

All meaningful runtime activity should produce normalized Agent Office events.

Examples:

- run.created
- run.started
- run.completed
- run.failed

- agent.started
- agent.waiting
- agent.completed
- agent.failed

- workspace.created
- workspace.changed

- test.started
- test.completed

- review.started
- review.finding
- review.completed

- remediation.started
- remediation.completed

- artifact.created

Events must:

- include timestamp
- include run identity
- identify source agent when applicable
- be append-oriented
- avoid exposing secrets

The event model must remain vendor-neutral.

---

## 17. Executor Adapter

Each external coding runtime must implement a common Agent Office contract.

Conceptual operations:

- inspect capabilities
- start execution
- send instruction
- obtain status
- cancel execution
- stream or poll supported events
- collect result

Initial adapters planned:

- CodexAdapter
- AntigravityAdapter
- OpenClawAdapter

Not every executor will expose identical capabilities.

The UI and orchestration engine must respect capability differences.

Missing capability must be displayed as unavailable rather than fabricated.

---

## 18. Operations UI

Agent Office must provide a professional operations interface.

Primary areas:

- Projects
- Tasks
- Runs
- Agents
- Workflows
- Executors
- Activity
- Evidence
- Settings
- Audit

The main interface must prioritize engineering information over decorative visualization.

---

## 19. Run Detail

A Run should expose:

Overview

Workflow

Agents

Activity

Changes

Tests

Findings

Evidence

Office

The same authoritative Run state must feed every view.

---

## 20. Office View

Office View provides a Gather-style visualization of active agent roles.

It is not the workflow engine.

It is a projection of authoritative backend state.

Examples:

PENDING
→ agent waiting

RUNNING
→ agent working

WAITING
→ agent waiting for dependency

FAILED
→ agent visibly blocked/error state

COMPLETED
→ agent finished

The Office View must not generate fake:

- typing
- progress
- testing
- collaboration
- activity

without corresponding runtime events.

---

## 21. Evidence

Agent Office should preserve useful engineering evidence.

Initial evidence examples:

- changed file summary
- Git diff metadata
- test results
- lint results
- type-check result
- build result
- reviewer findings
- remediation result
- final verification

Evidence must reference its originating run and agent.

---

## 22. Security Requirements

Agent Office is security-sensitive because executors may access:

- source code
- local filesystem
- shell
- Git
- network
- credentials

MVP security requirements:

- localhost-first deployment
- no plaintext credential exposure through UI
- executor secrets separated from project config
- sanitized logs/events
- restricted filesystem scope
- worktree containment
- destructive Git command protection
- explicit authorization for sensitive operations
- no arbitrary public network exposure by default

---

## 23. Non-Goals for MVP

MVP will not attempt to provide:

- autonomous software company simulation
- human-resource simulation
- fake team productivity metrics
- fully autonomous production deployment
- automatic force merge
- arbitrary cloud execution
- Kubernetes orchestration
- distributed event infrastructure
- universal AI model routing
- billing management
- enterprise SSO
- organization-wide RBAC
- remote multi-user collaboration

These may be considered later.

---

## 24. Technical Direction

Initial recommended architecture:

Backend:
Python
FastAPI

Persistence:
SQLite

Frontend:
React
TypeScript

Realtime:
SSE or WebSocket after contract evaluation

Repository isolation:
Git worktree

Architecture:
modular monolith

Avoid premature introduction of:

- Kafka
- Redis
- Kubernetes
- Neo4j
- distributed microservices

until an actual requirement justifies them.

---

## 25. MVP Delivery Phases

> **Delivery-contract note.** This section is the original product-sequencing
> sketch. The authoritative delivery contract is the phase map in
> `docs/product/MVP_ACCEPTANCE.md` §6, which the accepted Phase 1 and Phase 2
> verification records follow. The two lists differ in numbering:
>
> ```text
> PRD §25                        MVP_ACCEPTANCE §6
> Phase 1  Foundation        →   Phase 1  Application Foundation
> Phase 2  Orchestration     →   Phase 3  Workflow + ReferenceExecutor + Events
> Phase 3  Git Isolation     →   Phase 4  Worktree Safety + Evidence + Review
> Phase 4  Real Executor     →   Phase 6  First Real Executor
> Phase 5  Multi-Executor    →   Phase 7  Multi-Executor / Second Project Dogfood
> Phase 6  Operations Maturity → Phase 5  Operational Frontend
> Phase 7  Office View       →   Phase 8  Office View
> ```
>
> Neither numbering is renumbered here. Where this section lists an outcome that
> depends on durable Findings or Evidence — `review findings` and
> `remediation loops` — the boundary in
> `docs/architecture/ADR-0001-phase3-orchestration-evidence-boundary.md` applies:
> orchestration of those loops is delivered with the ReferenceExecutor workflow
> milestone, while the durable Finding and Evidence aggregates are delivered by
> the worktree/evidence milestone.

### Phase 0 — Specification

Produce:

- PRD
- System Architecture
- Domain Model
- Workflow Contract
- Event Contract
- Executor Adapter Contract
- Worktree Policy
- Security Model
- UX Information Architecture
- Acceptance Criteria

No application code required.

### Phase 1 — Foundation

Implement:

- Project Registry
- Task
- Run
- AgentRun
- Workflow definitions
- Event store
- SQLite persistence
- REST API
- initial frontend

Use a ReferenceExecutor.

### Phase 2 — Orchestration

Implement:

- workflow transitions
- dependency handling
- review findings
- remediation loops
- verification gates

### Phase 3 — Git Isolation

Implement:

- worktree manager
- write ownership
- workspace lifecycle
- diff/change capture

### Phase 4 — Real Executor

Implement the first real supported executor adapter.

Selection between Codex and Antigravity will depend on the most reliable integration contract available during implementation.

### Phase 5 — Multi-Executor

Add additional executor adapters without changing core workflow semantics.

### Phase 6 — Operations Maturity

Add:

- richer activity view
- evidence browser
- executor health
- failure recovery
- audit history

### Phase 7 — Office View

Add the virtual-office visualization driven entirely from real run events.

---

## 26. MVP Success Criteria

Agent Office MVP is successful when a user can:

1. register multiple repositories
2. create a task for one selected project
3. choose a workflow
4. choose an executor configuration
5. create a Run
6. execute logical AgentRuns
7. observe authoritative state changes
8. isolate concurrent write work
9. capture agent events
10. capture test results
11. capture review findings
12. perform a remediation cycle
13. complete final verification
14. inspect historical execution
15. view the same run in Operations UI
16. view the same run in Office View without fabricated activity

---

## 27. Initial Pilot Projects

The initial pilot should include at least:

### Technical Documentation Platform

Used to validate:

- architecture-heavy workflows
- backend/frontend changes
- QA
- security review
- documentation
- large repository context

### A Second Independent Repository

Used to prove:

- Agent Office is not TDP-specific
- project configuration is isolated
- workflows can differ
- executor choice can differ

---

## 28. Long-Term Direction

Potential future capabilities include:

- automatic workflow recommendation
- executor capability scoring
- cost/token observability
- remote execution workers
- approval gates
- release readiness
- engineering policy packs
- connected issue trackers
- GitHub/GitLab integration
- pull request lifecycle
- project templates
- reusable organization policies
- AI engineering audit trails
- integration with TDP Evidence Vault
- release evidence generated from agent activity

These are future directions, not MVP requirements.

---

## 29. Product Boundary

Agent Office owns:

- orchestration
- agent lifecycle
- workflow state
- executor abstraction
- workspace coordination
- engineering execution evidence
- agent operations visualization

Individual software projects own:

- application source code
- application architecture
- project-specific tests
- project-specific build tools
- project-specific deployment
- project-specific documentation

Agent Office must not become tightly coupled to any one project's domain.

---

## 30. Final Product Principle

Agent Office should answer five questions reliably:

1. What engineering work is being performed?
2. Which agent is responsible for each part?
3. Which executor is actually running that agent?
4. What evidence proves the work was implemented and reviewed?
5. What still blocks completion?

If Agent Office cannot prove an activity happened, it must not present that activity as fact.
