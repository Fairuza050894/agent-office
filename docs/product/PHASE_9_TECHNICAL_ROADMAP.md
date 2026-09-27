# Phase 9 Technical Implementation Roadmap

Status: READY FOR IMPLEMENTATION PLANNING
Baseline: `main@db34358`
Concept source:

- `docs/product/AGENT_OFFICE_VNEXT_CONCEPT.md`
- `docs/product/UNIVERSAL_COMPOSER_AND_TEAM_FORMATION.md`
- `docs/architecture/ADR-0002-planning-operational-boundary.md`

Phase 9 goal:

> turn Agent Office from a run-centric control panel with an optional Office
> View into a project-aware engineering operating system centered on Universal
> Composer, dynamic team formation, structured planning, and an Office-first
> command workspace.

---

## 1. Non-negotiable constraints

Phase 9 must preserve all accepted safety contracts:

- backend Run / AgentRun / Event state remains authoritative for execution
- no auto merge
- no force push
- no destructive main-tree Git operations
- write-capable execution still uses isolated Workspaces/worktrees
- provider-specific behavior stays behind adapter/runtime boundaries
- frontend may not invent progress or execution state
- planning state must not be written into Run Event history
- Ambient Mode must not create canonical operational records
- human approval is required before proposed requirements become executable scope
- legacy Phase 8 role keys and historical snapshots remain readable

---

## 2. Delivery sequence

Phase 9 is intentionally split into six independently reviewable slices.

```text
9A  Experience Shell
 ↓
9B  Planning Domain + Persistence
 ↓
9C  Universal Composer + Team Formation
 ↓
9D  Real Planning / Brainstorm Runtime
 ↓
9E  Requirement Promotion + vNext Execution Roles
 ↓
9F  Ambient Office + Mission-Control Acceptance
```

No slice should depend on unmerged work from a later slice.

---

# Phase 9A — Dark Control-Room Shell + Office Workspace

## Objective

Replace the generic white application shell and make Office the primary spatial
workspace without changing backend domain state.

This slice is frontend-only except for consuming existing APIs.

## Primary UX

Introduce a new primary route:

```text
/office
```

Optional scoped forms:

```text
/projects/:projectId/office
/runs/:runId/office
```

Compatibility requirement:

- existing `/runs/:runId/office` deep links remain valid
- Run-scoped route opens the same Office workspace in Operational scope

## Frontend modules

Recommended new modules:

```text
frontend/src/pages/OfficeWorkspacePage.tsx
frontend/src/components/office/OfficeCommandRail.tsx
frontend/src/components/office/BottomOperationsDock.tsx
frontend/src/components/office/UniversalComposerShell.tsx
frontend/src/components/office/AgentInspector.tsx
frontend/src/components/office/OfficeCameraControls.tsx
frontend/src/components/office/OfficeModeBadge.tsx
frontend/src/styles/tokens.css
frontend/src/styles/shell.css
frontend/src/styles/office-workspace.css
```

Existing components to refactor/reuse:

```text
frontend/src/layouts/AppShell.tsx
frontend/src/components/Header.tsx
frontend/src/components/Navigation.tsx
frontend/src/pages/RunOfficePage.tsx
frontend/src/components/OfficeScene.tsx
frontend/src/components/ThreeOfficeScene.tsx
frontend/src/App.css
frontend/src/office.css
```

## Design-token contract

Move global theme values into CSS custom properties.

Minimum groups:

- canvas/surface hierarchy
- text hierarchy
- border/divider
- live/success/waiting/error/planning accents
- focus ring
- mono font stack
- density/spacing
- control heights
- panel elevation

Dark is the default theme for Phase 9.

Do not implement a light-theme toggle in 9A unless it is trivial after tokenization.

## Bottom Operations Dock

States:

```text
COLLAPSED
NORMAL
EXPANDED
```

Target heights:

- collapsed: 44–56 px
- normal: 220–280 px
- expanded: 35–40% viewport height

Initial tabs may use existing data only:

- Activity
- Team
- Findings
- Evidence

Terminal remains disabled/hidden until a safe executor-output contract exists.

## Universal Composer shell

9A renders the composer UI but does not yet perform planning execution.

Controls:

