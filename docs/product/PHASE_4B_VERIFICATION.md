# Agent Office Phase 4B Verification

Status: Accepted
Phase: Phase 4B — Findings, Evidence, and the Review Handoff
Verification date: 2026-09-17
Checkpoint: `eceaff1 docs: complete phase 4a workspace verification`

## Scope

Phase 4B makes review and verification evidence-backed. It establishes durable
Findings and Evidence, the review handoff that gives a reviewer a read-only view
of the implementation candidate, and a controlled command boundary that runs a
WorkflowDefinition's declared verification checks.

> **A review observation is a durable Finding, not an opinion. A verification
> result is Evidence produced by a command that actually ran, in an isolated
> workspace, and its authority stops at what that command reported.**

Specifically, Phase 4B delivers:

- the `Finding` aggregate with its canonical category, severity, status,
  resolution type, and lifecycle transitions
- the `Evidence` aggregate with canonical kinds and an availability status that
  is separate from overall Run success
- a `VerificationCheckDefinition` declared in a WorkflowDefinition and frozen
  into the Run's snapshot, so a Run's obligations cannot change while it runs
- a bounded command runner: allowlisted executables, fixed arguments, no shell,
  no host environment, bounded time and output
- the review handoff: a read-only `PROJECT_READ_VIEW` of the candidate worktree
  plus a Git-derived `DIFF_SUMMARY` captured before review
- remediation ownership derived from durable history, never from the reviewer
- resolution by independent re-review, or by attributable human risk acceptance
- completion gates that refuse to complete a Run with an open blocker or an
  unsuccessful verification obligation
- canonical `review.*`, `verification.check.*`, and `evidence.created` Events
- additive schema version 8 with append-only durability triggers

Phase 4B does **not** implement a real AI executor, artifact storage, an
integration workspace, or the Office View. It does not make a worktree a
sandbox.

## Checkpoint

```text
HEAD  eceaff17552e1c7eabb5d0d26db2b29b14d5a259
```

`frontend/` is unchanged; `git status --short frontend/` is empty.

## Architecture

```text
Reviewer (READ_ONLY, REVIEW stage)
      ↑ read-only view                    ↓ reported observations
PROJECT_READ_VIEW ──observes──> GIT_WORKTREE          Finding
      (no object created)      (implementation)         │
      (never owned)                 │                    │ owner = write-capable
                                    │                    │         implementation
                            captured from Git            │         AgentRun
                                    ↓                    ↓
                              DIFF_SUMMARY          REMEDIATION
                                 Evidence                │
                                                         ↓
                                   re-review resolves ───┘
                                   or human accepts risk

WorkflowDefinition.verification_checks
      ↓ frozen into
WorkflowSnapshot
      ↓ executed by the command boundary, inside the candidate worktree
Evidence(TEST_RESULT / LINT_RESULT / …)
      ↓
completion gate
```

### A Finding is an observation, not a verdict

A reviewer that reported a blocker completed successfully. The verdict decides
whether remediation is required; the assignment status does not. Findings are
created once per reviewer per observation, and each stays traceable to the
reviewer that raised it, so two independent reviewers raising the same issue
produce two attributable Findings rather than one unowned merge.

### Ownership is derived, never guessed

```text
candidates = write-capable IMPLEMENTATION AgentRuns, attempt 1
required   = candidates whose profile is a *required* IMPLEMENTATION assignment
pool       = required, or all candidates when nothing is marked required
one in pool                 → that AgentRun owns it
several, and the category or
  location positively names one → that AgentRun owns it
otherwise                   → no owner; the Run blocks
```

An optional implementation assignment is never treated as the owner, and a
reviewer never becomes the owner. When ownership cannot be established the Run
blocks with `REMEDIATION_OWNER_UNKNOWN` rather than assigning the work to
whoever happens to be first.

### A Finding stops being open only through evidence

```text
independent re-review no longer reports it  → RESOLVED / REMEDIATED
attributable human decision                 → RESOLVED / ACCEPTED_RISK
```

