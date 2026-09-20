# Agent Office Phase 4C-1 Verification

Status: Accepted
Phase: Phase 4C-1 — Candidate Truth and Evidence Freshness
Verification date: 2026-09-20
Base checkpoint: `02955a2 chore: harden agent context workflow`

## Scope

Phase 4C-1 removes implicit "latest workspace" candidate selection from review
and verification for the single-candidate case. It makes the candidate workspace
an explicit durable Run fact, binds Evidence to the exact candidate state that
was verified, and prevents stale Evidence from satisfying completion after the
worktree changes.

Phase 4C-1 delivers:

- durable `Run.candidate_workspace_id`
- additive SQLite schema migration to version 9
- single-candidate designation that is explicit and fail-closed
- review and verification bound to the designated candidate workspace
- deterministic candidate-state fingerprint for committed plus uncommitted state
- fingerprint coverage for tracked changes and untracked file content
- command Evidence carrying candidate workspace identity and state fingerprint
- review DIFF_SUMMARY handoff carrying the same candidate identity
- freshness checks shared by verification status and completion gating
- remediation reuse of the designated candidate workspace
- stale Evidence rejection after candidate mutation

Phase 4C-1 does **not** implement multi-writer integration, a real AI executor,
auto-commit, auto-merge, force-push, or destructive Git behavior.

## Candidate truth

The candidate workspace is no longer inferred from creation time. A Run records
its candidate explicitly as `candidate_workspace_id` and review/verification read
that designation.

For the 4C-1 single-candidate case:

```text
one relevant writer
    -> writer workspace may become the candidate

multiple relevant writers
    -> ambiguous
    -> fail closed
    -> integration deferred to 4C-2
```

This prevents review and verification from silently observing different writable
worktrees.

## Candidate-state fingerprint

Commit SHA alone is insufficient because a worktree may contain tracked or
untracked changes without moving `HEAD`.

Phase 4C-1 therefore derives a deterministic fingerprint from the candidate Git
state. Evidence records that fingerprint together with `workspace_id`.

Conceptually:

```text
candidate state F1
    -> verification command runs
    -> Evidence(workspace=W, fingerprint=F1)

candidate mutates to F2
    -> F2 != F1
    -> old Evidence remains immutable
    -> old Evidence no longer satisfies the current candidate gate
```

Freshness is evaluated against the current candidate; historical Evidence is not
rewritten to a synthetic STALE status.

## Persistence

SQLite schema version advances from 8 to 9 to persist candidate workspace
identity on Run state. Migration coverage verifies upgrade behavior and preserves
existing data.

## Verification result

Canonical repository verification was run from the Phase 4C-1 working tree on
2026-09-20.

```text
backend pytest      606 passed, 1 xfailed, 2 warnings
ruff                passed
ruff format         170 files already formatted
mypy                passed (117 source files)
frontend vitest     7 files passed, 39 tests passed
frontend typecheck  passed
frontend lint       passed
frontend build      passed
git diff --check    passed
```

The two Python warnings are dependency deprecations from FastAPI/Starlette test
infrastructure and are not introduced by Phase 4C-1.

## Remaining expected xfail

Exactly one strict xfail remains: the multi-writer verification case that
requires an integration workspace. That xfail is intentionally retained as the
Phase 4C-2 executable blocker.

The stale-Evidence acceptance case that previously xfailed now passes normally.

## Acceptance conclusion

Phase 4C-1 is accepted because:

- candidate identity is durable and explicit
- review and verification consume the same candidate designation
- candidate state is content-sensitive beyond commit SHA
- Evidence is attributable to one candidate workspace/state
- stale Evidence cannot satisfy current verification/completion truth
- ambiguous multi-writer state is not guessed or resolved by recency
- full canonical backend/frontend verification passes

Next milestone: **Phase 4C-2 — multi-writer integration workspace and conflict
safety**.