- Project selector from Project Registry
- intent selector: AUTO / ASK / PLAN / BRAINSTORM / RUN
- Executor selector from existing registry
- context chip rail
- multiline instruction input
- Send
- Start Run button disabled unless later Phase 9 logic provides executable scope

The shell must not create a fake conversational response.

## Maximize

Office maximize must:

- hide normal navigation/header chrome
- keep compact command rail
- retain exit control
- support Esc
- preserve accessibility
- not change backend state

## 9A acceptance gate

- no major white application canvas remains
- Overview/Projects/Runs/Tasks/Agents/Workflows/Executors/Activity/Evidence/Audit/Settings remain readable
- Office scene becomes full-width by default
- right sidebar is no longer permanent
- dock collapses/expands deterministically
- selected AgentRun opens an on-demand inspector
- existing Operational Office semantics remain unchanged
- RunOffice tests remain green
- keyboard navigation remains usable
- production build remains green

No SQLite migration in 9A.

---

# Phase 9B — Planning Domain and Persistence Foundation

## Objective

Create restart-safe persistence for Universal Composer planning truth without
starting real AI planning yet.

## Schema migration

Current schema: v10.

9B proposes schema **v11**.

Add tables:

### `composer_threads`

```text
id                  TEXT PRIMARY KEY
project_id          TEXT NULL REFERENCES projects(id)
requested_intent    TEXT NOT NULL
resolved_intent     TEXT NULL
status              TEXT NOT NULL
title               TEXT NULL
timezone            TEXT NOT NULL
executor_id         TEXT NULL
workflow_id         TEXT NULL
created_at          TEXT NOT NULL
updated_at          TEXT NOT NULL
completed_at        TEXT NULL
```

Checks:

```text
requested_intent IN (AUTO, ASK, PLAN, BRAINSTORM, RUN)
resolved_intent IN (ASK, PLAN, BRAINSTORM, RUN) OR NULL
status IN (OPEN, ACTIVE, AWAITING_USER, COMPLETED, ARCHIVED)
```

Project may be nullable for general ASK/BRAINSTORM threads, but repository
mutation can never occur without a concrete Project.

### `composer_messages`

```text
id
thread_id
actor_type          USER | ROLE | SYSTEM
role_key            nullable
message_kind        USER_PROMPT | ROLE_CONTRIBUTION | SYSTEM_SUMMARY
content
created_at
```

Visible contribution text is product output, not hidden model reasoning.

### `team_proposals`

```text
id
thread_id
phase               PLANNING | IMPLEMENTATION | REVIEW | DOCUMENTATION
status              PROPOSED | ACCEPTED | REJECTED | SUPERSEDED
rationale_summary
created_at
decided_at
```

### `team_proposal_members`

```text
proposal_id
role_key
disposition         INCLUDED | DEFERRED | EXCLUDED
reason
order_hint
PRIMARY KEY (proposal_id, role_key)
```

The reason is concise user-visible justification, not hidden chain-of-thought.

### `planning_artifacts`

Generic structured artifacts other than requirements.

```text
id
thread_id
artifact_type       BRIEF | NOTE | DECISION | QUESTION | RISK | ACTION
title
content_json
author_role_key     nullable
status
created_at
updated_at
```

### `requirement_candidates`

```text
id
thread_id
project_id          nullable
title
problem
requirement
rationale
acceptance_hint
source_roles_json
status              PROPOSED | APPROVED | REJECTED | DEFERRED
created_at
updated_at
approved_at         nullable
decided_at          nullable
```

Only explicit user action may transition PROPOSED into APPROVED/REJECTED/DEFERRED.

### `planning_events`

Separate from existing Run `events`.

```text
id
thread_id
project_id          nullable
event_type
role_key            nullable
occurred_at
recorded_at
sequence
payload_json
```

Example event types:

- composer.message.received
- intent.resolved
- team.proposed
- team.accepted
- planning.started
- planning.contribution.recorded
- planning.artifact.created
- requirement.proposed
- requirement.approved
- requirement.rejected
- requirement.deferred
- planning.completed

## Domain modules

Recommended:

```text
backend/src/agent_office/domain/composer.py
backend/src/agent_office/domain/team.py
backend/src/agent_office/domain/planning.py
backend/src/agent_office/domain/requirement.py
```

Identifiers should follow existing typed-ID patterns in
`domain/identifiers.py`.

