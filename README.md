# Agent Office

Agent Office is a local-first, multi-project engineering control plane for orchestrating AI-assisted software development across multiple repositories and multiple executor runtimes.

The product is designed to coordinate engineering roles such as Architect, Explorer, Backend Developer, Frontend Developer, QA Reviewer, Security Reviewer, UX Reviewer, and Documentation Writer while keeping executor-specific behavior behind provider adapters.

Agent Office is an engineering operations product first. The virtual Office View is an optional projection of real execution state, not the source of truth.

## Product Principles

Agent Office is built around several non-negotiable principles:

- truthful execution state
- provider-neutral orchestration
- multi-project isolation
- controlled parallelism
- isolated Git worktrees for write-capable agents
- durable Run, AgentRun, Event, Finding, and Evidence history
- independent review and remediation
- explicit executor capabilities
- no destructive Git operations by default
- no silent executor fallback for high-risk work
- no fabricated progress, test results, quota, cost, or agent activity
- operations UI before Office visualization

## Conceptual Architecture

```text
                         Agent Office

                  Engineering Control Plane
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
     Project A           Project B           Project C
        │                   │                   │
        ▼                   ▼                   ▼
      Tasks               Tasks               Tasks
        │                   │                   │
        ▼                   ▼                   ▼
       Runs                Runs                Runs
        │                   │                   │
        └──────────────┬────┴────┬──────────────┘
                       │         │
                       ▼         ▼
                 Workflow    AgentRuns
                       │         │
                       ▼         ▼
                   Events   Executor Port
                               │
                 ┌─────────────┼─────────────┐
                 ▼             ▼             ▼
             CodexAdapter  Antigravity   OpenClaw
                              Adapter       Adapter
                 │             │             │
                 ▼             ▼             ▼
               Codex      Antigravity     OpenClaw

Write-capable AgentRuns
        │
        ▼
Isolated Git Worktrees
```

## Core Domain

```text
Project
  └── Task
       └── Run
            ├── WorkflowSnapshot
            ├── RunStageState
            ├── AgentRun
            │    ├── AgentProfile
            │    ├── Executor
            │    └── Workspace
            ├── Event
            ├── Finding
            └── Evidence
```

A Task represents user intent.

A Run represents one execution attempt.

An AgentProfile defines responsibility.

An Executor defines how an AgentRun is executed.

These concepts must remain separate.

## Repository Structure

```text
agent-office/
├── README.md
├── AGENTS.md
├── backend/
├── frontend/
├── agents/
├── executors/
├── workflows/
└── docs/
    ├── product/
    │   ├── PRD.md
    │   └── MVP_ACCEPTANCE.md
    ├── architecture/
    │   ├── SYSTEM_ARCHITECTURE.md
    │   └── DOMAIN_MODEL.md
    ├── contracts/
    │   ├── EVENT_CONTRACT.md
    │   ├── EXECUTOR_ADAPTER.md
    │   └── WORKFLOW_CONTRACT.md
    ├── security/
    │   ├── SECURITY_MODEL.md
    │   └── WORKTREE_POLICY.md
    └── ux/
        └── INFORMATION_ARCHITECTURE.md
```

The `agents/`, `executors/`, and `workflows/` directories are reserved for implementation assets and reusable definitions introduced during later phases.

## Specification Map

Read the documents in this order before substantial implementation:

1. `docs/product/PRD.md`
2. `docs/architecture/SYSTEM_ARCHITECTURE.md`
3. `docs/architecture/DOMAIN_MODEL.md`
4. `docs/contracts/WORKFLOW_CONTRACT.md`
5. `docs/contracts/EVENT_CONTRACT.md`
6. `docs/contracts/EXECUTOR_ADAPTER.md`
7. `docs/security/WORKTREE_POLICY.md`
8. `docs/security/SECURITY_MODEL.md`
9. `docs/ux/INFORMATION_ARCHITECTURE.md`
10. `docs/product/MVP_ACCEPTANCE.md`

`MVP_ACCEPTANCE.md` is the implementation acceptance gate. A phase is not complete merely because the application starts or a screen renders.

## Implementation Phases

```text
Phase 0  Specification Baseline
Phase 1  Application Foundation
Phase 2  Project / Task / Run Persistence
Phase 3  Workflow + ReferenceExecutor + Events
Phase 4  Worktree Safety + Evidence + Review
Phase 5  Operational Frontend
Phase 6  First Real Executor
Phase 7  Multi-Executor / Second Project Dogfood
Phase 8  Office View
```

The first real AI executor must not be integrated for write-capable work until the ReferenceExecutor, workflow state model, events, worktree safety, cancellation handling, and security controls are established.

## Initial Technical Direction

Backend:

```text
Python 3.12+
FastAPI
Pydantic
SQLite
pytest
```

Frontend:

```text
React
TypeScript
Vite
Vitest
React Testing Library
ESLint
```

Realtime:

```text
REST for commands and canonical reads
SSE for server-to-browser operational events
```

Architecture:

```text
Local-first modular monolith
Adapter-based executor integration
Git worktree isolation
```

Distributed infrastructure such as Kafka, Redis, Celery, Kubernetes, or microservices is intentionally outside the initial architecture unless measured requirements justify it later.

## Safety Defaults

MVP defaults:

```text
bind host                127.0.0.1
auto commit              false
auto merge               false
silent executor fallback false
force push               forbidden
destructive Git reset    forbidden
raw provider retention   off
production deployment    out of scope
risk acceptance          human only
```

The user's main working tree must never be cleaned, reset, stashed, committed, or overwritten automatically.

## Operations View

The primary Run detail is expected to expose:

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

The first eight operational surfaces are authoritative product functionality.

Office View is optional presentation over the same canonical Run, AgentRun, and Event state.

## Executor Model

Initial executor kinds:

```text
REFERENCE
CODEX
ANTIGRAVITY
OPENCLAW
```

Executor capability support is explicit:

```text
SUPPORTED
UNSUPPORTED
UNKNOWN
```

Missing capability data must never be fabricated.

## Development Foundation

Phase 1A establishes the backend and frontend development toolchains only.

### Backend

```bash
cd backend

python3.12 -m venv .venv
source .venv/bin/activate

python -m pip install -e '.[dev]'

pytest
ruff check .
ruff format --check .
mypy src
```

### Frontend

```bash
cd frontend

npm install

npm test
npm run lint
npm run typecheck
npm run build
npm run dev
```

Real Agent Office domain behavior, persistence, orchestration, executor integrations, and Office View are intentionally deferred to later milestones.

## Development Status

Current status:

```text
Phase 1A — Repository & Tooling Foundation
```

The next implementation milestone after Phase 1A acceptance is:

```text
Phase 1B — FastAPI Backend Shell
```

## Contribution and Agent Instructions

All coding agents must read `AGENTS.md` before modifying this repository.

The implementation must remain consistent with the specifications under `docs/`.
