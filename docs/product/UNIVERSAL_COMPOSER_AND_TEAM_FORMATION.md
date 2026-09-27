# Universal Composer and Dynamic Team Formation

Status: Proposed
Parent concept: `docs/product/AGENT_OFFICE_VNEXT_CONCEPT.md`
Implementation status: not started

---

## 1. Goal

Universal Composer becomes the primary entry point for interacting with Agent Office.

It should feel natural to:

- ask a question about an existing Project
- return to a Project after weeks or months
- discover the current repository state
- brainstorm requirements
- convert approved requirements into engineering work
- monitor the team as work moves between planning, implementation, review, verification, and documentation

The user should not have to decide which AI persona to invoke manually for every step.

Agent Office proposes an appropriate temporary team.

---

## 2. Composer intents

```text
AUTO
ASK
PLAN
BRAINSTORM
RUN
```

### AUTO

Default.

Classifies the user's intent and explains the proposed next mode.

AUTO may transition freely into ASK or prepare PLAN/BRAINSTORM proposals.

AUTO must stop at an explicit execution confirmation before repository-changing RUN behavior.

### ASK

Read-only answer using selected Project context.

### PLAN

Discovery + structured scope proposal without implementation.

### BRAINSTORM

Persistent multi-role ideation session producing planning artifacts.

### RUN

Execution of sufficiently clear, approved scope.

---

## 3. Scope model

Composer context should be explicit and inspectable.

Minimum context:

```text
Project
Intent
Instruction
```

Optional context:

```text
Branch
Workflow
Executor
Task
Run
Finding
Evidence
RequirementCandidate
file / directory
external issue / PR when integrated
```

Repository mutation is allowed only inside a registered Project scope and existing Agent Office safety boundaries.

---

## 4. vNext role catalog

| Role | Primary responsibility | Typical phase |
| --- | --- | --- |
| Product Manager | problem, scope, requirements, product questions | planning |
| System Analyst | repository/current-state truth, impact discovery | discovery |
| Principal Engineer | architecture, technical strategy, constraints | planning/review |
| Product Designer | UX/UI flow and experience | conditional planning |
| Backend Engineer | backend implementation | implementation |
| Frontend Engineer | frontend implementation | implementation |
| QA Engineer | acceptance strategy + independent verification | planning/review |
| Security Reviewer | security risk and independent security review | conditional |
| Technical Writer | requirement traceability and documentation | planning/final |

The human user is the final Product Owner / Approver.

---

## 5. Non-persona system components

These remain visible in technical state where useful, but do not appear as human-like office employees:

- Orchestrator
- Verification Gate
- Workspace Manager
- Event Store
- Scheduler
- Executor Adapter

The system must not anthropomorphize infrastructure merely to create more characters.

---

## 6. Team formation contract

Team formation must prefer minimum sufficient participation.

The proposal should include a reason for each role.

Example:

```text
Planning Cell

Product Manager
Included: objective and requirement scope are unclear.

System Analyst
Included: Project has not been inspected recently.

Principal Engineer
Included: likely architectural impact.

Product Designer
Not activated: no user-facing change detected yet.

Backend Engineer
Not activated: implementation scope is not approved.

Frontend Engineer
Not activated: implementation scope is not approved.

QA Engineer
Consult later: define acceptance scenarios after candidate requirements exist.

Security Reviewer
Not activated: no security-sensitive scope identified.

Technical Writer
Join after approval: documentation impact expected.
```

This explanation is product output, not hidden model reasoning.

---

## 7. Team formation heuristics

The first implementation may use deterministic rules before adding any learned planner.

Examples:

### Documentation-only request

```text
Technical Writer
+ Verification Gate
```

### Simple isolated backend bug

```text
System Analyst
→ Backend Engineer
→ QA Engineer
→ Verification Gate
```

### UX-heavy frontend redesign

```text
Product Manager
+ System Analyst
+ Product Designer
+ Principal Engineer when architecture is affected
→ user approval
→ Frontend Engineer
→ QA Engineer
→ Technical Writer when docs change
→ Verification Gate
```

### Authentication / authorization change

```text
Product Manager
+ System Analyst
+ Principal Engineer
+ Security Reviewer
→ user approval
→ Backend Engineer
+ Frontend Engineer when required
→ QA Engineer
+ Security Reviewer
→ Verification Gate
→ Technical Writer
```

---

## 8. Project re-entry workflow

This is a first-class use case.

User:

```text
Project: Technical Documentation Platform

"Continue TDP. We have not handled it for a while.
Review what exists now and decide what should be worked on next."
```

Expected behavior:

1. AUTO classifies request as PLAN.
2. No implementation AgentRun starts.
3. Agent Office forms a Planning Cell:
   - Product Manager
   - System Analyst
   - Principal Engineer