## Application modules

```text
backend/src/agent_office/application/composer/
backend/src/agent_office/application/planning/
backend/src/agent_office/application/team_formation/
backend/src/agent_office/application/requirements/
```

Services:

- ComposerThreadService
- PlanningArtifactService
- RequirementService
- TeamProposalService
- PlanningEventService

Approval transitions must write existing Audit records.

## Persistence repositories

Extend existing infrastructure persistence package with:

- SQLiteComposerThreadRepository
- SQLiteComposerMessageRepository
- SQLiteTeamProposalRepository
- SQLitePlanningArtifactRepository
- SQLiteRequirementCandidateRepository
- SQLitePlanningEventRepository

Cross-Project invariants must fail closed.

## API surface

Recommended routes:

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

Do not reuse `/api/runs/{run_id}/events/stream`.

## 9B runtime boundary

9B uses a deterministic ReferencePlanningRuntime only.

Purpose:

- prove lifecycle
- prove persistence
- prove API contract
- prove approval/audit
- avoid coupling the domain to Codex before the planning port is stable

Reference outputs must be obviously deterministic fixtures in tests and local
development, not presented as real provider intelligence.

## 9B acceptance gate

- v10 database migrates safely to v11
- restart retains threads/messages/artifacts/requirements/team proposals
- malformed ownership fails closed
- planning event SSE is separate from Run Event SSE
- requirement approval is audited
- direct database mutation cannot bypass required checks where practical
- no planning action creates AgentRun/Workspace/Run Event
- full existing suite remains green

---

# Phase 9C — Universal Composer and Dynamic Team Formation

## Objective

Make Universal Composer functional for project scoping, safe intent resolution,
and deterministic team proposals.

## Intent resolver v1

Explicit selected intent always wins.

AUTO uses conservative deterministic resolution.

Recommended priority:

1. explicit attached approved RequirementCandidates + explicit execution request
   -> RUN candidate
2. explicit ideation/brainstorm request -> BRAINSTORM
3. clearly read-only question -> ASK
4. everything broad, stale, ambiguous, or repository-changing -> PLAN

AUTO must never directly start RUN.

It returns:

```json
{
  "resolved_intent": "PLAN",
  "reason_summary": "Project state is stale and implementation scope is not approved.",
  "requires_user_action": false
}
```

The reason is concise product explanation, not chain-of-thought.

## TeamFormationService

Input:

- resolved intent
- Project
- explicit user constraints
- known change areas
- approved RequirementCandidates
- risk flags
- documentation impact
- existing workflow capability

Output:

- TeamProposal
- included roles
- deferred/excluded roles
- concise reason per role

Initial rules must be deterministic and testable.

## vNext role catalog

Add new AgentProfile keys. Do not rename/remove legacy keys.

Recommended keys:

```text
product-manager
system-analyst
principal-engineer
product-designer
backend-engineer
frontend-engineer
qa-engineer
security-reviewer
technical-writer
```

Note:

`security-reviewer` may retain the existing key if its semantic contract is
compatible. Other historical keys remain available for old snapshots.

Legacy visual aliases may map historical roles to equivalent appearance families,
but historical displayed names must remain truthful to the frozen snapshot.

## Team formation rules

Examples:

### Project re-entry

```text
Product Manager
System Analyst
Principal Engineer
```

Conditional:

- Product Designer if UI/UX scope is observed
- QA Engineer if acceptance ambiguity is material
- Security Reviewer if auth/secrets/filesystem/network/permission risk appears

Implementation roles remain excluded until approval.

### Documentation-only

```text
Technical Writer
Verification Gate (system)
```

### Small isolated backend bug

```text
System Analyst
Backend Engineer
QA Engineer
Verification Gate
```

### UX-heavy frontend change

Planning:

- Product Manager
- System Analyst
- Product Designer
- Principal Engineer only if architecture impact exists

Execution:

- Frontend Engineer

Review:

- QA Engineer
- Product Designer

## Frontend behavior

UniversalComposer becomes functional:

- project selection
- intent selection
- Send
- thread creation
- message history
- resolved intent badge
- team proposal rendering
- explicit accept/reject team proposal

Bottom dock gains planning tabs:

- Notes
- Requirements
- Questions
- Risks

## Project Re-entry Brief