An implementation agent claiming it fixed something resolves nothing. The only
agent-driven path is a later review *of the same Run* that does not report the
observation, which is re-review by construction.

`ACCEPTED_RISK` is reachable from exactly one route,
`POST /api/findings/{id}/accept-risk`, which is an operator-only action carrying
a mandatory reason. The service refuses any actor type other than
`AuditActorType.USER`, so an executor cannot self-approve. The decision is
recorded twice: on the Finding as its resolution, and as an append-only
AuditRecord naming the actor type.

### Truthful verification state

A Run whose snapshot declares no check reports `checked: false`, not a pass. A
check that ran and failed is recorded as `command_status: FAILED` with its exit
code — the Evidence itself is `AVAILABLE`, because collection succeeded and the
result was a failure. Those are different facts and both are preserved.

No test count, coverage figure, or duration is ever invented for a command that
is not a test runner.

## Command Boundary

Declared checks are structured, never free-form:

```text
executable        bare program name from an allowlist
arguments         fixed strings; no shell syntax; no state-changing subcommands
environment       declared names only, from values Agent Office itself supplies
timeout           bounded
output limit      bounded
```

`shell=True` is never used, so shell metacharacters are inert. They are refused
anyway, at declaration time, so a definition cannot silently mean something other
than what its author intended.

Policy, enforced in the domain:

```text
absolute or path-qualified executable   refused   (would choose the binary)
executable outside the allowlist        refused   (pytest, python3, ruff, mypy,
                                                   npm, node, make, go, cargo)
host/repository-mutating executable     refused   (git, pip, brew, docker, curl,
                                                   ssh, sudo, rm, mv, dd, …)
shell syntax in an argument             refused
state-changing argument                 refused   (install, publish, deploy,
                                                   reset, rebase, push, clean)
host environment forwarded              never     (PATH, HOME, tokens, KUBECONFIG…)
```

**Allowlisting the executable is not sufficient, so classification never stops
there.** Four further rules apply to the invocation as a whole:

```text
interpreter inline code        DENIED    python3 -c, -m, -; node -e, --eval, -p,
                                        -r, --require, --loader, --import, and the
                                        attached forms -cvalue / --flag=value
interpreter not a verification
  tool                         DENIED    ruby, perl, sh, bash, zsh, PowerShell
package-manager mutation       DENIED    a multi-command tool accepts only its
                                        permitted subcommands (npm: test, run,
                                        run-script, ls, list, outdated, why, pkg;
                                        go: test, vet, build, list, env, version;
                                        cargo: test, build, check, clippy, fmt,
                                        doc, metadata, tree)
path outside the workspace     DENIED    an absolute path, a leading ~, a
                                        backslash, or a `..` segment anywhere in
                                        an argument, including after `=`
```

The inline-code rule exists because the program is never a reviewed artifact and
its content is unknown at declaration time, so no Evidence about it can exist.
Phase 4B has no command-approval subsystem through which a human could accept
it, so an operation whose effect cannot be established is denied rather than
allowed. `python3 -m pytest` is refused for the same reason and must be declared
as `pytest`, which names the tool the Evidence is about.

The same predicate is consulted twice: once when a definition is built, and again
when a command is about to run. A frozen snapshot written before a policy change
therefore cannot reach a process boundary that today's declaration rules would
have refused.

A refused declaration is a policy decision, not a test failure, and it is
refused before any Run exists: `POST /api/workflows` returns 422, and no
definition, Run, Workspace, or Evidence is created.

### Output is bounded and redacted, and raw output is never persisted

Captured output is redacted of secrets and host paths by the runner and truncated
to the declared limit. Only a bounded excerpt survives into Evidence metadata;
raw output is discarded, so there is no unbounded blob to leak.

### Verification never falls back

A check runs in the Run's most recently allocated writable worktree. When no
verifiable workspace exists the Run blocks with `VERIFICATION_EVIDENCE_MISSING`
rather than checking the Project's main tree. Command execution never has a
`cwd` parameter to abuse, because the working directory is derived from opaque
Workspace identity and containment-checked before use.

