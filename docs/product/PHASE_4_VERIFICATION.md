# Agent Office Phase 4 Verification

Status: Accepted
Phase: Phase 4 — Worktree Safety + Review + Evidence
Verification date: 2026-09-20
Final implementation checkpoint: `7db2585 feat: close candidate lifecycle and cleanup semantics`

## Scope

Phase 4 proves the safety and truthfulness boundary for ReferenceExecutor-driven write workflows before any real AI executor is connected.

The acceptance source is `docs/product/MVP_ACCEPTANCE.md` §§58–84. Phase 4 passes when a ReferenceExecutor-driven write workflow can modify a temporary repository safely, produce Findings/Evidence, preserve the registered Project main tree, and clean/reconcile worktrees correctly.

Phase 4 was delivered incrementally through:

```text
Phase 4A   workspace and Git worktree safety foundation
Phase 4B   review, Finding, Evidence, command verification
Phase 4C-1 explicit candidate truth and Evidence freshness
Phase 4C-2 multi-writer integration and conflict safety
Phase 4C-3 restart, cleanup, reconciliation, and historical closure
```

This document reconciles the phase-specific verification records into the final Phase 4 closure decision.

## Final canonical verification

The canonical repository gate was executed after Phase 4C-3 implementation on 2026-09-20:

```bash
./scripts/verify.sh
```

Observed result:

```text
BACKEND: PYTEST
612 passed, 2 warnings
expected xfail: 0

BACKEND: RUFF
All checks passed!

BACKEND: FORMAT
171 files already formatted

BACKEND: MYPY
Success: no issues found in 117 source files

FRONTEND: TEST
7 test files passed
39 tests passed

FRONTEND: TYPECHECK
PASS

FRONTEND: LINT
PASS

FRONTEND: BUILD
PASS

REPOSITORY: DIFF CHECK
PASS
```

The two Python warnings are FastAPI/Starlette dependency deprecations already present in earlier verification runs. They do not represent a Phase 4 regression or failed acceptance criterion.

## Acceptance reconciliation

### Worktree manager, lifecycle, and main-tree protection — §§59–71

**Accepted.** Phase 4A established the managed Workspace boundary and the Git worktree adapter.

Verified properties include:

- repository validation before allocation
- exact base revision capture
- opaque managed workspace path references
- containment checks before filesystem/Git operations
- durable one-writer ownership
- separate worktrees for parallel writers
- Git-based tracked/untracked change capture
- path traversal, absolute-path, and symlink-escape rejection
- cleanup by Workspace identity rather than arbitrary raw path
- cancellation/unknown-execution retention
- idempotent cleanup behavior
- restart reconciliation/orphan handling
- dirty main working tree preservation

The main working tree is never used as a fallback write or verification target.

Primary evidence: `docs/product/PHASE_4A_VERIFICATION.md` plus the Phase 4A worktree safety tests.

### Read-only review and Finding lifecycle — §§72–75

**Accepted.** Phase 4B added independent review and durable Findings without allowing the reviewer to become an implementation writer.

Verified properties include:

- reviewer context is read-only
- unexpected reviewer mutation is detected as a policy violation
- Findings are durable and retain original history
- Finding lifecycle supports remediation and re-review
- accepted risk requires an explicit user/control-plane action and reason
- executors cannot self-approve accepted risk

Primary evidence: `docs/product/PHASE_4B_VERIFICATION.md` and Phase 4B review/Finding tests.

### Evidence truthfulness, command boundary, and verification gates — §§76–80

**Accepted.** Phase 4B added append-only Evidence and bounded verification commands; Phase 4C-1 closed candidate attribution and freshness gaps.

Verified properties include:

- unsuccessful or unavailable verification is never represented as a fabricated pass
- Evidence records factual command outcome rather than provider self-report
- command execution is bounded and shell-free
- repository/host-mutating commands are denied by policy
- verification runs in the explicit candidate Workspace
- `Run.candidate_workspace_id` is durable
- candidate fingerprint includes uncommitted tracked and untracked state
- Evidence is bound to candidate Workspace identity and fingerprint
- Evidence that was valid for candidate state F1 cannot satisfy the gate after mutation to F2
- completion refuses required failed or stale verification

