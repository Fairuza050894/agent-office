# Agent Office — Worktree Policy

Status: Draft  
Version: 0.1  
Scope: Repository identity, Git worktree lifecycle, write ownership, dirty-tree protection, cancellation safety, cleanup, retention, containment, and integration rules

---

## 1. Purpose

This document defines the repository and workspace safety contract for Agent Office.

Agent Office coordinates multiple AI agents across multiple software repositories. Some AgentRuns may inspect code, while others may modify files in parallel. Without strict workspace rules, autonomous agents can overwrite user changes, conflict with each other, or damage repository state.

The Worktree Policy exists to guarantee that:

- managed projects remain isolated
- the user's main working tree is protected
- parallel writers use isolated worktrees
- write ownership is explicit
- destructive Git operations are forbidden by default
- cancellation does not release a workspace prematurely
- cleanup is safe and repeatable
- historical runs remain auditable
- repository paths cannot escape configured boundaries
- integration never implies automatic merge to the user's branch

---

## 2. Core Principles

1. The main project working tree is not the default autonomous write target.
2. Read-only inspection may use the main project tree when safe.
3. Write-capable AgentRuns use isolated worktrees.
4. One writable worktree has one active autonomous writer.
5. Parallel writers never share one writable worktree.
6. Worktree cleanup occurs only after execution is known to be safe.
7. Dirty user changes are never reset, cleaned, stashed, committed, or discarded automatically.
8. Git destructive commands are forbidden by default.
9. Repository identity is validated before every sensitive workspace operation.
10. Paths are canonicalized and checked against configured roots.
11. Run completion does not mean changes are merged.
12. Workspace lifecycle state is backend-authoritative.

---

## 3. Terminology

### Project Repository

The user-owned Git repository registered in Agent Office.

Example:

```text
/Users/user/Projects/technical-documentation-platform
```

### Main Working Tree

The user-visible working tree at the registered repository path.

### Git Common Directory

The shared `.git` metadata location used to verify worktree membership and repository identity.

### Managed Workspace Root

Agent Office-controlled location for generated worktrees.

Example:

```text
~/.agent-office/workspaces/
```

### Workspace

A filesystem execution context allocated to one Run.

### Writable Workspace

A workspace where an AgentRun may modify repository files.

### Read View

A read-only view used by Architect, Explorer, QA, Security, or other review roles.

### Integration Workspace

A dedicated workspace used to combine outputs from multiple implementation worktrees before review.

---

## 4. Repository Registration

Before a Project becomes ACTIVE, Agent Office validates:

- path exists
- path is a Git repository
- repository root is resolvable
- Git common directory is resolvable
- default branch can be identified or explicitly supplied
- repository is not inside Agent Office internal storage
- repository identity does not duplicate another active Project unexpectedly

Validation does not modify the repository.

---

## 5. Repository Identity

Project identity must not rely on display name alone.

Conceptual identity:

```text
RepositoryIdentity
├── canonical_repository_path
├── git_common_dir
├── remote_origin?
├── repository_fingerprint?
└── registered_at
```

`canonical_repository_path` and `git_common_dir` should be resolved through safe canonicalization.

Symlink resolution must not permit escape into an unrelated repository.

---

## 6. Repository Revalidation

Before starting a writable AgentRun, revalidate:

- registered path still exists
- Git repository still matches Project identity
- expected Git common directory remains consistent
- base branch/revision can be resolved
- workspace root is available
- no conflicting active Agent Office workspace ownership exists

If identity cannot be confirmed:

```text
Run → BLOCKED
```

Do not continue based on stale assumptions.

---

## 7. Main Working Tree Protection

The main working tree may contain valuable user changes.

Agent Office must never automatically:

```text
git reset --hard
git clean -fd
git clean -fdx
git checkout -- .
git restore .
git stash
git commit
git add -A
git rebase
git merge
```

against the main working tree unless a future explicit user-approved operation is designed for it.

---

## 8. Dirty Main Working Tree

A dirty main working tree is not automatically an error.

Agent Office should inspect:

```text
git status --porcelain
```

or equivalent safe plumbing.

Possible behavior:

```text
dirty main working tree
        ↓
preserve user changes
        ↓
create isolated worktree from explicit base revision
```

If Git constraints prevent safe worktree creation:

```text
Run → BLOCKED
```

with an actionable explanation.

---

## 9. Dirty State Visibility

UI may show:

```text
Main working tree: Dirty
```

with factual summary such as:

```text
7 modified
2 untracked
```

Do not expose unrelated sensitive filenames unless appropriate.

Do not imply Agent Office owns those changes.

---

## 10. Base Revision

Every writable Workspace must record a base revision.

Example:

```text
base_revision = <commit SHA>
```

The base revision is resolved before worktree creation.

This enables:

- reliable diff calculation
- historical audit
- integration
- safe retry reasoning
- comparison with branch movement

---

## 11. Branch Movement

If the default branch moves after Workspace creation, the active Workspace continues from its recorded base revision.

Agent Office must not automatically:

```text
pull
rebase
merge latest main
```

during an autonomous Run.

A later integration action may reconcile changes explicitly.

---

## 12. Managed Workspace Root

Recommended location:

```text
~/.agent-office/workspaces/
```

Structure:

