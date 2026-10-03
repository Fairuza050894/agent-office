# Agent Office Repository Map

## Start here

Before changing the repository:

1. read `AGENTS.md`;
2. run/read `scripts/context.sh` output when working locally;
3. read `.agents/skills/ao-milestone/references/current-phase.md`;
4. use this map plus `.agents/skills/ao-repo-map/references/contract-index.md`;
5. inspect task-relevant source/tests instead of loading every specification.

## Product and architecture documentation

Core:

- `README.md` — product overview, development, safety, current architecture entry points and visual-acceptance rule
- `AGENTS.md` — repository governance and engineering rules
- `docs/product/PRD.md` — core product requirements
- `docs/product/MVP_ACCEPTANCE.md` — acceptance criteria and historical phase gates
- `docs/architecture/SYSTEM_ARCHITECTURE.md` — control-plane architecture
- `docs/architecture/DOMAIN_MODEL.md` — canonical domain model
- `docs/architecture/RC1_PREMIUM_3D_ARCHITECTURE.md` — current RC1 renderer/presentation architecture, cage-free composition guardrails, floor identity, camera/lighting policy, and visual acceptance workflow
- `docs/architecture/RC1_CHARACTER_PRESENTATION.md` — accepted RC1 character/readability presentation boundary
- `docs/architecture/LIVING_OFFICE_TECHNICAL_DESIGN.md` — current Living Office projection design
- `docs/architecture/ADR-0004-office-renderer-evolution.md` — R3F production ownership and Three.js fallback criteria

Contracts:

- `docs/contracts/WORKFLOW_CONTRACT.md`
- `docs/contracts/EVENT_CONTRACT.md`
- `docs/contracts/EXECUTOR_ADAPTER.md`

Security / Git safety:

- `docs/security/WORKTREE_POLICY.md`
- `docs/security/SECURITY_MODEL.md`
- `docs/security/AGENT_SANDBOX_THREAT_MODEL.md`

Operational/product evolution documents live under `docs/product/`, while
interaction/layout guidance lives under `docs/ux/`.

## Backend

Root:

`backend/src/agent_office/`

Important areas:

- `api/` — HTTP boundary and safe DTOs
- `application/orchestration/` — Task/Run/workflow lifecycle orchestration
- `application/workspaces/` — isolated workspace behavior
- `application/review/` — Finding / ResultReview / human decision behavior
- `application/verification/` — verification/evidence behavior
- `application/audit/` — append-only audit behavior
- `application/recovery/` — restart recovery discovery
- `domain/` — provider-neutral domain types and invariants
- `infrastructure/executors/` — ReferenceExecutor and real executor adapters
- `infrastructure/commands/` — controlled command/verification boundary
- `infrastructure/persistence/` — repositories
- `persistence/sqlite.py` — schema/migrations
- `main.py` — application composition

Canonical backend truth must not be reconstructed from the 3D scene.

## Backend tests

Root:

`backend/tests/`

Search for the existing test family that owns a behavior before introducing a
new pattern. Important coverage areas include:

- orchestration and recovery;
- isolated workspace/Git safety;
- Finding/Evidence/verification;
- result review and managed delivery;
- audit persistence;
- migration compatibility;
- API/domain invariants.

## Frontend

Root:

`frontend/src/`

### Primary product surfaces

- `pages/OfficeWorkspacePage.tsx` — workspace Office/composer surface
- `pages/InboxPage.tsx` or decision/inbox modules — human decision queue
- Task Board modules — delivery pipeline projection
- Project KPI modules — accepted outcome reporting
- Run detail modules — factual execution/review/evidence surfaces

Use code search for the current concrete module name when a product surface has
been decomposed.

### 3D Office production path

- `components/OfficeScene.tsx` — semantic renderer wrapper/recovery boundary
- `components/R3FOfficeScene.tsx` — normal Planning/Live/Replay renderer
- `components/ThreeOfficeScene.tsx` — recovery-only renderer
- `office3d/runtimeProjection.ts` — canonical state -> scene member projection
- `office3d/environment.ts` — functional floors/zones/stations/collision anchors
- `office3d/premiumEnvironment.ts` — RC1 presentation-only wall/perimeter architecture; no room-spanning decorative overhead frame and never canonical occupancy/telemetry/collision truth
- `office3d/premiumEnvironment.test.ts` — floor identity, zero-light ownership, instancing/mesh budget, and maximum decorative-span regression guard
- `office3d/character.ts` — character runtime, variants, verified animation, labels
- `styles/premium-characters.css` — CSS2D premium character/readability presentation
- `office3d/camera.ts` — semantic bounded camera composition and tighter RC1 overview envelope
- `office3d/lighting.ts` — time-of-day lighting policy including neutral/cooler night balance
- `office3d/livingOffice.ts` — floor/zone/presence policy
- `office3d/furniturePolicy.ts` — production/pilot furniture policy
- `office3d/officeFurnitureKit.ts` — verified engineering-pod asset mounting
- `office3d/replay.ts` — replay presentation plan

### Office asset, renderer, and visual verification

Important scripts under `frontend/scripts/` include Office asset fetching,
production guards, screenshot capture, pilot capture, and R3F production smoke.
Check `frontend/package.json` for the canonical script names before invoking them.

For visual Office PRs, GitHub Actions now runs `office:shots` after production
renderer smoke and uploads:

```text
office-visual-acceptance
  -> artifacts/office-shots/
```

The artifact must be inspected before merge. Renderer smoke alone is not visual
acceptance.

## Current domain shape

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

Presentation path:

```text
canonical records
   -> runtime/presence projection
   -> R3F scene members
   -> environment + premium architecture + characters
```

Writable AgentRuns must use isolated managed Git worktrees.

The user's project default branch/main working tree must not be mutated, pushed,
or merged automatically by Agent Office runtime execution.

## Verification

Canonical full repository verification:

```bash
./scripts/verify.sh
```

GitHub Actions evidence is valid only after the runner starts and the real
repository/backend/frontend steps execute and pass. `steps=null` or missing logs
from a pre-run infrastructure failure is not a passing gate.

For visual Office changes, screenshot artifact generation and inspection are
additional required evidence.

## Active checkpoint

Do not duplicate active phase/branch truth in this map. Read:

`.agents/skills/ao-milestone/references/current-phase.md`

That file owns exact PR heads, verification run numbers, merge SHAs, current RC1
scope, dependency-hardening status, visual-acceptance state, and known
limitations.
