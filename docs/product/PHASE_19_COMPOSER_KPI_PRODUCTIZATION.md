# Phase 19 — Universal Composer & KPI Productization

## Status

**COMPLETE / MERGED**

```text
PR: #43
exact verified head: e0638374ef4c647e81d344d3e56fdc44623b5565
GitHub Actions verify #1461: SUCCESS
merge commit: 6e6680dc27ad6428feba099fd2c04c269a59444b
```

## Product goal

Move Agent Office from a strong technical control plane toward a sellable business-orchestration product:

1. the user describes an outcome once;
2. the Universal Composer restores or creates durable planning context;
3. Agent Office resolves intent/team/workflow/executor through existing safety contracts;
4. approved work becomes canonical Task/Run execution;
5. the Office visualizes factual work;
6. Project KPI reports delivery outcomes from canonical Task/Run history.

The product should reduce configuration burden without weakening execution approval, audit, evidence, or repository safety.

## Delivered

### Zero-config Composer hardening

The Composer supports `AUTO`, `ASK`, `PLAN`, `BRAINSTORM`, and reviewed `RUN` intent. Phase 19 fixes context drift and makes the intended default clearer:

- AUTO remains the default orchestration mode;
- restored threads derive their requested intent from the active context;
- preferred/restored executor context derives from the selected project/thread;
- composer drafts are keyed to project/thread context so a stale instruction cannot silently carry into a different work context;
- an empty executor selection means auto-resolve rather than invalid state;
- the primary prompt asks for the desired outcome rather than implementation plumbing;
- RUN remains a reviewed intent and never bypasses canonical Task/Run promotion.

This preserves durable planning, RequirementCandidate approval, TeamProposal truth, workflow selection, executor safety, and explicit execution boundaries already implemented by the backend.

### Canonical Project KPI projection

`projectKpiSnapshot()` derives only factual metrics already present in Task and Run records:

- total Tasks;
- Tasks with execution history;
- unstarted Tasks;
- delivered Tasks, defined as latest Run status `COMPLETED`;
- active/completed/failed/cancelled Runs;
- Run success rate over completed + failed outcomes;
- Task delivery rate;
- average completed Run cycle time when start/end timestamps exist;
- remediation cycles;
- Tasks with retry attempts;
- latest recorded Task/Run activity;
- task-level attempts, latest Run/state, cycle time, and completion timestamp.

Unavailable facts remain `null` / `—`; the product does not invent missing measurements.

### KPI report surface

`/kpi` provides a project-scoped report with:

- delivery summary;
- execution-health summary;
- task delivery table;
- direct navigation to Office and Run Detail;
- project selection preserved in the URL;
- project-keyed loading/fact state so metrics from one Project cannot be shown as if they belonged to another Project during context changes.

The report deliberately does **not** rank agents or infer individual productivity. It reports process and delivery facts suitable for engineering/product operations.

## Business interpretation

The KPI foundation supports future commercial reporting such as:

- throughput by period;
- cycle-time trend;
- failure/retry/remediation trend;
- workflow/stage bottlenecks;
- verification/evidence coverage;
- requirement-to-delivery traceability;
- portfolio/project comparison.

Those later reports should extend the same canonical fact model rather than introducing an opaque AI productivity score.

## Why no Graphify / Obsidian / extra knowledge platform in this checkpoint

The current product already has Project, Task, Run, Workflow, AgentRun, Event, Evidence, Finding, ComposerThread, RequirementCandidate, and TeamProposal as explicit durable entities. Adding another graph/knowledge platform before Phase 19 would create synchronization and deployment complexity without improving the immediate sellable workflow.

Graph projection may be added later as a read model when cross-project dependency/service relationships require it. It should not become the source of execution truth.

## Acceptance gates

```text
KPI projection tests: PASS
KPI report page test: PASS
Universal Composer context-resync test: PASS
existing planning/orchestration tests: PASS
frontend tests (193) / typecheck / lint / build: PASS
backend pytest / Ruff / format / MyPy: PASS
Office character production guard: PASS
production Office guard: PASS
Chromium Planning / Live / Replay R3F smoke: PASS
repository whitespace verification: PASS
```