## Schema

The database moved from schema version 7 to **8**.

```text
v7 → v8   additive only
          CREATE TABLE findings
          CREATE TABLE evidence
          CREATE INDEX findings_run_idx
          CREATE INDEX findings_run_status_idx
          CREATE INDEX findings_identity_idx
          CREATE INDEX evidence_run_idx
          CREATE INDEX evidence_run_kind_idx
          TRIGGER findings_no_delete
          TRIGGER evidence_append_only_update
          TRIGGER evidence_append_only_delete
```

Committed migrations v1–v7 were **not** modified. `test_persistence/
test_phase4b_migration.py` builds genuine earlier databases by applying the real
migrations in order, then asserts the migration is purely additive and that
pre-existing rows survive untouched.

Two rules are enforced by the schema rather than by convention:

- `findings.dedupe_key` is `UNIQUE`, so duplicate reviewer delivery cannot create
  a second Finding for the same observation;
- Findings cannot be deleted and Evidence cannot be updated or deleted, so review
  history and engineering proof are append-only.

Foreign keys are enforced, so neither table can reference a Project, Task, or Run
that does not exist.

The durability tests assert these against rows Agent Office itself wrote — a real
blocked review loop and a real executed check — rather than against a hand-built
insert that could drift from production shape.

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
pytest              604 passed, 2 xfailed, 2 warnings in 319.39s
ruff check          All checks passed!
ruff format --check 169 files already formatted
mypy src            Success: no issues found in 117 source files
```

Two tests are strict `xfail` markers for Phase 4C obligations (verification
Evidence staleness, and explicit verification scope). They fail today by design,
and `strict=True` means each will XPASS — and fail loudly — once Phase 4C
implements it.

Phase 4B added 94 tests:

```text
tests/test_phase4b_findings.py                    15 passed
tests/test_phase4b_verification.py                62 passed, 2 xfailed
tests/test_phase4b_review_handoff.py               6 passed
tests/test_persistence/test_phase4b_migration.py  11 passed
```

Warnings are the same two external dependency deprecations documented in the
Phase 1–4A records. No code was altered to suppress them.

Frontend gates were run even though no frontend file may change:

```text
npm test            7 test files passed, 39 tests passed
npm run typecheck   passed (tsc -b)
npm run lint        passed (eslint .)
npm run build       passed, 268.76 kB bundle
```

## Findings, Ownership, and Resolution

A blocking review creates a durable Finding with its reviewer, its Project, and
its Run:

```text
blocking review verdict      → Finding(severity=BLOCKER, category=SECURITY)
                               reviewer_agent_run_id → REVIEW-stage AgentRun
                               location             → optional, repository-relative
clean review verdict         → no Finding at all
```

Ownership and resolution, asserted against a real `REMEDIATION_SUCCESS` loop:

```text
remediation_owner_agent_run_id  IMPLEMENTATION stage, access_mode WRITE,
                                profile backend-developer — not the reviewer
resolution_type                 REMEDIATED
resolver_agent_run_id           the re-review AgentRun, verdict CLEAR
resolved_at                     set
blocks_completion               false
```

The ambiguity path is proven with a workflow whose IMPLEMENTATION stage has two
*required* write assignments and a SECURITY-category Finding that names neither:
the Finding is left unowned and the Run blocks with `REMEDIATION_OWNER_UNKNOWN`,
rather than attributing the work to an arbitrary first candidate.

An unresolved blocker prevents completion. With a failing remediation the Run
ends `FAILED`, not `COMPLETED`, and the Finding remains open with
`resolved_at: null`.

## Review Handoff

WORKTREE_POLICY §112/§113 require that once the implementation is terminal, the
candidate is captured and the reviewer receives a read-only view. Both are
implemented and asserted:

```text
implementation AgentRun terminal
        ↓
