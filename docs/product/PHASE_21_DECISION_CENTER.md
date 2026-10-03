# Phase 21 — Task Decision Center

## Status

Implementation checkpoint after Phase 20 Human Result Gate & Managed Delivery.

## Product correction

Agent Office previously had strong Run diagnostics and a living 3D Office, but the user still had to discover when a human decision was required. Phase 21 makes **Task + decision** the primary work surface while keeping Office as the living operational visualization.

The product hierarchy becomes:

```text
Inbox / Task Board
  → Task decision page
      → Run diagnostics when needed
      → 3D Office for living operational context
```

## Inbox

`/inbox` is a derived, read-only projection of canonical work that currently waits for a human decision.

Initial decision classes:

- latest Run `CREATED` / `READY` → explicit start-execution gate;
- latest Run `BLOCKED` → operator recovery decision;
- latest Run `FAILED` → inspect and decide the next attempt;
- technically `COMPLETED` result with result-review state `AWAITING_REVIEW` → human result acceptance gate.

Inbox never invents a notification or workflow state. If no canonical record requires human action, the Inbox says **Nothing needs you**.

## Task Board

`/board` projects every active Project Task into one of six columns:

```text
Planning
Ready
Running
In review
Needs you
Accepted
```

Columns are derived from persisted Task, latest Run, and result-review state. Cards are deliberately **not draggable**. Moving a card through drag-and-drop would mutate presentation without changing workflow truth and is therefore prohibited.

`Accepted` is used only when the latest result-review projection is `DELIVERED`. A technically completed Run alone remains `In review` or `Needs you` depending on its human-review state.

## Task decision page

`/tasks/{taskId}` becomes the human-centered work surface for one objective. It shows:

- Project and Task identity;
- objective;
- Task constraints, including bounded human result-review amendments;
- the product lifecycle path:
  `Plan → Promote → Implement → Verify → Review → Your review → Deliver → Accepted`;
- latest execution Run;
- explicit start-execution gate when the latest Run is still `CREATED` / `READY`;
- blocked execution explanation;
- Phase 20 Result decision panel after technical completion;
- immutable Run history with links to detailed diagnostics.

Run Detail remains the source for technical evidence, findings, tests, changes, workflow, agents, and normalized activity. Phase 21 does not duplicate those diagnostics into the Task surface.

## Navigation

WORK navigation now prioritizes:

1. Inbox
2. Task Board
3. Office
4. Overview
5. Projects
6. Runs
7. Tasks registry

This intentionally moves human decision flow ahead of visualization and administrative registries without removing the 3D Office.

## Safety invariants

- Board and Inbox are read models only.
- No drag-to-change-state.
- Start execution calls the existing canonical Run start API.
- Result approval/delivery remains behind Phase 20 human gate.
- Office visualization never becomes execution truth.
- No fake notification count is generated.
- No accepted state is inferred from `Run.COMPLETED`.

## Acceptance gates

```text
Decision Center model/UI tests
existing Run Detail / Task / Office tests
frontend typecheck / lint / build
backend pytest / Ruff / format / MyPy
repository whitespace verification
Office character production guard
production Office guard
Chromium Planning / Live / Replay R3F smoke
```

## Next trust layer

Phase 22 should extend this decision-first product with evidence-based Change Dossier export, explicit local notification delivery, operational guardrails, retention/cleanup policy, and threat-model evidence. It must not re-center the roadmap on visual polish.
