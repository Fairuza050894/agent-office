# Phase 9 Reference Pattern Adoption — Kantor Tim AI

Status: ACTIVE DESIGN INPUT
Date: 2026-09-27
Source: user-provided `Kantor Tim AI (Copy).html`

## Purpose

The reference demonstrates a useful operating pattern:

- a small manager/planning cell before implementation
- shared project artifacts instead of hidden agent-to-agent coordination
- explicit questions and deferred items
- role-scoped learning/memory
- traceable planning, QA, and evidence
- a read-only visualization layer driven by factual activity

Agent Office adopts the patterns that strengthen its existing architecture while
preserving its stricter canonical Run / AgentRun / Event boundaries.

No source code, assets, role names, or visual design from the reference is copied.

## Adopted in Phase 9C

### Durable shared planning artifacts

Agent Office already has:

- ComposerThread
- ComposerMessage
- TeamProposal
- PlanningArtifact
- RequirementCandidate
- PlanningEvent

Phase 9C uses those records as the shared project coordination surface rather
than relying on hidden agent conversation state.

### Small planning cell first

Project re-entry and broad change requests begin with planning roles such as:

- Product Manager
- System Analyst
- Principal Engineer

Conditional planning roles are added only when explicit scope requires them.

Backend / Frontend implementation roles stay DEFERRED until approved scope is
promoted later.

### Decision Queue

QUESTION artifacts are durable user-facing decisions.

A question may declare:

- question
- option_a / option_b / ...
- recommendation

The user selects one declared option.

Resolution:

- changes the QUESTION from OPEN to RESOLVED
- appends a DECISION artifact
- appends a PlanningEvent
- appends a USER AuditRecord
- never creates Task / Run / AgentRun / Workspace

A resolved question cannot be changed in place.

### Deferred work

Deferred implementation or missing input is represented explicitly as an ACTION
artifact with enough information to answer:

- what is deferred
- why it is deferred
- what condition allows it to resume

Deferred items are visible in the Operations Dock.

### Planning activity is separate from operational activity

PlanningEvent history can be displayed in the planning workspace Activity tab.

It remains separate from operational Run Event history.

The UI must never convert a PlanningEvent into an AgentRun Event.

## Phase 9D contract — Role Memory

The reference shows that role-specific lessons are useful across tasks. Agent
Office will adopt the concept with stricter constraints.

A future RoleMemory record must be:

- Project-scoped
- role-scoped
- structured
- bounded in size
- source-attributed
- user-inspectable
- supersedable / archivable
- free of hidden chain-of-thought
- free of raw secrets or credentials

Allowed memory examples:

- verified project convention
- recurring defect pattern
- accepted architecture decision
- repository-specific workflow caveat
- user-approved product constraint

Disallowed memory examples:

- hidden reasoning
- raw model transcript
- unverified speculation presented as fact
- credentials, tokens, .env contents
- full file dumps

Role memory is context input, not canonical execution truth.

## Phase 9F contract — Activity Interpreter

The reference maps tool activity into office animation. Agent Office will adopt
that idea behind a dedicated presentation adapter.

Proposed normalized activity vocabulary:

```text
READING
WRITING
COMMAND
TESTING
REVIEWING
DOCUMENTING
WAITING_USER
BLOCKED
COMPLETED
IDLE
```

Input precedence:

```text
1. canonical Run / AgentRun / Event state
2. safe executor telemetry attached to that canonical execution
3. planning state for real planning sessions
4. Ambient presentation state only when no factual activity owns the character
```

Optional executor telemetry may contain safe metadata such as:

- operation category
- tool name
- repository-relative path label
- command classification
- test/check key
- timestamp

It must not expose:

- file contents
- .env contents
- command secrets
- authorization headers
- raw provider reasoning
- arbitrary transcript text

The Activity Interpreter produces presentation state only. It does not write
Run / AgentRun / Event truth.

Example mappings:

```text
READING       -> monitor / document-reading pose
WRITING       -> typing pose
COMMAND       -> terminal pose
TESTING       -> verification workstation
REVIEWING     -> review pose
WAITING_USER  -> decision-board area
BLOCKED       -> incident/review wall
COMPLETED     -> return to neutral state
IDLE          -> clearly labeled Ambient scheduler
```

## Patterns intentionally not adopted

Agent Office does not adopt the following as canonical behavior:

- raw provider transcript JSONL as source of operational truth
- timer-based inference that claims an agent is working
- fabricated meeting / coffee / game activity presented as real work
- automatic commit, push, merge, or main-tree mutation
- unrestricted parallel write agents touching the same repository area
- hidden agent debate as durable product output

## Parallel work safety

Before later multi-agent parallel execution, scheduling should be conflict-aware.

At minimum, the execution proposal should carry intended change areas.

Two write-capable AgentRuns should not be scheduled concurrently when their
declared change areas overlap unless a workflow explicitly supports a safe
coordination strategy.

## Result

The reference strengthens Agent Office in four places:

```text
planning artifacts
decision/deferred workflow
role memory
factual activity visualization
```

The first two are part of Phase 9C.

Role memory belongs to Phase 9D context work.

Activity Interpreter belongs to Phase 9F Office telemetry work.
