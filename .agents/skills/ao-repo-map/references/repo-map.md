# Agent Office Repository Map

## Product documentation

- `AGENTS.md` — repository governance and engineering rules
- `docs/product/MVP_ACCEPTANCE.md` — authoritative phase acceptance criteria
- `docs/product/PHASE_3_VERIFICATION.md` — Phase 3 closure
- `docs/product/PHASE_4A_VERIFICATION.md` — workspace safety verification
- `docs/product/PHASE_4B_VERIFICATION.md` — Finding/Evidence verification
- `docs/architecture/DOMAIN_MODEL.md` — canonical domain model
- `docs/architecture/SYSTEM_ARCHITECTURE.md`
- `docs/contracts/WORKFLOW_CONTRACT.md`
- `docs/contracts/EVENT_CONTRACT.md`
- `docs/contracts/EXECUTOR_ADAPTER.md`
- `docs/security/WORKTREE_POLICY.md`
- `docs/security/SECURITY_MODEL.md`

## Backend

Root:

`backend/src/agent_office/`

Important areas:

- `api/` — HTTP boundary and safe DTOs
- `application/orchestration/` — Run/workflow lifecycle orchestration
- `application/workspaces/` — Workspace application behavior
- `application/review/` — Finding/review behavior
- `application/verification/` — verification/evidence behavior
- `application/audit/` — append-only operator audit behavior
- `application/recovery/` — restart recovery discovery
- `domain/` — provider-neutral domain types and invariants
- `infrastructure/executors/` — ReferenceExecutor and executor infrastructure
- `infrastructure/commands/` — controlled verification command boundary
- `infrastructure/persistence/` — repositories
- `persistence/sqlite.py` — schema/migrations
- `main.py` — application composition

## Tests

Root:

`backend/tests/`

Important milestone suites include:

- Phase 3 orchestration / acceptance
- Phase 3C audit/recovery
- Phase 4A workspace safety
- Phase 4B Finding/Evidence/verification
- migration tests

Before adding a new pattern, search for an existing test family that already owns the behavior.

## Frontend

Root:

`frontend/`

Phase 5 owns the major operational frontend work.

Before Phase 5, backend milestones should normally leave frontend unchanged.

## Current architecture

```text
Project
  -> Task
    -> Run
      -> WorkflowSnapshot
      -> Stage
        -> AgentRun
          -> ReferenceExecutor

Run
  -> Event
  -> AuditRecord
  -> Workspace
  -> Finding
  -> Verification
  -> Evidence
```

Writable AgentRuns must use isolated managed Git worktrees.

Project main working tree must not be mutated by autonomous execution.
