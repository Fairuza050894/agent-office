# Task Detail Five-Step Mapping

U2 renders five steps: Plan / Work / Verify / Review / Deliver.
Task has no status field, so every step is a pure derivation from
canonical records. No new lifecycle is invented.

## Sources

```text
Task                       -> Plan context (title/objective/requirements)
Run.status                 -> Work step, latest-execution card
VerificationStatus         -> Verify step, Checks tab
ResultReview               -> Review + Deliver steps, header gates
Evidence metadata          -> command_status / exit_code / duration_ms
AgentRun / WorkflowSnapshot -> Agents summary line
WorkspaceStatusResponse    -> Changes tab + base revision
RunFindingsResponse        -> Findings tab + open blocker count
EventPageResponse          -> Timeline tab
```

## Mapping

### Plan

- `runs.length === 0` -> `current`, "Task created, no Run yet".
- `runs.length > 0` -> `done`, "N Run(s) created".
- Task creation itself is the plan fact. There is no planning-thread link
  in the Task domain, so no Composer thread is claimed here.

### Work

- No latest Run -> `pending` (or `current` when stale runs exist).
- `COMPLETED` -> `done`.
- `BLOCKED` / `FAILED` / `CANCELLED` -> `blocked`.
- Any other Run status -> `current` with the literal status as detail.

### Verify

- No Run -> `pending`.
- `verification` fetch failed or null -> `unavailable`.
- `checked === false` -> `pending`, "No verification obligation declared".
  Orchestration-only Runs honestly report no obligation.
- All required checks satisfied -> `done`.
- Any observed `command_status` or evidence -> `current` with
  "M of N required checks satisfied".
- Otherwise -> `pending`, no evidence recorded.

### Review

- Fetch failed or null -> `unavailable`.
- `DELIVERED` -> `done`.
- `AWAITING_REVIEW` / `CHANGES_REQUESTED` / `APPROVED` -> `current`
  with the matching detail.
- `NOT_READY` -> `pending`.

### Deliver

- Fetch failed or null -> `unavailable`.
- `DELIVERED` -> `done`, "Delivered to \<managed branch\>".
- `APPROVED` -> `current`, "Delivery pending".
- Otherwise -> `pending`, "Not delivered".

Technical `COMPLETED` and human `DELIVERED` are never collapsed.

## Columns

Board column and Task summary status share one projection
(`frontend/src/components/taskBoardProjection.ts`):

```text
no Run                          -> Planning
review DELIVERED                 -> Accepted
review AWAITING_REVIEW          -> Needs you
Run BLOCKED / FAILED            -> Needs you
Run CREATED / READY             -> Ready
Run REVIEWING / VERIFYING /
    REMEDIATING / COMPLETED     -> In review
Run PLANNING / RUNNING          -> Running
else                            -> Planning
```

## Header gates

- Approve enabled only when `approveDisabledReason()` returns null;
  otherwise the button is disabled and the reason is rendered as text.
- Request changes additionally requires non-empty feedback.
- Reasons derive from Run status, review `state`, and `can_*` flags:
  non-COMPLETED Run, unavailable review, DELIVERED, CHANGES_REQUESTED,
  APPROVED (request path), NOT_READY, or `can_* === false`.

## Tabs

- Changes / Findings / Evidence / Checks / Timeline reuse the Run tab
  components against the latest Run: no parallel Task-tab implementation.
- File +/- lists render only from captured `WorkspaceChangeSummary`
  paths (`+added`, `~modified`, `-deleted`, `?untracked`).
- Checks table joins `VerificationStatus.checks` to command Evidence by
  `evidence_id`; command, exit code, and duration come only from typed
  metadata keys. Absent values render `Unavailable`, never zero.
- Counts that fail to load render `—` with an explicit note; loaded
  records stay factual.
