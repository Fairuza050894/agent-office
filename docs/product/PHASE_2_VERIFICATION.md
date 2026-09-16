# Agent Office Phase 2 Verification

Status: Accepted
Phase: Phase 2 — Project / Task / Run Persistence
Verification date: 2026-09-16
Checkpoint: `878472d feat: integrate task and run frontend`

## Scope

Phase 2 establishes durable ownership for:

```text
Project
  └── Task
       ├── Run
       ├── Run
       └── Run
```

Specifically, Phase 2 delivers:

- durable Task and Run persistence in SQLite (schema version 3)
- server-side ownership validation for Project → Task → Run
- append-only Run history (multiple Runs per Task, no overwrite)
- archive policy enforcement (archived Project retains history, denies new Runs)
- restart survival of every identity and relationship
- frontend registry integration for Projects, Tasks, and Runs against real backend state

Phase 2 does **not** implement workflow execution, AgentRuns, Events, worktrees, Findings,
Evidence, real executors, or Office View.

## Checkpoint

```text
HEAD  878472dbe7dddc0317d33e1313c0d32de05efc88
```

The worktree was clean before verification and no tracked file was modified by verification.
The only repository change produced by this verification is this document.

## Backend Gate

Executed from `backend/` using the existing virtual environment:

```text
.venv/bin/python -m pytest -q
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src
```

Actual results:

```text
pytest              139 passed, 2 warnings in 12.56s
ruff check          All checks passed!
ruff format --check 64 files already formatted
mypy src            Success: no issues found in 47 source files
```

Warnings are external dependency deprecations only, identical in nature to those documented in
`PHASE_1_VERIFICATION.md`:

- `StarletteDeprecationWarning` from `fastapi/testclient.py` (httpx/starlette TestClient)
- `DeprecationWarning` for the `anyio.abc.BlockingPortal` alias

Neither warning originates in Agent Office application code. No code was altered to suppress them.

## Frontend Gate

Executed from `frontend/`:

```text
npm test
npm run typecheck
npm run lint
npm run build
```

Actual results:

```text
npm test           7 test files passed, 39 tests passed
npm run typecheck  passed (tsc -b)
npm run lint       passed (eslint .)
npm run build      passed, 49 modules transformed
```

Build output:

```text
dist/index.html                 0.45 kB
dist/assets/index-G97aipws.css  12.95 kB
dist/assets/index-CWhwbMeh.js  268.76 kB
```

## Ownership Verification

Live acceptance ran against a real HTTP backend (`127.0.0.1:8001`) with a temporary data root and
a temporary SQLite database. Two disposable real Git repositories (`project-a`, `project-b`, each
`git init -b main` with one commit) were registered. All 57 assertions passed.

Recorded identities:

```text
Project A  6d311849-b456-45e2-a77f-0019c1163fff   ARCHIVED
Project B  104ddca0-6e26-46c2-a278-7409711a33d5   ACTIVE
Task A     cb4cdf64-24d7-4e31-89ed-52026d25abee   → Project A
Task B     67e289d8-39d8-4fa0-82f2-0b58379feed2   → Project B
Run A1     e8170346-f522-483c-85c2-9975a37c72b4   → Task A / Project A
Run A2     58d9f67a-e2b3-4880-afbd-715839252449   → Task A / Project A
Run B1     4c152dc4-e88a-41ab-81f4-175999cefa60   → Task B / Project B
```

Two-project isolation evidence:

- `GET /api/projects/{Project A}/tasks` returned only Task A; Task B was absent.
- `GET /api/projects/{Project B}/tasks` returned only Task B; Task A was absent.
- `GET /api/tasks/{Task A}` reported `project_id = Project A`; `GET /api/tasks/{Task B}` reported
  `project_id = Project B`.
- Runs returned `project_id`/`task_id` matching their owning Task and Project.

Cross-project rejection is enforced at two independent layers:

1. Application: `RunService.validate_run_ownership` raises `OwnershipError` when a Run is validated
   against a foreign Project (`test_application_rejects_cross_project_run_ownership`).
2. Database: the composite foreign key `runs(project_id, task_id) → tasks(project_id, id)` rejects a
   Run/Task pair spanning two Projects with `sqlite3.IntegrityError`
   (`test_database_rejects_cross_project_task_run_pair`).

## Run History

- Creating Run A1 and Run A2 for Task A produced distinct IDs.
- `GET /api/tasks/{Task A}/runs` returned exactly 2 Runs.
- Both Runs remained independently retrievable by ID.
- Run A2's payload after later operations was byte-identical to its creation response — no overwrite
  of prior Run history occurred.
- Run A1 and Run A2 remained readable after Project A was archived.
- After a real backend restart, Task A's run history still contained both Runs.

Runs are created with `status = CREATED` and `requested_executor_id = null`. Run creation records an
execution attempt only; it performs no workflow dispatch.

## Archive Policy

`POST /api/projects/{Project A}/archive` succeeded and returned `status = ARCHIVED`.

After archival:

- `GET /api/projects/{Project A}` still returned the Project (readable).
- `GET /api/tasks/{Task A}` still returned the Task.
- `GET /api/runs/{Run A1}` and `GET /api/runs/{Run A2}` still returned both historical Runs.
- `GET /api/tasks/{Task A}/runs` still returned the complete history.
- `POST /api/tasks/{Task A}/runs` was rejected with **HTTP 409 Conflict**; no Run row was created.
- Project B remained `ACTIVE`, retained its Task, and could still create Runs.

