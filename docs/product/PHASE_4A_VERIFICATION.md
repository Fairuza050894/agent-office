# Agent Office Phase 4A Verification

Status: Accepted
Phase: Phase 4A — Workspace and Git Worktree Safety Foundation
Verification date: 2026-09-17
Checkpoint: `ee14d97 docs: close phase 3 acceptance`

## Scope

Phase 4A establishes the safe Workspace boundary required before any
write-capable AgentRun may touch a repository.

> **The registered Project's main working tree is never mutated by agent
> execution.** Write-capable work uses an isolated Git worktree.

Specifically, Phase 4A delivers:

- the `Workspace` aggregate with its canonical kind, access-mode, and lifecycle
- a `GitWorktreeManager` infrastructure adapter using argument-safe subprocess
  invocation only
- durable, exclusive write ownership with atomic acquisition
- an orchestration allocation gate that runs **before** any executor call
- bounded, Git-lifecycle-based release that never discards unrecorded changes
- restart reconciliation that observes, and never destroys or recreates
- canonical `workspace.*` Events and append-only AuditRecords
- a read-only inspection API

Phase 4A does **not** implement Findings, Evidence, artefact storage, real
command or test execution, or a real AI executor. It does not make the
worktree a security sandbox.

## Checkpoint

```text
HEAD  ee14d97bd9987384eb5cf8c1e1b84a35e7286cd1
```

The worktree was clean before verification (`git status --short` empty, including
`frontend/`).

## Architecture

```text
Run
 └── AgentRun (WRITE / BOUNDED_WRITE)
        ↓  allocation gate, before any executor call
     Workspace           identity: id, project, run, owner, kind, access_mode
        ↓  path_ref     opaque relative storage reference
     GitWorktreeManager  derives and containment-checks the absolute location
        ↓  git worktree add -b agent-office/<run>/<profile>-<workspace>
     isolated worktree under the managed workspace root
```

The main working tree is read only, and only to resolve the base revision. Every
filesystem write happens inside the managed workspace root.

### Identity is not a path

`Workspace.path_ref` is an opaque, relative, system-generated reference with
three identifier segments. The absolute location is recomputed from the
configured workspace root on every infrastructure operation and checked for
containment before use.

This answers the open domain question `DOMAIN_MODEL` §69.3 in favour of opaque
storage references, and it makes path substitution structurally impossible:
there is no stored absolute path for a caller to influence, and no route that
accepts one.

`Settings.workspace_root` defaults to `data_root/workspaces`, so generated
worktrees live inside Agent Office's own storage rather than inside a registered
repository.

## Schema

The database moved from schema version 6 to **7**.

```text
v6 → v7   additive only
          CREATE TABLE workspaces
          ALTER TABLE agent_runs ADD COLUMN workspace_id
          CREATE INDEX workspaces_run_idx
          CREATE INDEX workspaces_owner_idx
          CREATE INDEX workspaces_status_idx
```

Committed migrations v1–v6 were **not** modified. Version 7 adds new objects
only. `test_persistence/test_phase4a_migration.py` builds a genuine v6 database
by applying the real migrations in order, then asserts that the migration is
purely additive and that pre-existing rows survive untouched.

Foreign keys are enforced, so a Workspace cannot reference a Project, Run, or
AgentRun that does not exist.

## Automated Gates

Executed from `backend/` using the existing virtual environment:

```text
.venv/bin/python -m pytest -q
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src
```

Actual results:

```text
pytest              510 passed, 2 warnings in 222.84s
ruff check          All checks passed!
ruff format --check 148 files already formatted
mypy src            Success: no issues found in 100 source files
```

Warnings are the same two external dependency deprecations documented in the
Phase 1–3 verification records. No code was altered to suppress them.

## Worktree Allocation

Conceptual safe sequence, all of it implemented
(WORKTREE_POLICY §20):

```text
validate repository            git rev-parse --show-toplevel / --is-inside-work-tree
resolve repository identity    git rev-parse --git-common-dir, compared to registration
resolve base revision          git rev-parse HEAD
choose managed path            <workspace_root>/<project>/<run>/<workspace>
generate dedicated branch      agent-office/<run>/<sanitized-profile>-<workspace>
create worktree                git worktree add -b <branch> <path> <base_revision>
validate resulting worktree    identity re-verified before use
Workspace READY
```