4. Project history and repository truth are inspected.
5. Conditional roles are added only if evidence requires them.
6. Agent Office produces a Project Re-entry Brief.
7. RequirementCandidates are presented to the user.
8. User approves / edits / rejects / defers.
9. Agent Office proposes an execution team for approved requirements.
10. User explicitly starts the Run.

---

## 9. Project Re-entry Brief

Recommended sections:

```text
Project identity
Last known meaningful work
Current repository state
Current architecture / dependencies
Observed gaps
Technical debt relevant to requested objective
Requirement candidates
Open questions
Risks
Proposed implementation scope
Roles required for implementation
Roles required for independent review
Documentation impact
Verification plan
```

Every statement about current repository state should be grounded in inspected Project context rather than stale conversational assumptions.

---

## 10. Requirement lifecycle

```text
PROPOSED
   ↓
APPROVED | REJECTED | DEFERRED
```

Only the user may perform approval actions in the initial implementation.

Approved RequirementCandidates may become:

- Task input
- Run scope
- PRD update
- implementation acceptance criteria

Changing approved requirement scope after a Run starts should create an explicit scope change rather than silently mutating the original requirement.

---

## 11. Planning cell vs execution team

These are intentionally different concepts.

### Planning Cell

Temporary group used to understand and shape work.

Typical members:

- Product Manager
- System Analyst
- Principal Engineer
- Product Designer when needed
- QA / Security as early consultants when risk warrants

### Execution Team

Roles instantiated only after approved scope exists.

Typical members:

- Backend Engineer
- Frontend Engineer
- other future implementation specialists

### Independent Review

Roles that validate output:

- QA Engineer
- Security Reviewer
- Product Designer for UX acceptance where applicable
- Principal Engineer for architecture-sensitive changes

### Knowledge completion

- Technical Writer

### System verification

- Verification Gate

---

## 12. Spatial behavior

Role movement may communicate real phase transitions.

Examples:

```text
PLAN
PM + System Analyst + Principal Engineer
→ meeting room

APPROVED IMPLEMENTATION
Backend / Frontend Engineer
→ factual workstations

REVIEW
QA / Security
→ review area

DOCUMENT
Technical Writer
→ documentation workstation

VERIFY
Verification Gate
→ represented as system UI, not a humanoid
```

Spatial transitions must reflect real session or Run phase.

Ambient Mode remains separate.

---

## 13. Universal Composer UI

Recommended structure:

```text
┌─────────────────────────────────────────────────────────────────┐
│ [Project: TDP ▼] [AUTO ▼] [Codex ▼] [+ Context]                │
│                                                                 │
│ Continue this project. Review the current state and propose      │
│ the next requirements before anyone starts coding.              │
│                                                                 │
│                                            [Send] [Start Run]    │
└─────────────────────────────────────────────────────────────────┘
```

Before a Run starts, show an execution confirmation:

```text
Project
Technical Documentation Platform

Approved scope
REQ-021
REQ-024

Execution team
Backend Engineer
Frontend Engineer

Independent review
QA Engineer
Security Reviewer

Documentation
Technical Writer

Workflow
Enterprise Engineering

Executor
Codex

[Cancel] [Start Run]
```

---

## 14. Bottom Operations Dock

The dock should integrate conversation with execution rather than create another dashboard page.

Suggested tabs:

```text
Activity | Team | Findings | Evidence | Terminal
```

During planning:

```text
Notes | Requirements | Questions | Risks
```

The dock can adapt its tabs to mode while retaining a consistent shell.

---

## 15. Safety and truthfulness

Universal Composer must not:

- silently infer and mutate an unconfirmed repository
- silently convert PLAN/BRAINSTORM into RUN
- approve its own RequirementCandidates
- claim roles participated when they were not instantiated
- generate fake operational Events from ambient movement
- expose hidden chain-of-thought as a product feature
- bypass Workspace isolation or existing Git safety policies
- auto-merge merely because verification passed

---

## 16. Acceptance criteria

The concept is implementable when the technical roadmap can demonstrate:

1. one composer handles ASK / PLAN / BRAINSTORM / RUN
2. AUTO classification is inspectable
3. repository-changing work requires explicit Project scope
4. ambiguous broad requests can stop at planning
5. dynamic team proposal explains included and excluded roles
6. planning roles can differ from implementation roles
7. requirements require explicit user approval
8. execution starts only after approved scope and confirmation
9. QA can participate before implementation and independently after it
10. Security activation is conditional
11. Technical Writer activation follows documentation impact
12. Verification Gate remains non-persona infrastructure
13. Office spatial transitions follow actual mode / workflow state
14. bottom dock and composer do not reduce Office View to a secondary panel
