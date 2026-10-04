# U0 — Managed Delivery Real-Git Correction

## Purpose

U0 closes a real production-path defect in human-approved managed delivery before
the target-UI work proceeds. The result-review service tests historically used a
fake delivery adapter, so the real Git branch-collision probe was not exercised by
that phase coverage.

## Defect

`GitManagedResultDelivery.deliver()` previously used:

```text
git show-ref --hash --verify refs/heads/<accepted>
```

and interpreted return code `1` as "accepted branch does not exist". On the
supported Git path used during reproduction, a missing ref can return a different
non-zero status, causing the safe delivery path to fail with:

```text
Accepted branch collision check failed
```

That blocks `approve-and-deliver`, prevents a Task from reaching truthful
`DELIVERED`, and consequently prevents Accepted-change KPI/dossier projections
from being populated by real delivery records.

## Correction

The probe now uses:

```text
git rev-parse --verify --quiet refs/heads/<accepted>^{commit}
```

with the intended semantics:

- `0` — ref resolves to a commit; verify it matches the candidate commit;
- `1` — ref is absent; create the generated accepted managed branch;
- any other status — fail closed as a collision-check error.

No checkout, merge, rebase, push, remote mutation, default-branch mutation, or
repository-global Git configuration is introduced.

## Regression coverage

`backend/tests/test_phase20_real_git_delivery.py` executes real Git commands only
inside pytest temporary repositories and covers:

1. delivery to a new generated accepted branch;
2. idempotent repeated delivery to the same accepted commit;
3. rejection when an existing accepted branch points elsewhere.

`backend/tests/test_u0_managed_delivery_api.py` exercises the public
`approve-and-deliver` HTTP endpoint against the fully composed application,
ReferenceExecutor, temporary SQLite database, temporary source repository, real
managed worktree, and real `GitManagedResultDelivery` adapter.

## Required verification

The exact PR head must pass a real GitHub Actions run whose jobs actually start
and execute repository/backend/frontend steps. A pre-run infrastructure failure
with `steps=null` or missing logs is not accepted.

Canonical gate:

```bash
./scripts/verify.sh
```

Backend-specific evidence expected inside that gate includes:

```bash
pytest
ruff check .
ruff format --check .
mypy src
```

## Truth and safety boundary

U0 changes only managed local delivery correctness and its regression coverage.
It does not change Task/Run/AgentRun/Event/Evidence/ResultReview semantics. Human
approval remains distinct from technical Run completion. Agent Office runtime
still never automatically pushes or merges a user's Project default branch.

## Status

Implementation prepared on `u0-managed-delivery-fix`. Exact-head CI and merge
remain mandatory before U1 target-UI implementation starts.
