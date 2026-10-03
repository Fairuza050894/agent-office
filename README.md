# Agent Office

Agent Office is a local-first engineering control plane for coordinating
AI-assisted software development across projects, workflows, and executor
runtimes while keeping human decisions, Git safety, and execution evidence
explicit.

The product combines an operational control plane with a living 3D Office.
The 3D Office is a projection of real application state and explicitly labelled
presentation-only ambience; it is never the source of workflow truth.

## Product Principles

Non-negotiable principles:

- canonical Task / Run / AgentRun / Event / Evidence / ResultReview truth;
- provider-neutral orchestration through executor adapters;
- multi-project isolation;
- isolated Git worktrees for write-capable AgentRuns;
- durable execution, review, audit, and evidence history;
- independent verification and human result decisions;
- explicit executor capabilities and failure behavior;
- no fabricated progress, tests, KPI, cost, dialogue, meetings, or agent work;
- no destructive Git operations by default;
- no silent executor fallback for high-risk work;
- no automatic push or merge to a user's project default branch from Agent Office runtime behavior;
- operational accessibility remains usable if 3D rendering is unavailable.

## Product Value Loop

```text
Describe outcome
  -> Plan / requirements / team
  -> explicit promotion
  -> isolated agent work
  -> verification + review
  -> human result decision
  -> managed local delivery
  -> accepted change dossier / outcome KPI
```

Technical completion and human delivery remain distinct states.

## Conceptual Architecture

```text
                           Agent Office
                     Engineering Control Plane
                                |
           +--------------------+--------------------+
           |                    |                    |
           v                    v                    v
        Project A            Project B            Project C
           |                    |                    |
           v                    v                    v
          Task                 Task                 Task
           |                    |                    |
           v                    v                    v
          Run                  Run                  Run
           |                    |                    |
           +--------------------+--------------------+
                                |
                 +--------------+--------------+
                 |                             |
                 v                             v
        Workflow / AgentRuns               Event / Evidence
                 |
                 v
           Executor Port
       +---------+---------+
       |         |         |
       v         v         v
     Codex   Antigravity  OpenClaw
    Adapter    Adapter    Adapter
       |
       v
Isolated managed Git worktree
```

## Canonical Domain

```text
Project
  -> Task
      -> Run
          |- WorkflowSnapshot
          |- RunStageState
          |- AgentRun
          |    |- AgentProfile
          |    |- Executor
          |    `- Workspace
          |- Event
          |- Finding
          |- Evidence
          `- ResultReview
```

A Task represents user intent. A Run represents one execution attempt. An
AgentProfile defines responsibility. An Executor defines how an AgentRun is
executed. These concepts remain separate.

## Primary Product Navigation

The default RC1 navigation follows the user value loop:

```text
Office
Inbox
Task Board
Project KPI
```

Lower-frequency registries and controls remain available through **More tools**.
No capability is removed merely because it is not primary navigation.

## 3D Office Architecture

Production rendering:

```text
Planning -> R3F
Live     -> R3F
Replay   -> R3F
```

Recovery order:

```text
R3F production renderer
  -> Three.js recovery renderer
  -> HTML operational fallback
```

The production scene composes:

```text
canonical environment
  + premium floor architecture
  + verified furniture/assets
  + character runtime
  + deterministic lighting
  + semantic camera composition
```

RC1 uses a premium dark/futuristic engineering-control-room direction rather
than a generic dashboard aesthetic. Commons, Build, and Strategy retain distinct
room identity while sharing one product language.

The premium architecture layer is presentation-only, adds no workflow state or
new light truth, stays outside the walkable/collision volume, and batches
repeated static geometry with `THREE.InstancedMesh` to preserve renderer
headroom.

Character presentation uses deterministic role/model/accent profiles, verified
animation clips, and a restrained CSS2D interaction layer. Presentation may
improve silhouette/readability and selected/hover/failure hierarchy, but it must
not invent concrete work or activity.

Architecture reference:

- `docs/architecture/RC1_PREMIUM_3D_ARCHITECTURE.md`
- `docs/architecture/RC1_CHARACTER_PRESENTATION.md`
- `docs/architecture/LIVING_OFFICE_TECHNICAL_DESIGN.md`
- `docs/architecture/ADR-0004-office-renderer-evolution.md`