Every Git invocation is `subprocess.run(["git", "-C", <path>, ...])` with an
argument array and a timeout. `shell=True` is never used, and no command string
is ever built from input.

**No forbidden operation exists in the implementation.** There is no `git reset`,
`git clean`, `git restore`, `git checkout --`, `git stash`, `git rebase`,
`git merge`, force push, or `git worktree remove --force` anywhere in the
codebase. The only mutating Git commands issued are `worktree add` and
`worktree remove` (never forced) plus `branch -d` (never `-D`).

## Dirty Main Tree Preservation

The live acceptance ran against a **deliberately dirty** repository created
before any allocation:

```text
 M README.md              tracked modification
?? user-untracked.txt     untracked user file
```

After allocating three Workspaces, writing inside one isolated worktree,
inspecting, reconciling, and requesting release, the main tree was verified
byte-for-byte:

```text
main README.md byte-identical to the pre-allocation content      PASS
main user-untracked.txt byte-identical                           PASS
main HEAD unchanged                                              PASS
main branch unchanged (main)                                     PASS
main git status --porcelain unchanged                            PASS
no stash created (git stash list empty)                          PASS
no extra commit created (rev-list --count HEAD unchanged)         PASS
the isolated change is absent from the main tree                 PASS
```

The same properties are asserted in
`test_phase4a_worktree_safety.py::test_bcd_main_tree_dirty_state_is_preserved_byte_for_byte`,
where the dirty fixture is created before allocation and both files are compared
as bytes afterwards.

## Base Revision

Every writable Workspace records the exact commit SHA it was created from,
resolved before worktree creation. The domain refuses a writable Workspace that
reaches a post-allocation state without one.

The live run confirmed all three allocated Workspaces recorded the exact
pre-allocation HEAD.

`test_g_base_revision_is_captured_and_frozen` then moves the main branch forward
with a new commit and proves that:

- the Workspace still reports its original base revision
- the worktree's own HEAD still resolves to that original revision, not to the
  moved branch

so a Workspace never silently follows later branch movement.

## Write Ownership

`Workspace.owner_agent_run_id` carries the single active owner. Acquisition is
one conditional SQL statement:

```sql
UPDATE workspaces
   SET owner_agent_run_id = ?, status = 'IN_USE', updated_at = ?
 WHERE id = ?
   AND owner_agent_run_id IS NULL
   AND status = 'READY'
```

The condition is evaluated by the database, so two concurrent writers cannot
both succeed regardless of application-level races.

Verified:

- a second writer is refused with a truthful message
- the refusal emits the canonical `workspace.conflict.detected` Event
- a Workspace may only be owned by an AgentRun of the same Run **and** Project
- ownership is released once the owning execution is terminal, so a Workspace is
  not held forever
- granting and releasing ownership is idempotent
- releasing ownership is a no-op for a Workspace that can no longer take writes,
  so settling a finished assignment cannot resurrect a released one

Allocation is idempotent per AgentRun, keyed on the Workspace the AgentRun
durably records (`agent_runs.workspace_id`) rather than on current ownership,
since ownership is transient. A repeated request reuses the recorded Workspace
and creates no second worktree.

## Executor Start Gate

`RunOrchestrator._prepare_workspace` runs after the capability gate and
**before** the AgentRun is marked `STARTING` and before `adapter.start()`.

For `READ_ONLY` assignments it is a no-op. For `BOUNDED_WRITE` or `WRITE` it
requires all of: the Project repository validated, a writable Workspace
allocated, ownership acquired, status `READY`, and a recorded base revision.

If any step fails, the AgentRun is blocked with `WORKSPACE_UNAVAILABLE` and the
executor is never called.

Proof uses a workflow whose **first** stage is write-capable, so the gate is the
only thing that could have started execution:

```text
repository removed after registration
→ Run BLOCKED / WORKSPACE_UNAVAILABLE
→ executor.start_calls == 0
→ executor.cancel_calls == 0
→ AgentRun BLOCKED, workspace_id null, started_at null
→ Stage IMPLEMENTATION BLOCKED / WORKSPACE_UNAVAILABLE
→ workspace.failed emitted, agent.start.requested NOT emitted
→ completion gates incomplete
```

The block reason is reported truthfully. A `WORKSPACE_UNAVAILABLE` block maps to
its own canonical Stage and Run reason codes, so it is never reported as an
unknown execution state.

