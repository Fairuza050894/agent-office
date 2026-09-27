# ADR-0002 — Separate Planning Truth from Operational Execution Truth

Status: Accepted for Phase 9 implementation
Date: 2026-09-27

## Context

Agent Office currently has a strong operational truth model:

- Project
- Task
- Run
- Stage
- AgentRun
- Event
- Finding
- Evidence
- Workspace

Phase 9 introduces Universal Composer, PLAN/BRAINSTORM flows, structured
requirements, dynamic team formation, and Ambient Idle Mode.

These concepts must not weaken the existing rule that operational UI and Office
View are projections of canonical execution state.

A planning proposal is factual evidence that a proposal was generated, but the
proposal is not equivalent to executed engineering work.

An ambient OfficePersona is presentation state and is not an AgentRun.

## Decision

Agent Office will maintain three explicit truth classes.

### 1. Operational truth

Existing Run-domain entities remain authoritative for engineering execution.

Only operational state may claim:

- code is being changed
- tests are running or passed
- a Finding exists
- a Workspace is active
- an AgentRun started/completed/failed
- a Run is complete

Operational Events remain Run-scoped.

### 2. Planning truth

Phase 9 introduces a separate planning persistence boundary.

Planning records may factually state:

- a user submitted an instruction
- an intent was resolved
- a planning role contributed a visible proposal
- a team proposal was produced
- a RequirementCandidate was proposed
- the user approved/rejected/deferred a requirement
- a planning session completed

Planning records must not claim implementation happened unless a subsequent
Task/Run proves it.

Planning event history must not reuse the Run Event table merely for UI
convenience.

### 3. Ambient presentation state

Ambient OfficePersona position, pose, and illustrative interaction remain
client/presentation state for the first implementation.

Ambient state:

- does not create AgentRuns
- does not create canonical Run Events
- does not create planning records
- does not create Findings/Evidence
- is discarded when factual work takes precedence

## Historical compatibility

Existing AgentProfile keys and frozen WorkflowSnapshots are immutable historical
meaning.

Phase 9 must not destructively rename legacy keys such as:

- `architect`
- `explorer`
- `backend-developer`
- `frontend-developer`
- `qa-reviewer`
- `security-reviewer`
- `verifier`
- `documentation-writer`

vNext role identities are added as new profile keys for new workflows.

Historical Runs continue to display their frozen historical role identity.

## Verification Gate

The Phase 8 Verifier persona evolves conceptually into a system-level
Verification Gate for new vNext workflows.

Legacy historical AgentRuns with profile key `verifier` remain valid and must
continue to render correctly.

## Approval authority

The human user remains the final approver for RequirementCandidates and
repository-changing execution.

AUTO intent resolution may recommend RUN but must not silently begin mutation.

## Consequences

Positive:

- planning can become rich without polluting operational truth
- Ambient Mode can feel alive without fake execution
- historical Runs remain stable
- approval semantics remain explicit
- Run Event consumers do not need to interpret planning-only events

Cost:

- Phase 9 requires new persistence/repository/service/API boundaries
- the frontend must display mode/truth class clearly
- promotion from approved planning scope into Task/Run must be explicit

## Rejected alternatives

### Reuse Run/AgentRun for brainstorm sessions

Rejected because it would make planning look like engineering execution and
would create fake operational history.

### Store brainstorm only in frontend state

Rejected because approved requirements, decisions, and project re-entry briefs
must survive restart and be auditable.

### Rename legacy AgentProfile keys in place

Rejected because WorkflowSnapshots and historical AgentRuns freeze those keys.

### Let AUTO start a Run directly

Rejected because ambiguous natural language must not silently mutate a
repository.