Implement as a structured BRIEF artifact.

Sections:

- project identity
- last meaningful work
- current repository state
- current architecture/dependencies
- observed gaps
- relevant technical debt
- RequirementCandidates
- open questions
- risks
- proposed implementation scope
- expected implementation roles
- expected review roles
- documentation impact
- verification plan

## 9C acceptance gate

- returning to an old Project can stop at PLAN
- no BE/FE AgentRun starts during planning
- team proposal is deterministic for the same facts
- user can inspect why roles are included/excluded
- user can override explicit intent
- ambiguous Project selection blocks repository-changing behavior
- no AUTO path silently creates Task/Run

---

# Phase 9D — Real Planning Runtime + Brainstorm Mode

## Objective

Connect PLAN/BRAINSTORM to a real provider-neutral planning runtime while
preserving read-only project safety.

## New port

Introduce a planning-specific application port rather than forcing planning
through AgentRun execution.

Concept:

```text
PlanningRuntime
  describe_capabilities()
  contribute(context, role, instruction)
  cancel()
```

Provider implementation may reuse lower-level Codex process utilities, but the
domain/application layer must not depend on Codex.

## Read-only requirement

A real PlanningRuntime must prove that it cannot mutate the selected repository.

If a provider/runtime cannot provide an enforceable read-only execution mode,
that runtime is unavailable for PLAN/BRAINSTORM.

Do not silently fall back to a writable ExecutorAdapter.

## Context resolver

Recommended context sources:

- Project registry
- repository metadata
- selected files/directories
- previous Run summaries
- Findings/Evidence explicitly attached
- relevant docs
- RequirementCandidates
- current TeamProposal

Context must be bounded.

Do not dump an entire repository blindly into every planning turn.

## Structured contribution contract

Provider output must be converted to a validated public structure such as:

```json
{
  "role_key": "principal-engineer",
  "summary": "Separate catalog extraction from rendering concerns.",
  "artifacts": [
    {
      "type": "RISK",
      "title": "Schema coupling",
      "content": "..."
    }
  ],
  "requirements": []
}
```

Hidden reasoning is not requested or stored.

Malformed provider output fails closed and is shown as a planning failure, not
silently converted into invented artifacts.

## Brainstorm orchestration

Initial implementation should be bounded and sequential.

Example round:

```text
Product Manager
 -> System Analyst
 -> Principal Engineer
 -> conditional Product Designer / QA / Security
 -> synthesis
 -> AWAITING_USER
```

Avoid autonomous infinite debates.

User explicitly requests another round.

## Spatial Brainstorm Mode

When a real BrainstormSession/thread is ACTIVE:

- selected planning roles occupy meeting room anchors
- camera may focus meeting room
- current contributing role gets subtle highlight
- visible note/requirement board updates from persisted planning artifacts
- session date/time/timezone remains visible

This movement represents a real planning session, not an AgentRun.

## 9D acceptance gate

- real planner is provider-neutral at application boundary
- repository remains unchanged after PLAN/BRAINSTORM
- structured contributions survive restart
- cancellation is bounded
- malformed output fails visibly
- no hidden chain-of-thought is stored/displayed
- Brainstorm roles in the meeting room correspond to actual session participants
- no planning event appears in Run Event stream

---

# Phase 9E — Requirement Promotion and vNext Execution Roles

## Objective

Bridge approved planning scope into the existing Task/Run engine without
weakening Run safety.

## Schema v12

Recommended promotion table:

### `requirement_promotions`

```text
requirement_id
task_id
run_id
promoted_at
PRIMARY KEY (requirement_id, run_id)
```

Optional thread-level execution proposal:

### `execution_proposals`

```text
id
thread_id
project_id
team_proposal_id
workflow_id
executor_id
changed_areas_json
status              PROPOSED | ACCEPTED | REJECTED | STARTED
created_at
decided_at
run_id              nullable
```

## Promotion API

```text
POST /api/composer/threads/{thread_id}/execution-proposals
POST /api/execution-proposals/{proposal_id}/accept
POST /api/execution-proposals/{proposal_id}/start
```

Start must validate:

- concrete Project
- at least one approved RequirementCandidate
- accepted execution TeamProposal
- compatible Workflow
- compatible Executor
- no unsupported unresolved blocker defined by policy