Phase 3 behaviour is preserved: a read-only assignment needs no Workspace, and
`test_k_read_only_assignments_need_no_workspace` asserts that every read-only
AgentRun has a null `workspace_id` while every write AgentRun holds one.

## Workspace Inspection

`GET /api/workspaces/{id}/status` returns the durable lifecycle state plus a
factual change summary produced by Git
(`git status --porcelain -z --untracked-files=all`, `git diff --numstat`,
`git rev-parse HEAD`).

- `--untracked-files=all` is deliberate: without it Git collapses an untracked
  directory into a single entry, which would hide the individual files that are
  genuinely unrecorded changes.
- Every path is repository-relative. The tests assert no leading `/`, no `..`,
  and no backslash.
- Insertion and deletion counts stay `null` when Git cannot report them
  numerically (for example a binary file), rather than being estimated.
- Change inspection is never taken from an executor's self-report.

No absolute path, canonical path, git common dir, or `path_ref` appears in any
DTO. The live run asserted this across the Run, Workspace, status, AgentRun,
Event, and Audit DTOs.

## Release and Cleanup Semantics

Release is not deletion, and it is never unconditional.

```text
attached writer present          → refuse; keep status; reason EXECUTION_UNRESOLVED
worktree cannot be inspected     → retain; ORPHANED;   reason WORKTREE_UNMANAGED
worktree holds unrecorded changes → retain; READY;      reason DIRTY_WORKTREE
git worktree remove fails         → retain; ORPHANED;   reason CLEANUP_FAILED
otherwise                         → remove worktree; safe-delete branch; RELEASED
```

Removal goes through `git worktree remove`, which itself refuses to destroy a
worktree holding modifications — exactly the protection the policy relies on.
The generated branch is deleted only with the safe `-d` form, which refuses when
the branch holds commits not already reachable from the base; a branch holding
recorded work is therefore retained rather than force-deleted. A branch outside
the `agent-office/` namespace is never deleted at all.

`git worktree remove --force` is never used, and `git worktree prune` is not
invoked at all.

Release is idempotent: a released Workspace stays `RELEASED` and a repeat
request returns the same payload. A released Workspace never accepts new writes.
Durable Workspace rows survive release, so history remains auditable after the
filesystem is gone.

Verified: a deliberately dirty worktree was retained with
`reason_code = DIRTY_WORKTREE` in the live run, and its unrecorded file was still
present afterwards.

## Restart and Reconciliation

After a real database reopen and a real process restart, Workspace metadata
(identity, project, run, base revision, branch) survived unchanged, and the
retained worktree was re-verified against its Project's registered repository
identity.

Reconciliation is a comparison, never a repair:

```text
CONFIRMED_READY / CONFIRMED_IN_USE / CONFIRMED_RELEASED   healthy
MISSING     worktree gone        → ORPHANED, reason WORKTREE_MISSING
CONFLICT    different repository → ORPHANED, reason REPOSITORY_IDENTITY_MISMATCH
ORPHANED    path exists, not a recognised worktree → reason WORKTREE_UNMANAGED
```

A missing worktree is **never silently recreated**, because recreating it could
hide lost work. An unrecognised directory is reported, never deleted. The live
restart confirmed the unrecorded worktree change still existed, that release
still refused to discard it with the same durable reason, and that the main tree
was still exactly the user's dirty state.

## Security and Path Protection

Verified rejections:

- `../escape`, `../../etc/passwd`, `a/../../b` → rejected
- `/etc/passwd`, `~/secrets` (absolute or home-relative) → rejected
- empty and whitespace-only references → rejected
- a managed component that is a symlink pointing outside the root → rejected
- a location resolving outside the managed workspace root → rejected
- an audit/workspace target that is not a canonical identifier → rejected

Symlink behaviour:

- an untracked symlink inside a worktree is an unrecorded change, so the
  worktree is **retained** rather than destroyed
- when a symlink is recorded and cleanup does run, the worktree is removed
  without following the symlink, and the external target and its content survive
- a `path_ref` cannot be absolute, cannot traverse, and must consist of exactly
  three system-identifier segments

Repository identity is revalidated before any sensitive operation: the managed
repository path must equal the registered canonical path, and its Git common
directory must still match registration, or allocation refuses.