PROJECT_READ_VIEW allocated for the reviewing AgentRun
        kind PROJECT_READ_VIEW, access_mode READ_ONLY, writable false
        same opaque path_ref and base_revision as the candidate
        owner_agent_run_id null          (a reader is never a second writer)
        no worktree created              (registered worktree count unchanged)
        ↓
DIFF_SUMMARY Evidence captured from Git, attributed to the reviewer
        ↓
review assignment starts with workspace_id set to the view
```

A read-only assignment that runs before any write exists — Discovery — still
needs no workspace at all, which preserves Phase 4A behaviour for everything that
is not a review handoff.

Releasing a view retires the record and **cannot** remove the location it
observes, because a logical view owns no filesystem object. This is asserted
directly: the candidate worktree still exists after the view is released.

The handoff is derived from durable Workspace state. The Project's main working
tree is never a candidate, and the review view never resolves to it.

## Evidence Attribution

Every command Evidence record identifies what was verified, not merely that
something was:

```text
workspace_id       which Workspace hosted the command
base_revision      the revision the Worktree was created from
current_revision   the revision the command actually ran against
command_status     the factual outcome (PASSED / FAILED / ERROR / TIMED_OUT)
exit_code          the exit status the process reported
```

`current_revision` was added by this hardening pass. It answers "which candidate
revision was verified" using the existing `CURRENT_REVISION_KEY`, with no schema
change: `evidence.metadata_json` already carries arbitrary bounded key/value
facts.

**What Evidence cannot yet answer.** `current_revision` is a commit revision, so
it does not change when the worktree is edited without committing. Evidence
therefore cannot distinguish "verified a clean tree at R" from "verified at R,
then edited". WORKTREE_POLICY §146 asks for a `revision/diff fingerprint` "where
practical", and a diff fingerprint is not recorded.

### Stale Evidence can currently satisfy the completion gate

Confirmed by direct observation, not inference. A Run whose declared check passed
was mutated afterwards, and the gate still reported the check satisfied:

```text
evidence records                  workspace_id, base_revision, current_revision,
                                  command_status=PASSED
workspace files changed after     captured changes now report 1 changed file
workspace revision after          unchanged (the edit was uncommitted)
gate result for the check          satisfied: true
```

The gate asks two questions and only two: does decisive Evidence exist for each
required check, and is it successful. `latest_check_evidence` selects the newest
record per check key and `is_successful_command_evidence` reads its command
status. Neither consults the Workspace's current state, and no recorded revision
is ever compared against the worktree.

**This is a Phase 4C blocker and is recorded as one.** It is not fixed here
because staleness invalidation is Phase 4C work, and because a correct fix needs
the candidate designation described below: invalidating Evidence requires knowing
which revision was *supposed* to be verified.

Reachability today: the checks run once every stage is terminal, so no later
stage can mutate the worktree within one orchestration pass. The gap is reached
when a Run is re-evaluated after its evidence exists — a resume after a policy
block, or a retry of the verification stage — and when an operator edits the
worktree out of band. It is also reached today in a multi-writer Run, for the
separate reason recorded below.

### Verification scope is not yet explicit

`enterprise-engineering` with both areas changed allocates three writable
worktrees: backend implementation, frontend implementation, and documentation
last. The required checks run when every stage is terminal, so the
last-allocated worktree — documentation, which holds none of the implementation
under review — is the one they run in:

```text
implementation worktrees          2   (backend-developer, frontend-developer)
writable worktrees total          3   (documentation-writer is the newest)
checks ran in                     the newest writable worktree, not the
                                  implementation under review