```text
~/.agent-office/workspaces/
└── <project-id>/
    └── <run-id>/
        ├── backend/
        ├── frontend/
        ├── docs/
        └── integration/
```

Do not store generated Agent Office worktrees inside unrelated repositories.

---

## 13. Workspace Path Derivation

Workspace paths must derive from system-generated safe identifiers.

Good:

```text
~/.agent-office/workspaces/prj_01/run_42/backend/
```

Bad:

```text
~/.agent-office/workspaces/<raw user task title>/
```

Never use untrusted user text directly as filesystem paths.

---

## 14. Path Canonicalization

Before filesystem operations:

1. resolve configured root
2. resolve target path
3. verify target remains within allowed root
4. reject traversal
5. reject unsafe symlink redirection where relevant

Conceptually:

```text
resolved_target.is_relative_to(resolved_allowed_root)
```

must be true for managed storage.

---

## 15. Symlink Safety

Symlinks inside managed workspaces may be legitimate repository content.

However, Agent Office infrastructure operations must not follow a symlink when that would:

- delete outside managed root
- write outside assigned workspace
- inspect unrelated secrets
- escape repository policy boundary

Deletion/cleanup should operate on the worktree root path itself without recursively following unsafe external symlinks.

---

## 16. Workspace Kinds

Initial kinds:

```text
PROJECT_READ_VIEW
GIT_WORKTREE
INTEGRATION_WORKTREE
TEMPORARY
```

### PROJECT_READ_VIEW

Read-only logical access to registered repository.

### GIT_WORKTREE

Isolated worktree assigned to a write-capable AgentRun.

### INTEGRATION_WORKTREE

Isolated worktree used to combine or inspect multiple outputs.

### TEMPORARY

Non-repository bounded scratch area where explicitly needed.

---

## 17. Workspace Access Modes

Canonical access:

```text
READ_ONLY
BOUNDED_WRITE
WRITE
```

An AgentProfile requests an access mode.

Workspace Coordinator determines the actual enforceable mode.

If requested isolation cannot be enforced:

```text
do not pretend it is enforced
```

Block or require explicit approval.

---

## 18. Workspace Lifecycle

Canonical lifecycle:

```text
ALLOCATING
    ↓
READY
    ↓
IN_USE
    ↓
RELEASING
    ↓
RELEASED
```

Alternative states:

```text
FAILED
ORPHANED
```

---

## 19. Allocation Contract

Allocation requires:

- Project identity
- Run identity
- owner AgentRun where writable
- base revision
- requested access mode
- workspace kind

Allocation must be idempotent for the same request identity where practical.

---

## 20. Git Worktree Creation

Conceptual safe sequence:

```text
validate repository
        ↓
resolve base revision
        ↓
choose Agent Office workspace path
        ↓
create dedicated branch/ref if needed
        ↓
git worktree add
        ↓
validate resulting worktree
        ↓
Workspace READY
```

Implementation should use argument-safe subprocess invocation rather than shell string interpolation.

---

## 21. Worktree Branch

Writable worktrees may use generated branches such as:

```text
agent-office/<run-id>/<agent-key>
```

Example:

```text
agent-office/run-42/backend
```

Branch naming must use sanitized system identifiers.

---

## 22. Branch Collision

If generated branch already exists:

- validate whether it belongs to the same durable Workspace
- resume only if identity matches
- otherwise generate a collision-safe branch or block

Never attach an AgentRun to an arbitrary preexisting branch solely because the name matches.

---

## 23. Detached Worktree Option

A writable workspace may also use a detached HEAD if implementation/integration semantics permit it.

If so, completion must make uncommitted/unmerged state very clear.

MVP recommendation:

prefer dedicated generated branches for writable workspaces because they improve inspectability.

---

## 24. Write Ownership

Every writable Workspace has one active autonomous owner:

```text
Workspace.owner_agent_run_id
```

A second writer may not attach concurrently.

---

## 25. Ownership Acquisition

Before AgentRun starts writing:

```text
Workspace READY
        ↓
ownership acquired
        ↓
AgentRun may start
```

Ownership acquisition should be atomic.

---

## 26. Ownership Release

Ownership is released only after:

- external execution is confirmed terminal
- pending filesystem activity is complete
- change inspection is captured
- Workspace transitions toward release or handoff

Cancellation request alone is insufficient.

---

## 27. Parallel Writers

Allowed:

```text
Backend Agent
→ backend worktree

Frontend Agent
→ frontend worktree
```

Not allowed:

```text
Backend Agent
→ same worktree

Frontend Agent
→ same worktree
```

even if they claim to edit different files.

---

## 28. Path-Based Write Scope

Future/optional policy may declare:

```text
allowed_paths
denied_paths
```

Example:

```text
Backend:
backend/**

Frontend:
frontend/**
```

If path enforcement is not technically implemented, UI must not claim it is enforced.

---

## 29. Overlapping Write Scope

If two parallel writer plans overlap:

```text
serialize
```

or allocate an explicit integration strategy.

Do not rely on agent promises.

---

## 30. Shared Files

Examples of commonly shared files:

```text
package.json
pyproject.toml
README.md
.env.example
docker-compose.yml
generated lock files
shared API types
```

These increase merge conflict risk.

The planner should flag them before parallel write execution where possible.