No route accepts a filesystem path. There is no allocation endpoint, no
arbitrary-path DELETE, no shell execution, and no raw Git command surface. A
Workspace is always addressed by logical identity.

## Events and Audit

Phase 4A implements all nine canonical workspace events from
`EVENT_CONTRACT` §38:

```text
workspace.allocation.requested   intent, before any external effect
workspace.created                the worktree now exists
workspace.ready                  the Worktree validated and is usable
workspace.changed                lifecycle or reconciliation observation
workspace.conflict.detected      a second writer was refused
workspace.release.requested      intent, never a claim of removal
workspace.released               removal proved successful
workspace.failed                 allocation failed
workspace.orphaned               cleanup could not be proven safe
```

Request events describe intent and completion events describe committed facts,
per §101 and §102. Payloads carry identity and lifecycle facts only —
`workspace_id`, `workspace_kind`, `access_mode`, `status`, `base_revision`,
`reason_code` — and never an absolute path. The live run asserted that no Event
payload contains the temporary root path.

No `review.finding.*`, `evidence.*`, `test.*`, `command.*`, `git.*`, or
`workspace.conflict`-inventing event was added, and the Phase 3 taxonomy test was
extended rather than loosened: the implemented event set is still an exact,
closed allowlist, now including the workspace domain and still excluding every
evidence domain.

Audit is separate from Events. Phase 4A records five workspace actions:

```text
WORKSPACE_ALLOCATED                SYSTEM — automated allocation
WORKSPACE_RELEASE_REQUESTED        USER   — operator request
WORKSPACE_RELEASED                 SYSTEM — automatic settlement on release
WORKSPACE_RECONCILIATION_REQUESTED USER   — operator request
WORKSPACE_BRANCH_DELETED           SYSTEM — bounded branch cleanup
```

Each carries correct Project and Run ownership, `target_type = WORKSPACE`, and
the Workspace as `target_id`. Attribution is truthful: automated workspace
actions are `SYSTEM`, operator requests are `USER`, and no audit record is
written as an operational Event. Audit records remain append-only, enforced at
the storage layer.

## APIs

```text
GET  /api/runs/{run_id}/workspaces          Workspaces of one Run
GET  /api/workspaces/{workspace_id}         one Workspace
GET  /api/workspaces/{workspace_id}/status  lifecycle plus Git change summary
POST /api/workspaces/{workspace_id}/release request bounded release
POST /api/workspaces/{workspace_id}/reconcile compare against the filesystem
```

An unknown Workspace is a 404 on every one of these routes. Allocation happens
through orchestration only and is never driven by a caller-supplied path.

## Live Temporary-Repository Acceptance

A real `uvicorn` server on `127.0.0.1:8001` from the unmodified production
composition, a temporary data root and SQLite database, and a temporary Git
repository that was made dirty before allocation.

**Phase A: 56 assertions, 0 failures**, covering: the dirty fixture; Project
registration; a write-capable Run completing; Workspaces allocated with correct
ownership, kind, writability, base revision, and generated branches; Git
agreeing on one live worktree per workspace with every one inside the managed
root and outside the repository; a bounded change written into one isolated
worktree; change inspection reporting exactly one repository-relative path; the
main tree unchanged in content, HEAD, branch, and status with no stash and no
extra commit; no path leakage in any DTO or Event payload; truthful
reconciliation; and release refusing to discard the unrecorded change.

**Phase B: 16 assertions, 0 failures** after a real process restart on the same
database — Workspace identity, ownership, base revision, and branch preserved;
the unrecorded change still present; release still refusing with the same
durable reason; the main tree still exactly the user's dirty state.

Only temporary resources were created, and they were deleted afterwards. No
valuable user repository was touched: the live run used `/tmp` exclusively, and
the port-8000 service was never contacted.

## Regression

`test_phase4a_worktree_safety.py` covers families A–W: clean allocation, dirty
preservation, untracked preservation, unchanged HEAD, unchanged branch, isolated
write activity, base revision, ownership, cross-Project rejection, no-write
without a Workspace, no executor start before READY, status inspection,
repository-relative paths, no absolute path in DTOs, restart persistence,
post-restart reconciliation, missing worktree, dirty worktree retention,
idempotency, branch collision, traversal, and symlink escape.