```

WORKTREE_POLICY §142 requires that "if multiple worktrees remain unintegrated,
verification scope must be explicit", and §143 has a Run designate
`candidate_workspace_id`. Neither is implemented. The review handoff view is
allocated earlier, while the implementation worktrees are still the newest, so
reviewers observe an implementation worktree while the checks may not — the two
halves of the handoff can disagree.

This is also a Phase 4C blocker, and it is recorded as one rather than fixed,
because choosing a candidate requires the designation §143 specifies.

## Completion Gates

A Run cannot complete while an obligation it declared is unmet:

```text
open blocker Finding                        → OPEN_BLOCKER_FINDING
required check without successful Evidence   → VERIFICATION_EVIDENCE_MISSING
```

Both are policy blocks: reconciliation and unrelated external events do not clear
them. Re-running a bounded command on every unrelated wake would repeat work
without changing the outcome, so only an explicit resume re-enters them.

A snapshot that declares no check imposes none, so historical orchestration-only
Runs are never retroactively invalidated.

## Live Acceptance

A real Agent Office HTTP server was started on a free loopback port against a
temporary data root, driven over real HTTP, and restarted twice against the same
database. Only temporary resources were created and they were deleted afterwards.
Port 8000 was never contacted; the repository's own `data/` directory was never
used.

```text
server started (first boot)
  run status        : COMPLETED
  findings          : 2
  evidence          : 5
  verification      : [{"check_key":"unit-tests","command_status":"PASSED","satisfied":true}]
  read views        : 4
  diff summaries    : 4
  failing run status: BLOCKED / VERIFICATION_EVIDENCE_MISSING

server started (second boot, same database)
server started (third boot, failing remediation)
  run status        : FAILED / REMEDIATION_FAILED
```

Verified over HTTP:

```text
 1  registered Project                                                    PASS
 2  registered second Project                                             PASS
 3  created WorkflowDefinition with a declared check                       PASS
 4  created Task, Run, and started the Run                                 PASS
 5  Run COMPLETED with a declared check satisfied                          PASS
 6  command Evidence recorded in a managed Workspace                       PASS
 7  reviewer received a read-only view of the candidate                    PASS
 8  review handoff recorded a Git-derived change summary                   PASS
 9  no host path disclosed in Findings/Evidence/verification               PASS