---

## 31. Integration Workspace

When multiple writers produce independent branches/worktrees:

```text
Backend output ──┐
                 ├── Integration Workspace
Frontend output ─┘
```

Integration occurs separately from implementation workspaces.

---

## 32. Integration Does Not Mean Merge to Main

Integration may create a review-ready combined branch.

It must not automatically modify the user's default branch.

Possible state:

```text
Run: COMPLETED
Integration: READY_FOR_REVIEW
Main branch: UNCHANGED
```

---

## 33. Auto-Merge

MVP default:

```text
auto_merge = false
```

No autonomous merge into user-owned branches.

---

## 34. Auto-Commit

MVP default:

```text
auto_commit = false
```

Agents may modify isolated worktrees without automatically committing unless workflow explicitly supports controlled commits later.

---

## 35. Commit Creation

If future policy permits commit creation:

- only in managed worktree
- commit identity explicit
- commit message generated under bounded policy
- no signing credential misuse
- no push by default
- AuditRecord created

---

## 36. Push Policy

Default:

```text
git push = restricted
git push --force = forbidden
```

Remote mutation is outside basic local MVP workflow.

---

## 37. Forbidden Git Commands

Default forbidden:

```text
git reset --hard
git clean -fd
git clean -fdx
git push --force
git push -f
git checkout -- .
git restore --source ... --worktree --staged .
```

Equivalent destructive forms should also be recognized.

---

## 38. Restricted Git Commands

Potentially restricted:

```text
git merge
git rebase
git cherry-pick
git commit
git push
git branch -D
git worktree remove --force
```

Approval depends on workflow and target workspace.

---

## 39. Allowed Git Commands

Typical read-only allowed operations:

```text
git status
git diff
git log
git show
git rev-parse
git branch --show-current
git ls-files
git ls-tree
```

Write-capable safe operations inside assigned worktree may include normal file edits through tools rather than arbitrary Git mutation.

---

## 40. Command Policy Scope

Command classification must consider:

- command
- arguments
- current working directory
- Workspace ID
- Project ID
- AgentRun ID
- access mode

The same command may be allowed in one context and forbidden in another.

---

## 41. Shell Interpolation

Infrastructure should avoid:

```text
shell=True
```

where possible.

Prefer argument arrays.

Example:

```python
["git", "status", "--porcelain"]
```

instead of concatenated shell strings.

---

## 42. Workspace Change Detection

Authoritative change inspection should use Git.

Potential sources:

```text
git status --porcelain
git diff --stat
git diff --name-only
git diff --numstat
```

Provider self-reported files are supplemental.

---

## 43. Change Snapshot

A ChangeSnapshot may record:

```text
workspace_id
base_revision
current_revision?
files_changed
insertions?
deletions?
paths
captured_at
```

Detailed diff may become an Artifact.

---

## 44. Untracked Files

Untracked files are real workspace changes.

They must be included in change summary where appropriate.

Do not run `git clean` to simplify state.

---

## 45. Ignored Files

Ignored files may contain secrets or build artifacts.

Agent Office should not automatically enumerate or artifact all ignored files.

Use Git-aware bounded inspection.

---

## 46. Secret Files

Common secret-bearing files:

```text
.env
.env.*
*.pem
*.key
credentials*
secrets*
```

Workspace policy and Security Model should deny unnecessary ingestion into events/artifacts.

---

## 47. Read-Only Review Workspace

Reviewers may inspect:

- implementation worktree
- integration worktree
- diff/artifacts

They should not receive write permission by default.

---

## 48. Reviewer Mutation Detection

If a supposedly read-only reviewer changes files:

- detect Workspace mutation
- mark policy violation
- do not silently accept changes
- Run may become BLOCKED
- preserve evidence

---

## 49. Workspace Mutation Baseline

Before read-only AgentRun:

```text
capture baseline status
```

After review:

```text
capture final status
```

Unexpected delta indicates mutation.

Exact enforcement may depend on executor capability.

---

## 50. Documentation Writer

Documentation Writer may use:

```text
BOUNDED_WRITE
```

Example allowed scope:

```text
docs/**
README.md
```

If bounded path enforcement is unavailable, use separate worktree and review changes carefully.

---

## 51. Workspace Release Preconditions

Do not release Workspace until:

- owner execution is terminal or explicitly abandoned
- cancellation uncertainty is resolved
- required diff/change evidence captured
- dependent reviewer/integration stages no longer need it
- retention policy permits release

---

## 52. Cancellation Safety

Sequence:

```text
cancel requested
       ↓
executor cancellation request
       ↓
wait for confirmation/reconciliation
       ↓
execution terminal
       ↓
capture workspace changes
       ↓
safe release eligibility
```

Never:

```text
cancel requested
       ↓
rm -rf workspace
```

---

## 53. Unknown Execution State

If executor state is UNKNOWN:

```text
Workspace remains protected
Run → BLOCKED
```

Do not clean up automatically.

This prevents a still-running external process from writing into a deleted/reused directory.

---

## 54. Process Safety

CLI-based executor processes should record:

```text
PID or process handle
start time
workspace ID
```

where possible.

A PID alone is not durable proof after restart; reconcile carefully.

---

## 55. External Child Processes

An executor may launch child processes.