Primary evidence: `docs/product/PHASE_4B_VERIFICATION.md` and `docs/product/PHASE_4C1_VERIFICATION.md`.

### Parallel writers and integration truth — §§62, 80–83

**Accepted.** Phase 4C-2 removed the remaining multi-writer ambiguity.

For multiple relevant writers:

```text
writer workspace A ----\
                         -> managed INTEGRATION_WORKTREE -> explicit candidate
writer workspace B ----/
```

Verified properties include:

- source writer Workspaces remain isolated
- disjoint writer changes may be integrated into one managed integration candidate
- overlapping changed paths fail closed before the integration target is mutated
- no allocation-order or latest-workspace heuristic chooses the final candidate
- review and verification bind to the integrated candidate
- the registered main branch remains unchanged
- `Run COMPLETED` with integration still unmerged into main is representable
- Agent Office does not automatically commit or merge to the default branch

Primary evidence: `docs/product/PHASE_4C2_VERIFICATION.md` and the Phase 4A/4B integration acceptance tests.

### Restart, cleanup, reconciliation, and historical completion — §63, §§67–71, §84

**Accepted.** Phase 4C-3 closed the lifecycle after candidate designation and verification.

Verified properties include:

- integration candidate identity survives persistence restart
- candidate-bound Evidence survives restart
- dirty candidate/integration Workspaces are retained rather than destructively discarded
- reconciliation preserves dirty worktrees
- repeated cleanup is safe/idempotent
- a clean completed candidate may be released safely
- once a completed candidate has been safely released, the historical completion result remains internally consistent instead of reporting contradictory missing-current-worktree Evidence
- stale-Evidence protection still applies while a candidate exists and mutates
- cleanup does not mutate the registered Project main working tree

Primary evidence: `backend/tests/test_phase4c3_closure.py` and the final canonical verification result above.

## Candidate lifecycle proven

The completed Phase 4 candidate lifecycle is:

```text
single relevant writer
    -> isolated writer Workspace
    -> explicit candidate

multiple relevant writers
    -> isolated writer Workspaces
    -> managed integration Workspace
    -> explicit candidate

candidate
    -> read-only review
    -> Finding/remediation/re-review as required
    -> bounded verification
    -> candidate-bound Evidence
    -> completion gate
    -> Run COMPLETED while main remains unchanged/unmerged
    -> safe release only when cleanup conditions permit
```

At no point does Phase 4 require mutation of the user's registered main working tree.

## Safety boundary retained

Phase 4 does **not** authorize or implement:

- real Codex, Antigravity, OpenClaw, Hermes, or other external AI execution
- automatic commit of agent changes
- automatic merge into the user's default branch
- rebase or cherry-pick as integration strategy
- push or force-push
- destructive reset/clean/restore of the user's main working tree
- heuristic conflict resolution for overlapping writer paths

`ReferenceExecutor` remains the Phase 4 executor boundary.

## Final conclusion

Phase 4 satisfies the exit criterion in `MVP_ACCEPTANCE.md` §84.

A ReferenceExecutor-driven write workflow can now:

```text
modify an isolated temporary repository safely
preserve the registered main working tree
run independent review
produce durable Findings and truthful Evidence
verify one explicit candidate state
integrate multiple disjoint writers safely
fail closed on conflicts
survive restart
reconcile and clean worktrees safely
complete without auto-commit or auto-merge
```

Therefore:

```text
Phase 4A   CLOSED
Phase 4B   CLOSED
Phase 4C   CLOSED
Phase 4    CLOSED
Phase 5    NEXT — not started
Phase 6    real executor not started
```

Phase 5 may now build the operational frontend on top of the truthful Phase 4 backend state. Real provider executors remain deferred to Phase 6.