10  Project main working tree untouched                                    PASS
11  failed check blocks completion with recorded Evidence                  PASS
12  unsafe verification declaration refused (422)                          PASS
13  second Project unaffected                                              PASS
14  Findings survived restart with resolution intact                       PASS
15  Evidence survived restart                                              PASS
16  blocked Run state survived restart                                     PASS
17  open blocking Finding prevents completion                              PASS
18  risk acceptance without a reason is refused (422)                      PASS
19  operator risk acceptance recorded as a USER action                     PASS
20  risk cannot be accepted twice (409)                                    PASS
```

`findings`, `evidence`, `verification`, `workspaces`, and `agents` were each
fetched through the real API; the assertions above are made on those responses,
not on in-process objects.

### Live command-policy probe

The hardened policy was re-checked against a real server over real HTTP, because
a unit test proves what the domain refuses, not what the running application
refuses:

```text
python3 -c print(1)        REFUSED      pytest -q tests          PERMITTED
python3 -m http.server     REFUSED      ruff check .             PERMITTED
python -c import os        REFUSED      mypy src                 PERMITTED
node -e require('fs')      REFUSED      npm run build            PERMITTED
node -r x.js               REFUSED      python3 check_ok.py      PERMITTED
ruby -e puts 1             REFUSED
perl -e print 1            REFUSED
npm install                REFUSED
npm ci                     REFUSED
cargo install x            REFUSED
python3 /etc/passwd        REFUSED
pytest ../outside.py       REFUSED
```

A permitted `python3 check_ok.py` was also executed end to end by the live
acceptance run, so the refused forms and the supported forms are both observed
against the running application rather than only against the domain.

## Security and Safety

```text
local-first loopback only; no external service contacted
no real AI executor; the deterministic ReferenceExecutor is unchanged
no auto commit, no auto merge, no force push, no history rewrite
no `git reset`, `git clean`, `git restore`, `git stash`, no forced removal
no shell execution anywhere; argument arrays only
no interpreter inline code, module execution, or stdin script
no path outside the workspace named by any argument
no host environment forwarded to a check
no plaintext secret persisted; captured output is redacted before storage
no absolute path in any Finding, Evidence, Verification, or Workspace DTO
no raw unbounded command output persisted
risk acceptance requires an attributable user action and a reason
```

The registered Project's main working tree was byte-for-byte unchanged after the
live run, including a run that executed a real command in a worktree.

## Known Limitations

- **A worktree is not a sandbox.** Containment bounds which working tree a
  command runs in. It does not confine a process: an allowlisted
  `python3 script.py` executes repository code with the server's own privileges.
  The allowlist, argument policy, minimal environment, and bounds reduce the
  blast radius; they are not isolation.
- **Declarations are operator-authored and therefore trusted.** The threat model
  treats a WorkflowDefinition as a control-plane action, not as repository
  content. Repository content is never allowed to *supply* a check declaration.
- **Interpreter inline-code invocation is refused, not approved.** `python3 -c`,
  `python3 -m`, `python3 -`, `node -e`, `node --eval`, `node -p`, `node -r`, and
  the `--flag=value` and `-cvalue` attached forms are DENIED. A check may name a
  script inside its workspace, but it may never supply a program as an argument.
  Ruby, Perl, and the shells are denied outright: they are not verification tools.
  An operation whose effect cannot be established is denied rather than allowed,
  because Phase 4B has no command-approval subsystem through which a human could
  accept it (SECURITY_MODEL §29.4, §32).
- **A verification command still reaches repository code.** Denying inline code
  closes one specific escape. A permitted `pytest` or `python3 script.py` still
  executes repository content with the Agent Office server process's own OS
  privileges. The worktree bounds *which* tree is reachable; it does not confine
  the process. This is the documented MVP position and it is not claimed
  otherwise.
- **Stale Evidence can still satisfy the completion gate.** See the Evidence
  Attribution section; this is a Phase 4C blocker and is recorded as one.
- **Verification scope is implicit when a Run has several writers.** The checks
  run in the newest writable worktree, which may be a documentation worktree
  rather than the implementation under review. §142 requires explicit scope and
  §143 requires a candidate designation. This is a Phase 4C blocker and is
  recorded as one.
- **Two reviewers reporting the same observation produce two Findings.** Each is
  attributable to its reviewer; there is no merge, linking, or grouping of
  duplicate observations.
- **A Finding is only resolved by re-review of the same Run.** A fix landed in a
  later Run resolves nothing automatically, because no evidence in that Run
  speaks to the earlier observation. Re-review or human acceptance is required,
  which is the specified rule rather than a gap.
- **Verification runs once per advance.** A check that fails is re-run only on an
  explicit resume; it does not re-run on unrelated wakes. A Run therefore needs
  an operator action after a fix rather than re-checking by itself.
- **Read views multiply per reader.** Each read-only assignment gets its own view
  row of the same candidate. This records what each reader observed, at the cost
  of more Workspace rows per Run.
- **`INTEGRATION_WORKTREE` and `TEMPORARY` kinds remain unused**, as in Phase 4A.
- **No orphan cleanup tooling.** Orphaned Workspaces are identified and retained
  for operator review; nothing sweeps them automatically.
- **Single-instance assumption.** §176/§177 allow the MVP to assume one backend;
  no application lock is implemented.
- **The `except OwnershipError` branch in `GET /api/runs/{run_id}` remains
  unreachable**, unchanged since Phase 2.

## Phase 4C Scope Audit

Whether each remaining item is required before Phase 4 can close, with the
governing specification:

```text
integration workspace                CONDITIONAL
    WORKTREE_POLICY §31, §32. Required only "when multiple writers produce
    independent branches/worktrees". A single-writer workflow does not need one,
    and this audit does not assume it is mandatory. enterprise-engineering with
    both areas changed does produce two independent implementation worktrees, so
    a workflow of that shape needs it; the shape is a workflow-definition
    property, not a Phase 4 requirement in the abstract.