Cancellation/cleanup must account for process tree behavior where observable.

Do not assume parent process termination always stops children.

---

## 56. Hung Process

A hung process may delay workspace release.

Prefer:

```text
Run BLOCKED
Workspace IN_USE/ORPHANED
```

over unsafe forced deletion.

Future process isolation may improve guarantees.

---

## 57. Workspace Orphaned

Use ORPHANED when:

- Agent Office cannot safely determine ownership/liveness
- cleanup failed materially
- filesystem state no longer matches durable state

ORPHANED workspaces require operator/user review.

---

## 58. Cleanup

Cleanup removes Agent Office-managed workspace resources only.

Cleanup must be:

- idempotent
- bounded
- path-contained
- symlink-safe
- repeatable
- never destructive to Project main working tree

---

## 59. Cleanup Steps

Conceptually:

```text
verify Workspace identity
        ↓
ensure safe-to-release
        ↓
git worktree remove <managed path>
        ↓
prune known stale worktree metadata if appropriate
        ↓
remove Agent Office-owned branch only if policy permits
        ↓
Workspace RELEASED
```

---

## 60. Cleanup Failure

If cleanup fails:

```text
Workspace → ORPHANED or FAILED
```

depending on lifecycle point.

Do not rewrite primary AgentRun result.

Example:

```text
AgentRun COMPLETED
Workspace cleanup FAILED
```

Both facts can coexist.

---

## 61. Worktree Prune

`git worktree prune` may be used carefully for stale metadata.

It must not be run as a generic destructive recovery command without validation.

---

## 62. Branch Cleanup

Generated branch cleanup must be explicit.

Default MVP recommendation:

```text
retain branch until user/integration decision
```

because automatic deletion may hide valuable work.

---

## 63. Retention Policy

Potential workspace retention:

```text
MANUAL
KEEP_ALWAYS
DELETE_AFTER_INTEGRATION
DELETE_AFTER_N_DAYS
```

MVP default:

```text
MANUAL
```

or a conservative long retention.

---

## 64. Retention Metadata

Workspace may record:

```text
retention_policy
retention_until?
release_requested_at?
released_at?
```

---

## 65. Disk Usage

Agent Office should monitor managed workspace storage.

Safe metrics:

```text
number of workspaces
disk usage
oldest retained workspace
```

Do not auto-delete solely to satisfy an arbitrary dashboard target.

---

## 66. Storage Pressure

If disk pressure becomes high:

- notify user
- identify releasable workspaces
- offer explicit cleanup
- never remove active/uncertain Workspace automatically

---

## 67. Artifact vs Workspace

Workspace is mutable execution state.

Artifact is durable evidence/output.

Before cleanup, important outputs must be copied/published as Artifacts if retention is required.

---

## 68. Workspace Snapshot

MVP does not require full filesystem snapshotting.

Git diff plus artifact capture may be sufficient.

Avoid duplicating entire repositories into artifact storage.

---

## 69. Repository Submodules

Submodules require explicit support.

MVP policy may be:

```text
detect
report
do not automatically initialize/update unless project policy permits
```

Do not fetch arbitrary submodule content silently.

---

## 70. Git LFS

Repositories using Git LFS may require installed tooling/network access.

Agent Office must detect limitations rather than pretending all content is available.

---

## 71. Sparse Checkout

Not required for MVP.

If encountered, preserve repository semantics rather than normalizing destructively.

---

## 72. Bare Repository

Bare repositories are not normal managed Projects for MVP.

Project registration should require a usable working repository unless explicit future support exists.

---

## 73. Nested Git Repositories

Nested repositories may create boundary confusion.

Detect nested `.git` contexts where relevant.

A parent Project does not automatically authorize writes into nested unrelated repositories.

---

## 74. Monorepo

Monorepos are supported as one Project.

Project-specific write scopes/workflows may target subdirectories.

Do not split into multiple Projects automatically without user confirmation.

---

## 75. Multiple Projects Same Repository

Default:

```text
disallow accidental duplicate registration
```

unless explicit advanced use case exists.

Duplicate Projects pointing to the same Git common directory can create workspace conflicts.

---

## 76. Same Project Multiple Runs

MVP recommendation:

```text
one active write Run per Project
```

while multiple read-only Runs may coexist.

This significantly reduces integration complexity.

Future versions may support multiple isolated write Runs.

---

## 77. Project Write Lock

Conceptual lock:

```text
ProjectWriteLease
├── project_id
├── run_id
├── acquired_at
└── released_at?
```

If implemented, it protects against concurrent write Runs.

This is separate from Workspace ownership inside a Run.

---

## 78. Read-Only Concurrency

Read-only Architect/Explorer/Review AgentRuns may run concurrently within configured resource bounds.

---

## 79. Worktree Lock

Workspace allocation and release should use local locking/transactional state to avoid duplicate worktree creation by concurrent orchestration loops.

---

## 80. Crash During Allocation

Possible sequence:

```text
DB says ALLOCATING
git worktree created
process crashes before READY
```

Recovery must inspect:

- persisted Workspace record
- Git worktree list
- filesystem path

Then reconcile instead of creating a duplicate.

---

## 81. Crash During Release

Likewise:

```text
RELEASING
```

on restart should reconcile actual Git/filesystem state.

---