## Repository Structure

```text
agent-office/
|- README.md
|- AGENTS.md
|- backend/
|- frontend/
|- agents/
|- executors/
|- workflows/
|- scripts/
|- .agents/
`- docs/
   |- product/
   |- architecture/
   |- contracts/
   |- security/
   `- ux/
```

Important frontend 3D areas:

```text
frontend/src/components/R3FOfficeScene.tsx
frontend/src/components/ThreeOfficeScene.tsx
frontend/src/office3d/environment.ts
frontend/src/office3d/premiumEnvironment.ts
frontend/src/office3d/character.ts
frontend/src/office3d/camera.ts
frontend/src/office3d/lighting.ts
frontend/src/office3d/livingOffice.ts
frontend/src/office3d/runtimeProjection.ts
frontend/src/styles/premium-characters.css
```

## Specification Map

For implementation work, start with:

1. `scripts/context.sh`
2. `.agents/skills/ao-milestone/references/current-phase.md`
3. `.agents/skills/ao-repo-map/references/repo-map.md`
4. `.agents/skills/ao-repo-map/references/contract-index.md`
5. task-relevant tests and source symbols
6. only the specification sections needed for the behavior being changed

Core architecture/specification references include:

- `docs/product/PRD.md`
- `docs/product/MVP_ACCEPTANCE.md`
- `docs/architecture/SYSTEM_ARCHITECTURE.md`
- `docs/architecture/DOMAIN_MODEL.md`
- `docs/architecture/RC1_PREMIUM_3D_ARCHITECTURE.md`
- `docs/architecture/RC1_CHARACTER_PRESENTATION.md`
- `docs/architecture/LIVING_OFFICE_TECHNICAL_DESIGN.md`
- `docs/architecture/ADR-0004-office-renderer-evolution.md`
- `docs/contracts/WORKFLOW_CONTRACT.md`
- `docs/contracts/EVENT_CONTRACT.md`
- `docs/contracts/EXECUTOR_ADAPTER.md`
- `docs/security/WORKTREE_POLICY.md`
- `docs/security/SECURITY_MODEL.md`
- `docs/ux/INFORMATION_ARCHITECTURE.md`

Use targeted symbol/section lookup rather than reading every large specification
for every change.

## Technology

Backend:

```text
Python 3.12+
FastAPI
Pydantic
SQLite
pytest
Ruff
MyPy
```

Frontend:

```text
React
TypeScript
Vite
Vitest
React Testing Library
React Three Fiber
Three.js
Playwright / Chromium renderer smoke
ESLint
```

Realtime:

```text
REST for commands and canonical reads
SSE for server-to-browser operational events
```

Architecture:

```text
local-first modular monolith
adapter-based executor integration
isolated Git worktrees
R3F production Office projection
```

Distributed infrastructure such as Kafka, Redis, Celery, Kubernetes, or a
microservice split is not introduced without measured requirements.

## Development

Backend:

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

Frontend:

```bash
cd frontend
npm ci
npm test
npm run typecheck
npm run lint
npm run build
```

Full repository gate:

```bash
./scripts/verify.sh
```

GitHub Actions verification is accepted only when the runner starts and the real
repository, backend, and frontend steps execute and pass. A pre-run platform
failure with missing steps/logs is not green evidence.

## Safety Defaults

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

The user's project main working tree must never be cleaned, reset, stashed,
committed, pushed, or merged automatically by Agent Office runtime behavior.

## Dependency Hardening

Dependency updates are treated as a release-hardening lane rather than silently
mixed into active product slices.

Renderer/runtime/toolchain changes such as Three.js, Uvicorn, TypeScript, or
test/lint major versions require fresh verification against the current `main`.
A historical green run against an older base does not authorize a later merge.

## Development Status

The authoritative checkpoint, exact PR heads, verification run numbers, merge
SHAs, active branch, dependency lane, and known limitations live in:

`.agents/skills/ao-milestone/references/current-phase.md`

README intentionally does not duplicate the active phase number. Check the
milestone reference against committed code, Git state, and verification evidence
before starting implementation.

## Contribution and Agent Instructions

All coding agents must read `AGENTS.md` before changing the repository and must
keep implementation, tests, architecture documents, and milestone truth in sync.