candidate workspace designation      REQUIRED
    WORKTREE_POLICY §143 (Run may designate candidate_workspace_id), §142
    (verification scope must be explicit when worktrees remain unintegrated).
    Not implemented: no durable designation exists, and the checks currently run
    in the newest writable worktree. Demonstrated in
    test_multi_writer_verification_runs_in_an_implementation_worktree.

verification evidence staleness      REQUIRED
    WORKTREE_POLICY §144 (candidate immutability during verification), §145
    (if the candidate changes after tests, previous evidence may become stale and
    the workflow should re-run required gates), §146 (evidence should record
    workspace_id and a revision/diff fingerprint). workspace_id and a revision
    are recorded; no fingerprint is, and no staleness decision exists.
    Demonstrated in
    test_evidence_for_a_mutated_workspace_no_longer_satisfies_the_gate.

final unmerged integration state      CONDITIONAL
    WORKTREE_POLICY §32: "Integration may create a review-ready combined branch.
    It must not automatically modify the user's default branch", with the state
    `Run: COMPLETED / Integration: READY_FOR_REVIEW / Main branch: UNCHANGED`.
    The main branch is provably unchanged (Phase 4A, re-verified here). The
    review-ready combined branch is only meaningful once integration exists, so
    this is conditional on the integration item above.

safe cleanup / reconciliation         ALREADY SATISFIED
    WORKTREE_POLICY §51 (never discard unrecorded changes), §58, §60, §1046
    (ORPHANED requires operator review). Phase 4A implemented and verified
    release / retain / orphan with real repositories, including the refusal to
    remove a dirty worktree and safe-form branch deletion; restart reconciliation
    is implemented and covered by its own suite. Note that §1046 makes automatic
    orphan sweeping *incorrect*: orphans are retained for operator review by
    design, so the absence of a sweeper is not a gap.

end-to-end ReferenceExecutor write
  workflow                            CONDITIONAL
    MVP_ACCEPTANCE.md §84: "Phase 4 passes when a ReferenceExecutor-driven write
    workflow can modify a temporary repository safely, produce Findings/Evidence,
    preserve the main tree, and clean/reconcile worktrees correctly." That gate
    names no real executor. The first four properties are demonstrated end to end
    by this phase against real temporary repositories, including real command
    execution. The remaining clause is cleanup closure inside that same flow:
    worktrees are released by operator request rather than as the final step of
    the workflow, which is the §51-safe behaviour and the one Phase 4A verified.
```

Nothing above requires a provider integration, so nothing above moves Phase 4's
boundary. Real executor remains Phase 6 under `MVP_ACCEPTANCE.md` §6, and
AGENTS.md §9 forbids enabling one before this workflow is safe.

## Deferred

Explicitly **not** implemented by Phase 4B:

```text
real write-capable AI executor (Codex, Antigravity, OpenClaw)     Phase 6
provider session identity and real cancellation negotiation       Phase 6
artifact storage for large outputs                               later
Operations UI for Findings, Evidence, and risk acceptance        later
Office View projection                                           later
```

```text
integration workspace / combined-branch review      Phase 4C (if the workflow has
                                                    more than one writable candidate)