## 82. Worktree Discovery

Use Git worktree metadata to validate managed worktrees.

Do not trust filesystem directory existence alone.

---

## 83. Git Worktree List Parsing

Prefer machine-readable/plumbing output where available.

Parsing must be tested against spaces and unusual path names.

---

## 84. Repository Path With Spaces

Supported.

Never build unsafe shell command strings.

---

## 85. Unicode Paths

Should be preserved correctly.

Canonicalization and database storage use UTF-8-safe handling.

---

## 86. Case Sensitivity

macOS may use case-insensitive filesystem.

Repository identity checks should not rely on case-sensitive string comparison alone.

Use resolved filesystem/Git identity where possible.

---

## 87. Filesystem Permissions

If Agent Office lacks permission:

```text
Workspace allocation FAILED
```

Do not attempt broad chmod/chown automatically.

---

## 88. File Ownership

Agent Office should not modify ownership of Project files.

Managed workspace files inherit normal user execution identity.

---

## 89. Sandboxing

Git worktree isolation is not a security sandbox.

It protects repository state but does not prevent an AI executor from accessing arbitrary local filesystem paths if executor permissions allow it.

Security Model must define stronger boundaries.

---

## 90. Container Isolation

Future executor mode may run workspaces in containers.

Worktree policy still applies conceptually:

```text
one writer
one workspace
explicit mount
base revision
change capture
safe release
```

---

## 91. Network Filesystems

MVP target is local disk.

Network-mounted repositories may have unusual locking/performance semantics.

Support should be treated as experimental until tested.

---

## 92. Filesystem Watchers

Agent Office may later use watchers for UI updates.

Watchers are not authoritative evidence of Git changes.

Git inspection remains authoritative.

---

## 93. Change Capture Frequency

Do not scan entire repository continuously.

Capture change snapshots at meaningful boundaries:

- before AgentRun
- after AgentRun
- before review
- after remediation
- final verification

Additional bounded refresh may support UI.

---

## 94. Change Attribution

Because one writer owns one writable Workspace, changes in that Workspace can be attributed to the owner AgentRun within the active interval, subject to external user mutation caveat.

---

## 95. External User Mutation

User may manually edit a managed worktree.

Agent Office cannot always distinguish those edits from agent edits.

If supported, UI should label attribution as:

```text
workspace changes observed during AgentRun
```

rather than absolute authorship.

---

## 96. Protected Files

ProjectPolicy may deny writes to:

```text
.git/**
.env*
secret files
CI deployment credentials
production manifests
```

Exact policy is project-specific.

---

## 97. `.git` Protection

Agents must never write directly into `.git` internals.

Git operations go through controlled Git tooling.

---

## 98. Git Hooks

Repository hooks may execute during Git operations.

MVP should minimize commands that trigger hooks unexpectedly.

Document this limitation.

Future hardening may isolate hook execution.

---

## 99. Commit Hooks

If future commit support exists, hooks may run arbitrary code.

Commit operation should therefore be restricted/approved and executed only in managed workspace.

---

## 100. Checkout Hooks

Git checkout/worktree operations may invoke filters and related tooling.

Project registration should warn that Git repository tooling itself may execute configured filters.

---

## 101. External Build Artifacts

Build commands may create large or ignored directories:

```text
node_modules
dist
build
.venv
coverage
```

Workspace retention policy must account for disk usage.

Do not include all of them in Evidence automatically.

---

## 102. Dependency Installation

Installing dependencies is a write operation inside Workspace and may access network.

Executor/workflow policy governs whether allowed.

Main project tree should not be used for autonomous dependency installation.

---

## 103. Package Lock Changes

Lockfiles are real source changes.

If agent changes them, capture in DiffSummary.

Do not discard them automatically.

---

## 104. Generated Files

Project policy may classify generated directories.

Agent Office must not assume generated means disposable.

---

## 105. Workspace Environment

Each AgentRun may receive controlled environment variables.

Do not inherit entire user shell environment by default if avoidable.

Secrets are provided only when explicitly needed.

---

## 106. Temporary Directories

Executor scratch directories should live under Agent Office-managed roots where practical.

Do not use arbitrary sibling paths to Project.

---

## 107. Logs

Workspace-specific execution logs may be stored under Agent Office log/artifact root.

Do not write logs into Project repository unless project workflow explicitly requires it.

---

## 108. Workspace API DTO

Safe API fields:

```text
id
kind
status
access_mode
owner_agent_run_id
base_revision
branch
change_summary
created_at
released_at
```

Avoid returning absolute filesystem path in normal UI DTO.

---

## 109. Developer Diagnostics

Trusted local diagnostics may expose absolute path when needed.

Keep separate from ordinary safe DTOs.

---

## 110. Workspace Events

Important events:

```text
workspace.allocation.requested
workspace.created
workspace.ready
workspace.changed
workspace.conflict.detected
workspace.release.requested
workspace.released
workspace.failed
workspace.orphaned
```

---

## 111. Event Payload Safety

`workspace.changed` contains summary, not full diff.

Example:

```json
{
  "files_changed": 7,
  "insertions": 120,
  "deletions": 31
}
```

---

## 112. Evidence Capture

Potential Workspace Evidence:

```text
WORKSPACE_STATUS
DIFF_SUMMARY
COMMAND_RESULT
BUILD_RESULT
TEST_RESULT
```

Evidence remains linked to Run and AgentRun.

---

## 113. Review Handoff

Before review:

```text
implementation AgentRun terminal
        ↓
capture DiffSummary
        ↓
freeze write ownership if appropriate
        ↓
reviewer receives read-only view
```

---

## 114. Remediation Handoff

If reviewer creates BLOCKER:

```text
review complete
      ↓
original writable Workspace may be reactivated
or
new remediation Workspace created
```

MVP recommendation:

reuse the same implementation worktree when ownership and state are clear.

---

## 115. Remediation Ownership Reacquisition

Before remediation:

- prior writer terminal
- reviewer read-only
- Workspace still retained
- original owner or new remediation AgentRun explicitly acquires write ownership

---

## 116. Re-Review

After remediation:

```text
capture new DiffSummary
        ↓
write owner releases active mutation
        ↓
reviewer inspects updated workspace
```

---

## 117. Integration Conflict

If integration produces conflict:

```text
Integration Workspace → conflict state
Run → BLOCKED
```

Do not auto-resolve nontrivial merge conflicts using arbitrary heuristics.

A future Integration Agent may be explicitly assigned.

---

## 118. Merge Conflict Evidence

Capture:

```text
conflicting paths
base revisions
integration branches
safe summary
```

Do not expose secret file contents.

---

## 119. Unmerged Completion

A Run may complete as READY_FOR_REVIEW while one or more worktrees remain.

UI must show:

```text
Changes are not merged into the project branch.
```

---

## 120. User Integration

User may manually:

- inspect branch
- cherry-pick
- merge
- copy changes
- discard

Agent Office should not rewrite history afterward.

---

## 121. Importing User Integration State

Future feature may detect that branch was merged.

Must rely on Git evidence.

Not required for MVP.

---

## 122. Workspace Deletion

Deletion requires:

- workspace is managed
- path containment confirmed
- state releasable
- no active owner
- no uncertain external process
- required evidence captured
- user/policy permits removal

---

## 123. Recursive Delete Safety

Never execute generic:

```text
rm -rf <unvalidated path>
```

for workspace cleanup.

Use validated path + Git worktree removal + bounded filesystem operations.

---

## 124. Root Protection

Explicitly reject deletion targets equal to:

```text
/
$HOME
Project repository root
Agent Office data root
Git common directory
```

or ancestors of managed workspace root.

---

## 125. Empty Path Protection

Empty/null path must fail closed.

---

## 126. Relative Path Protection

Cleanup APIs accept Workspace ID, not arbitrary user-supplied filesystem path.

Infrastructure resolves stored managed path internally.

---

## 127. Workspace Persistence

Workspace record remains after RELEASED for audit history.

Path may no longer exist.

Do not delete durable Workspace row merely because filesystem cleanup succeeded.

---

## 128. Orphan Cleanup Tool

Future UI may expose:

```text
Orphaned Workspaces
```

with safe actions:

```text
Inspect
Retry cleanup
Keep
```

No automatic aggressive cleanup.

---

## 129. Recovery Scan

At Agent Office startup, a bounded recovery scan may compare:

- durable non-released Workspace records
- Git worktree metadata
- managed workspace root

Do not scan the entire home directory.

---

## 130. Unknown Directory

A directory under managed root with no durable Workspace record should be treated as suspicious/orphan candidate.

Do not delete automatically.

---

## 131. Missing Directory

Workspace record says READY/IN_USE but path is missing:

```text
Workspace → ORPHANED/FAILED
Run may → BLOCKED
```

depending on state.

---

## 132. Missing Git Metadata

Filesystem path exists but Git no longer recognizes worktree:

```text
ORPHANED
```

Require reconciliation.

---

## 133. Workspace Integrity

Potential checks:

```text
git rev-parse --show-toplevel
git rev-parse --git-common-dir
git rev-parse HEAD
git status --porcelain
```

bounded and safe.

---

## 134. Project Identity Mismatch

If managed worktree resolves to different Git common directory:

```text
critical policy violation
```

Block and do not operate on it.

---

## 135. Repository Replacement

If user deletes and clones a different repository at same path:

Project revalidation must detect identity change where possible.

Do not assume path equality means same repository.

---

## 136. Remote Origin

Remote origin is supplemental identity only.

Repositories may have no origin or origin may change.

Do not use it as sole identity.

---

## 137. Repository Fingerprint

Potential fingerprint may include:

```text
git common dir identity
initial HEAD
root metadata
```

Do not hash entire repository for every operation.

---

## 138. Read View Strategy

MVP may use main project tree for read-only agents if no safety issue.

Alternative:

```text
read-only detached worktree
```

may improve consistency but costs disk/time.

Choose per workflow/project.

---

## 139. Stable Review Revision

For deterministic review, reviewers should inspect a stable implementation worktree rather than a moving main branch.

---

## 140. Workspace Freeze

There may be a logical freeze during review:

```text
writer inactive
review active
```

No separate filesystem freeze mechanism is required initially if write ownership is enforced.

---

## 141. User Editing During Review

If user manually edits reviewed workspace, Agent Office should detect changed revision/status before accepting review result where practical.

---

## 142. Verification Workspace