The policy was also enforced in the UI: the "Create run for Task A" control rendered **disabled** in
the accessibility tree with the description "Archived projects cannot create new Runs." A click on it
produced no new Run (run count for Task A unchanged at 2).

## Restart Persistence

Procedure executed for real:

1. Started the backend against temporary database `/tmp/ao-phase2-qhkdm8/data/agent-office.sqlite`.
2. Created Projects, Tasks, and Runs, then archived Project A.
3. Stopped the backend process (exit 143) and confirmed port 8001 was released.
4. Restarted the backend against the **same** database file.

Actual results (16 assertions, 0 failures):

```text
Project A exists, Project B exists
Task A exists, Task B exists
Run A1 exists, Run A2 exists
Task A belongs to Project A
Task B belongs to Project B
Run A1 belongs to Task A and Project A
Run A2 belongs to Task A and Project A
archived state of Project A preserved
Project B remains ACTIVE
Task A run history still contains both Runs
archived Project A still denies new Runs (HTTP 409)
per-project task lists remain isolated
```

Database schema version observed: `current_schema_version = 3`, `LATEST_SCHEMA_VERSION = 3`.

## Frontend Integration

Two distinct levels were verified.

**HTTP / proxy level (executed).** Vite dev server on `127.0.0.1:5173` (`--strictPort`) proxying to
the temporary backend on `127.0.0.1:8001`. All 16 assertions passed:

```text
GET /                                                      200, Vite HTML shell
GET /health                                                200, {"status":"ok"}
GET /version                                               200
GET /api/projects                                          200, contains Project A and Project B
GET /api/projects/{Project A}/tasks                        200, exactly [Task A]
GET /api/tasks/{Task A}/runs                               200, exactly {Run A1, Run A2}
GET /api/runs/{Run A1}                                     200
proxied Project DTO                                        no git/internal path keys
```

**Browser level (executed).** A real Chromium session drove the built dev app:

- `/projects` rendered the registry table with real rows: `Project A / project-a / main / Archived`
  and `Project B / project-b / main / Active`, and offered the archive action only for Project B.
- `/tasks` rendered 2 real Tasks with project attribution, latest Run id, and `CREATED` state, plus
  the disabled Create-Run control for the archived Project A.
- `/runs` rendered all real Runs across projects with `CREATED` state and no requested executor.
- Submitting the "Create Run" modal for Task B created a new durable Run
  (`4d83979f-6839-4387-8a54-52f30e9ff3ad`, `status = CREATED`, `project_id = Project B`,
  `requested_executor_id = null`), confirmed by a subsequent backend query. The modal states:
  "Create a durable Run record for Task B. This does not start an AI executor or workflow."
- No fabricated progress, cost, quota, token usage, reviewer, or agent activity was rendered; the
  Overview surface honestly reported zero active runs and unavailable executor status.

## Security / Safety

- Backend bound to loopback `127.0.0.1` only; the temporary backend used port 8001.
- The unrelated service already listening on port 8000 was never contacted, modified, or terminated.
- No real AI executor exists or was invoked. `ReferenceExecutor` remains deterministic and local.
- No auto commit, auto merge, force push, reset, clean, restore, or stash was performed at any point.
- Task, Run, and Project DTOs exposed no `repository_path`, `canonical_path`, `git_common_dir`, or
  `/tmp/` path substring. Project DTOs expose only the repository leaf name.
- Temporary Git repositories and the temporary SQLite database were created under `/tmp` and are not
  tracked by Git.
- Repository content and the registered repositories were never mutated by registration or execution;
  registration validated Git identity read-only.

## Deferred to Later Phases

Phase 2 does **not** implement:

- WorkflowDefinition execution
- WorkflowSnapshot execution
- Stage orchestration
- AgentProfile orchestration
- AgentRun orchestration
- Event stream / SSE
- worktree execution
- Findings / Evidence workflow
- real write-capable AI executor
- Office View

Runs created in Phase 2 are durable execution-attempt records only. They carry no workflow snapshot,
no stage state, no AgentRuns, and no executor dispatch.

## Known Limitations

- The `except OwnershipError` branch in `GET /api/runs/{run_id}` is currently unreachable: no HTTP
  route accepts a caller-supplied Project for Runs, so a cross-project read is unrepresentable over
  HTTP. Ownership validation exists and is tested at the application and database layers instead.
  This is not a Phase 2 acceptance blocker; it should be revisited when a Run route gains a Project
  scope in a later phase.
- `frontend/dist/` exists locally as build output from this verification; it is git-ignored.

## Decision

```text
Phase 2 ACCEPTED
```

Every required Phase 2 acceptance property passed against real evidence:

```text
1  Task belongs to exactly one Project                          PASS
2  Run belongs to exactly one Task                              PASS
3  Run belongs to the same Project as its Task                  PASS
4  Multiple Runs can exist for one Task                         PASS
5  New Runs never overwrite historical Runs                     PASS
6  Cross-project ownership violations are rejected              PASS (service + DB constraint)
7  Archived Project history remains readable                    PASS
8  Archived Project cannot create a new Run                     PASS (HTTP 409, UI disabled)
9  Project/Task/Run survive backend restart                     PASS
10 Two unrelated Projects remain isolated                       PASS
11 No repository absolute paths in Task/Run DTOs                PASS
12 Frontend shows real Project/Task/Run state only              PASS
13 Creating a Run implies no workflow or AI execution           PASS
14 Phase 2 remains provider-neutral                             PASS
15 No real write-capable AI executor introduced                 PASS
```