## Task creation

Task objective should reference approved requirement scope.

Do not flatten all planning chat into Task objective.

Persist traceability:

```text
ComposerThread
 -> RequirementCandidate APPROVED
 -> ExecutionProposal
 -> Task
 -> Run
```

## Workflow / AgentProfile migration strategy

New WorkflowDefinitions may use vNext role keys.

Historical snapshots are untouched.

Recommended vNext stage responsibilities:

```text
DISCOVERY
  system-analyst
  principal-engineer when required

IMPLEMENTATION
  backend-engineer / frontend-engineer conditional

REVIEW
  qa-engineer
  security-reviewer conditional
  product-designer conditional for UX acceptance

REMEDIATION
  implementation owner

DOCUMENTATION
  technical-writer conditional

VERIFICATION
  system Verification Gate
```

The Verification Gate should not require a humanoid AgentProfile for new
workflows if the existing orchestrator can express verification as system
verification. If current workflow mechanics require an assignment, 9E must add
an explicit compatibility design rather than deleting legacy `verifier`.

## Office operational transition

After a Run starts:

- planning meeting state yields to Operational Mode
- factual AgentRuns become authoritative characters
- implementation roles go to factual workstations
- QA/Security move according to factual review state
- Technical Writer participates only when a factual AgentRun exists
- planning artifacts remain accessible in dock but do not drive execution state

## 9E acceptance gate

- unapproved requirement cannot be promoted
- approved requirement links are durable
- Task/Run creation remains inside existing Project ownership checks
- explicit Start Run confirmation exists
- existing Workspace isolation is unchanged
- new role workflow completes through ReferenceExecutor
- one authenticated Codex smoke proves compatible real execution
- legacy Runs still render historical role identity correctly

---

# Phase 9F — Ambient Office + Mission-Control Acceptance

## Objective

Add non-canonical life to idle Office state and finish power UX after factual
and planning boundaries are proven.

## OfficePersona

OfficePersona is frontend presentation state.

It is not persisted in SQLite in the initial implementation.

Source persona catalog uses vNext role keys.

State may include:

```text
role_key
zone
pose
destination
pairing
seed
```

## Activation

Ambient Mode only when:

- no active operational Run in selected scope
- no Historical replay
- no active Brainstorm/PLAN spatial session
- user has not disabled ambient mode

## Determinism

Seed from stable inputs such as:

- role key
- local date
- browser office-session identifier

Rerender must not randomly teleport personas.

## Allowed actions

- workstation idle
- walking
- lounge
- pantry stance
- window stance
- focus booth
- whiteboard observation
- two-person conversational stance

No transcript.

No fake operational label.

## Preemption

When real work begins:

1. stop ambient scheduling
2. transition/fade ambient-only personas out
3. factual planning or AgentRun actors take precedence
4. no ambient transition is emitted as operational/planning Event

## Power UX

Finish:

- camera presets
- minimap
- layer toggles
- command palette
- keyboard shortcuts
- reduced-motion mode
- second-monitor/maximize usability

## Performance gate

- no per-frame React state churn
- background tab reduces/stops ambient animation
- ambient scheduler has bounded frequency
- WebGL failure leaves operational HTML UI usable
- lower quality shadow mode available if needed

## 9F final acceptance scenario

A required end-to-end dogfood scenario:

```text
1. Open /office with no active Run
2. Ambient Office is visibly labeled
3. Select Technical Documentation Platform
4. Ask: "Continue TDP; we have not worked on it for a while"
5. AUTO resolves to PLAN
6. PM + System Analyst + Principal Engineer form Planning Cell
7. Project Re-entry Brief and RequirementCandidates are produced
8. User approves selected requirements
9. ExecutionProposal is shown
10. User starts Run explicitly
11. Ambient/planning state yields to factual AgentRuns
12. BE/FE work only if approved scope requires them
13. QA independently verifies
14. Security participates only if scope requires it
15. Verification Gate passes
16. Technical Writer updates docs when required
17. Run completes with Evidence
18. Office returns to non-operational state without fabricating work
```

---

## 3. Cross-phase role compatibility

Do not rename existing persisted roles in place.

Mapping guidance for presentation only:

