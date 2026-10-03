# Phase 20 — Human Result Gate & Managed Delivery

## Status

Implementation checkpoint after Phase 19.

## Product correction

Phase 19 exposed factual Task/Run KPI but still allowed a technical `Run.COMPLETED` result to be described too closely to business delivery. Phase 20 separates those meanings explicitly:

```text
Run COMPLETED
    = technical workflow completion gates passed

Result DELIVERED
    = a human approved that completed candidate
      and Agent Office created a local managed accepted branch/commit
```

`COMPLETED` never implies that the user accepted the result.

## Canonical flow

```text
Describe
  → Plan / approve requirement + team
  → Promote / explicitly start execution
  → Work
  → Verify + review
  → Run COMPLETED (ready for human review)
  → Human result decision
      ├─ Request changes
      │    → append bounded human feedback to the same Task
      │    → create a new remediation Run
      │    → completed source Run remains immutable history
      └─ Approve & deliver
           → record RESULT_APPROVED
           → commit verified candidate in managed worktree
           → create agent-office/<run>/accepted-<workspace> managed branch
           → record RESULT_DELIVERED
           → never push, never merge, never touch main
```

## Result-review projection

Result state is derived from technical Run truth plus append-only AuditRecords:

- `NOT_READY`
- `AWAITING_REVIEW`
- `CHANGES_REQUESTED`
- `APPROVED`
- `DELIVERED`

This deliberately avoids changing the established meaning of terminal Run statuses or rewriting historical Run rows.

## Human request-changes semantics

A human change request does not reopen or mutate a `COMPLETED` Run.

Instead:

1. bounded feedback is appended to the same Task as an explicit human review constraint;
2. the source Run and feedback are recorded in audit;
3. a fresh Run is created for that same Task;
4. the existing orchestration Task-context contract carries the amended constraint to the next execution;
5. the old Run remains immutable technical history.

The Task objective is never silently rewritten.

## Managed local delivery

Delivery is intentionally local-only in this checkpoint.

The Git adapter may:

- stage candidate changes inside the Agent Office-managed candidate worktree;
- create a local commit with command-scoped Agent Office author identity;
- create a generated `agent-office/<run>/accepted-*` branch at that commit.

It must not:

- push;
- merge;
- rebase;
- cherry-pick;
- checkout or mutate the user's main/default branch;
- change Git remotes;
- change repository-global Git configuration.

A Git-provider pull-request adapter remains a separate security-design decision.

## KPI correction

Phase 20 removes the misleading `Task delivery` projection based solely on `Run.COMPLETED`.

The Phase 19 summary now says `Runs completed` and explicitly states that technical completion is not human delivery. Accepted-change KPI is added only from the result-review/delivery truth path rather than inferred from execution status.

## UI

Run Detail now exposes a dedicated **Result decision** surface above diagnostic tabs:

- `Approve & deliver`
- `Request changes`
- remediation Run link when changes are requested
- managed branch + commit when delivery succeeds

Run tabs remain technical evidence/debug surfaces. Human acceptance is intentionally prominent rather than hidden inside a diagnostic tab.

## Acceptance gates

```text
backend Phase 20 result-review tests
backend pytest / Ruff / format / MyPy
frontend tests / typecheck / lint / build
repository whitespace verification
Office character production guard
production Office guard
Chromium Planning / Live / Replay R3F smoke
```

## Non-goals

Phase 20 does not add:

- auto-merge;
- remote push;
- provider PR creation;
- named-user authentication;
- generic workflow HUMAN_APPROVAL steps;
- fake acceptance-criterion evidence.

Those capabilities require their own explicit trust/security contracts.