Final verification should run against the final candidate workspace, not unrelated main tree.

If multiple worktrees remain unintegrated, verification scope must be explicit.

---

## 143. Candidate Workspace

Run may designate:

```text
candidate_workspace_id
```

representing the final state that verification reviewed.

This helps avoid ambiguity.

---

## 144. Candidate Immutability During Verification

While verification is active:

- no writer should modify candidate workspace
- if changes occur, verification becomes stale

---

## 145. Verification Staleness

If candidate changes after tests:

```text
previous verification evidence may become stale
```

Workflow should re-run required gates.

---

## 146. Evidence Base Revision

Test/build evidence should record:

```text
workspace_id
revision/diff fingerprint
```

where practical.

This ties evidence to the code actually verified.

---

## 147. Diff Fingerprint

Potential digest of:

```text
base revision
changed paths
patch content
```

may support evidence staleness detection.

Not mandatory for earliest MVP, but recommended.

---

## 148. Worktree Policy and Office View

Office View should not expose filesystem implementation details.

It may show:

```text
Backend
Working in isolated workspace
```

rather than local absolute path.

---

## 149. Worktree Policy and Activity Feed

Useful activity examples:

```text
Backend workspace created
7 files changed
Workspace ready for review
Workspace retained after run
```

No fake progress.

---

## 150. Worktree Policy and Audit

Audit important actions:

```text
Workspace allocated
Workspace manually released
Restricted Git operation approved
Integration initiated
Generated branch deleted
```

---

## 151. Project Policy Overrides

Project may strengthen default rules.

Example:

```text
auto_commit = false
max_parallel_writers = 1
deny_paths = ["infra/prod/**"]
```

Project may not weaken system-wide forbidden operations unless a future explicit trusted override system exists.

---

## 152. System-Wide Policy

System policy takes precedence over Project policy.

Conceptually:

```text
System Safety
   >
Project Policy
   >
Workflow Policy
   >
Agent Instructions
```

---

## 153. Workspace Command Environment

Command execution context must bind:

```text
project_id
run_id
agent_run_id
workspace_id
cwd
access_mode
```

before evaluation.

---

## 154. Direct File Tool Writes

Non-shell file editing tools are still writes.

They must be constrained to assigned Workspace.

Command policy alone is insufficient.

---

## 155. Editor/IDE Integration

Future Agent Office plugins may open worktrees in IDE.

That is a user convenience feature.

It must not change ownership semantics automatically.

---

## 156. Manual Handoff

User may take ownership of a workspace.

Future state may include:

```text
MANUAL_CONTROL
```

If implemented, autonomous writer must stop before handoff.

---

## 157. Workspace Copying

Avoid copying full repository as a substitute for Git worktree unless repository is not Git-compatible and future support explicitly adds copy-based workspace.

---

## 158. Non-Git Projects

MVP:

```text
not supported
```

Agent Office is Git-first.

Future `FilesystemWorkspace` adapter could support non-Git projects separately.

---

## 159. Submodules and Write Ownership

Submodule writes should be denied by default unless explicitly registered/authorized because they may represent separate repositories.

---

## 160. Git Safe Directory

Do not globally modify Git safe.directory settings without user awareness.

If required, report configuration need.

---

## 161. Credential Helpers

Git commands may invoke credential helpers for remote operations.

Because remote operations are restricted, MVP should avoid triggering credential flows unnecessarily.

---

## 162. Remote Fetch

Automatic fetch is not required before every Run.

Project/workflow may request explicit fetch later.

Local base revision is sufficient for MVP.

---

## 163. Network Isolation

Worktree policy itself does not enforce network access.

Security Model will define executor/network policy.

---

## 164. Worktree Manager Port

Conceptual application port:

```python
class WorkspaceManager:
    async def validate_project_repository(...)
    async def allocate(...)
    async def acquire_write_ownership(...)
    async def inspect(...)
    async def capture_changes(...)
    async def prepare_review(...)
    async def release_write_ownership(...)
    async def request_release(...)
    async def reconcile(...)
    async def cleanup(...)
```

Exact implementation may differ.

---

## 165. Workspace Allocation Result

Conceptual:

```text
WorkspaceAllocationResult
├── workspace_id
├── status
├── base_revision
├── branch?
├── access_mode
└── safe_summary
```

Normal API should not require raw absolute path.

---

## 166. Workspace Conflict Result

Conceptual:

```text
WorkspaceConflict
├── reason_code
├── conflicting_run_id?
├── conflicting_agent_run_id?
├── conflicting_scope?
└── safe_summary
```

---

## 167. Change Capture Result

Conceptual:

```text
WorkspaceChangeSummary
├── files_changed
├── insertions?
├── deletions?
├── added_paths*
├── modified_paths*
├── deleted_paths*
├── untracked_paths*
├── base_revision
└── current_revision?
```

Paths are repository-relative.

---

## 168. Workspace Reconciliation Result

Canonical:

```text
CONFIRMED_READY
CONFIRMED_IN_USE
CONFIRMED_RELEASED
ORPHANED
MISSING
CONFLICT
UNKNOWN
```

---

## 169. Idempotency

Workspace operations should be idempotent where practical.

Repeated:

```text
request_release(workspace_id)
```

must not corrupt state.

Repeated:

```text
cleanup(workspace_id)
```

after already released should return safe success/already-released.

---

## 170. Allocation Idempotency

Use stable allocation request identity.

Do not create multiple worktrees because orchestration retried after timeout.

---

## 171. Release Idempotency

A released Workspace remains RELEASED.

Do not recreate path during release retry.

---

## 172. Race: Start vs Release

Release cannot begin while an AgentRun is transitioning STARTING/RUNNING without cancellation/reconciliation.

---

## 173. Race: Review vs Remediation

Review read access must complete or be invalidated before remediation writer modifies same Workspace.

---

## 174. Race: Two Writers

Atomic write ownership prevents simultaneous ownership.

Second acquisition fails/block.

---

## 175. Race: Cleanup vs Process

Cleanup checks execution terminal/reconciled state before deleting.

---

## 176. Race: Application Restart

Recovery locks/reconciliation prevent two startup loops from claiming same Workspace if multiple local processes accidentally start.

MVP may enforce single Agent Office backend instance through application lock.

---

## 177. Single-Instance MVP

Recommended:

```text
one Agent Office backend process
```

for local MVP.

This simplifies Workspace ownership.

Still design persistence defensively.

---

## 178. Multiple Backend Processes

Not supported initially unless explicit distributed locking is introduced.

---

## 179. Testing Strategy

Use temporary Git repositories.

Never run worktree safety tests against user real repositories.

Test fixtures should create:

```text
temp repo
initial commit
branches
dirty files
untracked files
symlinks
worktrees
```

---

## 180. Required Worktree Tests

At minimum:

- repository validation
- invalid repository
- canonical path
- path with spaces
- dirty main tree preserved
- untracked main files preserved
- writable worktree allocation
- read-only view
- two writer conflict
- separate writer worktrees
- base revision capture
- branch collision
- cleanup
- repeated cleanup
- cleanup failure
- cancellation before cleanup
- unknown executor prevents cleanup
- orphan reconciliation
- missing workspace path
- project identity mismatch
- symlink escape protection
- traversal rejection
- forbidden destructive command
- restricted command approval
- review mutation detection
- integration conflict
- application restart reconciliation

---

## 181. Storage Safety Test

Every destructive workspace test must operate only inside a temporary directory.

Add explicit assertion that target path begins under test temp root.

---

## 182. Main Tree Preservation Test

Create dirty fixture:

```text
tracked modified file
untracked file
```

Run allocation/execution cleanup scenario.

Assert both remain byte-identical in main working tree.

---

## 183. Cancellation Race Test

Use controlled fake executor:

```text
writer active
cancel requested
cleanup requested
```

Assert Workspace persists until executor confirms termination.

---

## 184. Orphan Test

Simulate process loss and stale Workspace.

Reconciliation must not delete automatically.

---

## 185. Symlink Cleanup Test

Managed workspace contains symlink to external temp directory.

Cleanup must remove workspace without deleting external target.

---

## 186. Branch Safety Test

Ensure cleanup never deletes user branch with same display-like name unless durable ownership proves Agent Office created it.

---

## 187. Worktree Policy Acceptance Criteria

The policy is successfully implemented when:

1. Agent Office can register multiple Git Projects safely.
2. Project main working tree may remain dirty without data loss.
3. Write AgentRuns never default to main working tree.
4. Parallel writers receive different worktrees.
5. One worktree cannot have two active autonomous writers.
6. Reviewers can inspect implementation read-only.
7. BLOCKER remediation can safely return to implementation Workspace.
8. cancellation does not delete active workspace.
9. unknown executor state prevents unsafe cleanup.
10. cleanup is idempotent.
11. symlink/path traversal cannot escape managed root.
12. Run may complete without merging to main.
13. user changes are never reset/cleaned automatically.
14. workspace history remains auditable after filesystem cleanup.
15. worktree safety tests never touch real user repositories.

---

## 188. Mandatory Invariants

1. Main user working tree is protected.
2. Dirty user changes are never discarded automatically.
3. Every writable Workspace has one active writer.
4. Parallel write AgentRuns use isolated worktrees.
5. Workspace belongs to exactly one Project and Run.
6. Writable Workspace owner is explicit.
7. Repository identity is revalidated before sensitive operations.
8. Workspace paths remain inside managed roots.
9. Destructive Git commands are forbidden by default.
10. Cancellation request is not cleanup authorization.
11. UNKNOWN external execution state prevents cleanup.
12. Cleanup is idempotent and bounded.
13. Released Workspace never receives new autonomous writes.
14. Integration does not imply merge to user branch.
15. Run completion does not imply merge/deploy.
16. Absolute developer paths are not exposed unnecessarily in safe DTOs.
17. Provider self-reported diffs are not authoritative over Git inspection.
18. Historical Workspace records survive cleanup.
19. Agent Office never auto-cleans the main repository.
20. Workspace isolation is not misrepresented as full security sandboxing.

---

## 189. Next Documents

This worktree policy is refined by:

```text
SECURITY_MODEL.md
INFORMATION_ARCHITECTURE.md
MVP_ACCEPTANCE.md
```

The next document should define Agent Office threat boundaries, credential handling, command enforcement, executor trust, filesystem and network permissions, local-only deployment, artifact safety, audit, and future multi-user considerations.