```text
legacy architect              -> vNext Principal Engineer family
legacy explorer               -> vNext System Analyst family
legacy backend-developer      -> vNext Backend Engineer family
legacy frontend-developer     -> vNext Frontend Engineer family
legacy qa-reviewer            -> vNext QA Engineer family
legacy security-reviewer      -> vNext Security Reviewer
legacy documentation-writer   -> vNext Technical Writer family
legacy verifier               -> historical-only persona; new model uses Verification Gate
```

Historical records keep their original labels.

---

## 4. Proposed PR sequence

Recommended implementation PRs:

```text
PR 7   Phase 9 roadmap / ADR / Phase 8 closure          docs only

PR 8   Phase 9A dark shell + Office workspace           frontend
PR 9   Phase 9B planning domain + SQLite v11 + API      backend/domain
PR 10  Phase 9C composer + deterministic team formation backend + frontend
PR 11  Phase 9D real planning runtime + brainstorm      backend + frontend + office
PR 12  Phase 9E requirement promotion + vNext workflow  backend + workflow + frontend
PR 13  Phase 9F ambient + mission-control acceptance    frontend/office
```

PR numbers are illustrative if repository numbering differs.

Every implementation PR:

- starts from current main
- remains isolated
- runs full repository CI
- does not auto merge
- records acceptance evidence
- updates current milestone docs

---

## 5. Test strategy

### Domain

Property/invariant tests for:

- valid intent transitions
- requirement approval transitions
- TeamProposal lifecycle
- planning artifact validation
- historical role compatibility

### Persistence

Migration tests:

- fresh v12 database
- v10 -> v11
- v11 -> v12
- restart persistence
- cross-Project mismatch rejection
- malformed schema metadata fail-closed behavior

### API

Contract tests for:

- thread lifecycle
- message validation
- approval audit
- planning SSE
- execution proposal confirmation
- Project scope mismatch

### Frontend

Vitest/RTL:

- dark shell
- composer interactions
- dock states
- mode badges
- team proposal
- requirement approval
- inspector
- keyboard/maximize behavior
- legacy Run Office compatibility

### Office 3D

Deterministic unit tests for:

- planning room anchors
- ambient route safety
- factual/ambient precedence
- role appearance mapping
- no ambient canonical event side effect

### Integration

- ReferencePlanningRuntime PLAN flow
- ReferenceExecutor promotion flow
- real Codex read-only planning smoke
- real Codex execution smoke after approval
- restart between planning and approval
- restart between approval and Run start

---

## 6. Observability

Add factual metrics without gamification:

- active operational Runs
- active planning sessions
- awaiting-user planning sessions
- open proposed requirements
- approved requirements awaiting execution
- blocked Runs
- executor health

Do not add:

- fake productivity scores
- agent utilization percentages without factual basis
- arbitrary AI quality scores

---

## 7. Security

Planning introduces a new sensitive path because a model may inspect repository
context before a Run exists.

Requirements:

- Project Registry remains the root of repository scope
- read-only planning runtime is enforced, not merely prompted
- context attachment paths are normalized and contained
- secrets/redaction rules apply to planning records/events
- planning outputs never store raw credentials
- approval endpoints are explicit mutations and audited
- archived planning content remains local-first
- no planning path gains implicit Git write authority

---

## 8. Definition of Phase 9 complete

Phase 9 is complete only when:

- dark shell is the primary UI
- Office workspace is full-width and maximizable
- Bottom Operations Dock replaces permanent right sidebar
- Universal Composer supports ASK/PLAN/BRAINSTORM/RUN with conservative AUTO
- dynamic team formation is explainable and deterministic
- real read-only planning works through a provider-neutral port
- planning records survive restart
- approved requirements can be promoted into existing Task/Run engine
- vNext role catalog works without breaking historical Runs
- Ambient Office is visibly non-canonical
- one full TDP project re-entry dogfood completes from PLAN through documented verified Run
- all full CI gates remain green
- no auto merge / force push / unsafe workspace behavior is introduced

---

## 9. First implementation target

After this roadmap is accepted, start with **Phase 9A only**.

Do not start schema/runtime work in the same PR as the global visual-shell
refactor.

Reason:

- 9A creates the stable visual container required by every later Phase 9 screen
- it is reversible and low-risk
- it lets the user validate visual direction before persistence/API complexity
- backend truth remains unchanged while the shell is redesigned