candidate workspace designation                     Phase 4C
verification Evidence staleness detection           Phase 4C
final unmerged integration state                    Phase 4C (if integration applies)
safe cleanup / reconciliation closure               Phase 4C
end-to-end ReferenceExecutor write workflow          Phase 4C
```

**The real executor is not a Phase-4 blocker.** `MVP_ACCEPTANCE.md` §6 assigns
the first real executor to Phase 6, and the Phase 4 exit criterion is satisfied
by the deterministic ReferenceExecutor driving a complete, safe write workflow.
AGENTS.md §9 forbids enabling a real write-capable executor before that workflow
is safe, so Phase 4 closes *without* one and Phase 6 opens with one. No part of
Phase 4 acceptance depends on a provider integration, and none is renumbered.

The Phase 4B operator interface is the per-Run HTTP API
(`/api/runs/{id}/findings`, `/evidence`, `/verification`, and
`POST /api/findings/{id}/accept-risk`). Those pages exist in the frontend as
Phase 1 shells only; no frontend file changed in this phase. The global
registry views need a cross-Run list endpoint that does not exist yet, so wiring
the UI is deferred rather than half-built. Risk acceptance is fully functional
and audited through the operator route.

## Decision

```text
Phase 4B ACCEPTED
```

Every requirement passed against real evidence:

```text
1   Finding aggregate with canonical category/severity/status         PASS
2   Blocking review verdict produces a durable Finding                PASS
3   Clean review produces no Finding                                 PASS
4   Every Finding traceable to its reviewer and its Run              PASS
5   Two reviewers, two Findings, each attributable                   PASS
6   Remediation owner derived from durable history                   PASS
7   A reviewer is never the remediation owner                        PASS
8   Ambiguous ownership blocks instead of guessing                   PASS
9   Resolved only by independent re-review of the same Run            PASS
10  Human risk acceptance requires a reason and a USER actor          PASS
11  Risk cannot be accepted twice; terminal Findings are refused      PASS
12  An open blocker prevents Run completion                           PASS
13  Evidence aggregate with truthful availability vs command status   PASS
14  A declared check runs in the Run's isolated worktree              PASS
15  Check execution is argument-safe, shell-free, environment-minimal PASS
16  Unsafe declarations are refused at declaration time (422)         PASS
16a Interpreter inline code is DENIED, not approved (python3 -c etc.)  PASS
16b Interpreters that are not verification tools are DENIED            PASS
16c Package-manager mutation cannot ride an allowlisted executable     PASS
16d Paths outside the workspace are DENIED, including after `=`        PASS
16e Denial happens before the process boundary (proven by control)     PASS
16f The runtime classifier re-checks the same predicate as the ctor    PASS
17  Failed check blocks completion with exit status recorded          PASS
18  Verification never falls back to the main working tree            PASS
19  Raw output is never persisted; only a bounded redacted excerpt    PASS
20  A Run without declared checks reports unchecked, not passed       PASS
20a Evidence records workspace_id, base_revision, current_revision     PASS
20b Stale Evidence cannot satisfy the gate                            FAIL — Phase 4C blocker
20c Verification scope is explicit with several writers               FAIL — Phase 4C blocker
21  Review handoff gives a read-only view of the candidate            PASS
22  The view creates no worktree and is never owned                   PASS
23  Handoff records a Git-derived DIFF_SUMMARY Evidence               PASS
24  Releasing a view cannot remove the candidate worktree             PASS
25  Findings and Evidence survive restart with state intact           PASS
26  Additive v7 → v8 migration; earlier rows preserved                PASS
27  Findings are never deleted; Evidence is append-only               PASS
28  Duplicate reviewer delivery cannot create a second Finding        PASS
29  Canonical review/verification/evidence Events; taxonomy closed     PASS
30  No host path or absolute path in any Phase 4B DTO or Event        PASS
31  All Phase 1–4A tests pass; frontend unchanged and green            PASS
```

Two acceptance items are recorded as **FAIL** rather than PASS, and both are
Phase 4C obligations: verification Evidence staleness (WORKTREE_POLICY §144–§146)
and explicit verification scope / candidate designation (§142–§143). Each is
demonstrated by a strict `xfail` test that will XPASS — and fail loudly — when
Phase 4C implements it. Neither is hidden, and neither is silently fixed here,
because a correct fix depends on the candidate designation this phase does not
introduce.

This accepts **Phase 4B only**. Phase 4 as a whole is not yet accepted, and what
remains is a Phase 4C concern rather than a provider concern: the end-to-end
ReferenceExecutor write workflow, candidate/integration workspace designation
where a workflow has more than one writable candidate, verification Evidence
staleness detection, and cleanup/reconciliation closure.

The PHASE_4A record's "no real command execution" limitation is closed by this
phase; its integration item is carried into Phase 4C. The real executor belongs to
Phase 6 and is not a Phase-4 exit criterion.