All Phase 1–3 tests continue to pass unchanged. The `enterprise-engineering`
happy path now allocates real isolated worktrees end to end inside the existing
Phase 3 acceptance suite, which is the strongest available evidence that the gate
integrates without disturbing orchestration.

Frontend gates were run even though no frontend file may change:

```text
npm test            7 test files passed, 39 tests passed
npm run typecheck   passed (tsc -b)
npm run lint        passed (eslint .)
npm run build       passed, 49 modules transformed
```

`git status --short frontend/` is empty.

## Known Limitations

- **Worktree isolation is not a sandbox.** It bounds which working tree an
  executor is given; it does not confine a process. No executor runs in Phase 4A.
- **No command execution exists.** The ReferenceExecutor is unchanged and cannot
  run a shell. The bounded write used to prove isolation is a test-only action
  confined to the managed root.
- **Read-only assignments get no Workspace.** Reviewers cannot yet be pointed at
  an implementation worktree; that requires the Phase 4B review handoff.
- **A workspace-blocked Run cannot be resumed in place.** Re-driving the
  assignment would require returning a `BLOCKED` AgentRun to a pre-start state,
  which the AgentRun state machine forbids. The block is reported as a policy
  block, resume returns 409, and the operator resolves the cause and starts fresh
  work. This is deliberate rather than advertised-but-broken resumability.
- **No orphan cleanup tooling.** Orphaned Workspaces are identified and retained
  for operator review; nothing sweeps them automatically, per §128.
- **`git worktree prune` is not invoked**, so stale metadata from out-of-band
  directory deletion persists until an operator acts. The implementation refuses
  to remove a location Git does not recognise rather than pruning blindly.
- **Write scope is one writer per worktree.** Per-file or per-region ownership
  (`DOMAIN_MODEL` §25) is not implemented; parallel writers need separate
  Workspaces, which the gate provides.
- **Single-instance assumption.** §176/§177 allow the MVP to assume one backend;
  no application lock is implemented.
- **`INTEGRATION_WORKTREE` and `TEMPORARY` kinds are modelled but unused.**
  Integration is Phase 4B+ work.
- **The `except OwnershipError` branch in `GET /api/runs/{run_id}` remains
  unreachable**, unchanged since Phase 2.

## Decision

```text
Phase 4A ACCEPTED
```

Every safety-critical requirement passed against real evidence:

```text
1   Workspace aggregate matches DOMAIN_MODEL §23                       PASS
2   Main working tree never mutated by agent execution                 PASS
3   Dirty tracked user modification preserved byte-for-byte            PASS
4   Untracked user file preserved byte-for-byte                        PASS
5   Main HEAD unchanged                                               PASS
6   Main branch unchanged                                             PASS
7   No stash, no commit, no cleanup of user files                     PASS
8   Write work happens in an isolated worktree                        PASS
9   Exact base revision captured and frozen                           PASS
10  Worktrees live inside the managed root and outside the repository  PASS
11  Durable, exclusive, atomic write ownership                        PASS
12  Second writer refused; conflict event emitted                     PASS
13  Cross-Project workspace ownership rejected                        PASS
14  Cross-Run workspace ownership rejected                            PASS
15  Executor start never called without a READY Workspace              PASS
16  Workspace failure blocks Stage and Run truthfully                  PASS
17  Read-only assignments need no Workspace                           PASS
18  Change inspection is Git-derived and repository-relative           PASS
19  No absolute path in any DTO or Event payload                       PASS
20  Release refuses to discard unrecorded changes                      PASS
21  Branch deletion is safe-form only; user branches untouched          PASS
22  Workspace records survive restart                                  PASS
23  Post-restart reconciliation observes, never recreates              PASS
24  Missing worktree is not silently recreated                         PASS
25  Unrecognised directory is reported, never deleted                  PASS
26  Traversal and absolute paths rejected                              PASS
27  Symlink escape cannot delete outside the root                      PASS
28  Repository identity revalidated before allocation                 PASS
29  Canonical workspace Events only; taxonomy remains closed            PASS
30  Workspace actions audited with truthful attribution                 PASS
31  Additive v6 → v7 migration; earlier data preserved                  PASS
32  All Phase 1-3 tests pass; frontend unchanged and green              PASS
```

This accepts **Phase 4A only**. Phase 4 as a whole is not accepted:
Findings, Evidence, real command and test execution, review handoff, and
integration remain outstanding.
