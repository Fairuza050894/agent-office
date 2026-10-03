# Phase 23 — Release Hardening

## Status

**COMPLETE / MERGED**

```text
PR: #49
exact verified head: 7ef0187016427ca8242aa39a14e73810e5fe52e6
GitHub Actions verify #1591: SUCCESS
merge commit: b4bc5273580130c4dd706fd5b1ba076f3ce01f96
```

Acceptance evidence is a real exact-head GitHub-hosted run. `pip check`, production npm audit, backend Pytest/Ruff/format/MyPy, frontend tests/typecheck/lint/build, Office production guard, Chromium Planning/Live/Replay R3F smoke, and repository whitespace verification all passed before merge.

## Goal

Move Agent Office from an internal technical beta toward a defensible release candidate without claiming capabilities that have not been implemented.

The release target remains a local/single-owner engineering orchestration product with strong truth, isolation, human acceptance, managed delivery, Task-centered decisions, a living 3D Office, and canonical audit evidence.

## Delivered in this checkpoint

### CI runtime modernization

The verification workflow uses current Node-24-based GitHub actions:

- `actions/checkout@v7`;
- `actions/setup-node@v7`;
- `actions/setup-python@v7`.

The existing Node 22 application test runtime and Python 3.12 application runtime remain pinned.

### CI trigger efficiency

Full repository verification now runs on:

- pull requests;
- pushes to `main`;
- explicit manual `workflow_dispatch` runs.

Pushes to ordinary `phase-*` development branches no longer start a second full verification in addition to the pull-request run. `cancel-in-progress` remains enabled so a newer PR head supersedes an older in-flight verification for the same ref.

This keeps the merge gate intact while avoiding duplicate GitHub-hosted runner consumption for the same development checkpoint.

### Dependency release gates

Verification now checks:

- Python dependency consistency with `pip check`;
- production npm dependencies with `npm audit --omit=dev --audit-level=high`.

The production audit is deliberately scoped to shipped dependencies. Development-tool advisories remain visible in `npm ci` output and must not be silently described as resolved.

### Renderer ownership and fallback sunset

ADR-0004 now reflects the current production truth:

- R3F owns Planning, Live, and Replay normal production rendering;
- Three.js is recovery-only;
- HTML operational surfaces are the final non-WebGL fallback;
- explicit evidence-based criteria are required before the Three.js fallback may be deleted.

### Release acceptance model

A release candidate must preserve this value loop:

```text
Describe outcome
  -> Plan / requirements / team
  -> explicit promotion
  -> isolated agent work
  -> verification + review
  -> human result decision
  -> managed local delivery
  -> ACCEPTED / change dossier / KPI
```

Technical `COMPLETED` is not human `DELIVERED`.

## Release checklist

### Product value

- [x] A real Project can reach a human-accepted managed branch without manual copying between worktrees.
- [x] Request changes creates a new remediation Run and preserves the original completed Run.
- [x] Inbox/Board surfaces every implemented human decision gate without draggable fake state.
- [x] Accepted-change KPI counts only delivered human decisions.
- [x] Change dossier exports only after `DELIVERED`.

### Repository safety

- [x] Executor work remains isolated from the Project source checkout.
- [x] Agent instructions prohibit commit/merge/rebase/push/force-push.
- [x] Managed delivery never pushes or merges to the default branch.
- [x] Duplicate approve/deliver calls remain idempotent.
- [x] Verification commands remain allowlisted/deny-by-default.

### Verification

- [x] backend Pytest passes;
- [x] Ruff passes;
- [x] formatting check passes;
- [x] MyPy passes;
- [x] `pip check` passes;
- [x] frontend tests pass;
- [x] TypeScript typecheck passes;
- [x] ESLint passes;
- [x] production npm dependency audit has no high/critical finding;
- [x] production build passes;
- [x] Office production guard passes;
- [x] Chromium Planning/Live/Replay R3F smoke passes;
- [x] repository whitespace check passes.

### Truth and audit

- [x] missing facts remain null/unknown rather than inferred;
- [x] ResultReview timestamps come from AuditRecords;
- [x] Evidence and Finding records remain linked to the canonical Run;
- [x] `COMPLETED`, `DELIVERED`, and accepted-change KPI wording remain distinct;
- [x] no agent/person productivity ranking is introduced.

### Known release boundaries

The release still does **not** claim the following as enterprise-complete:

- multi-user identity, SSO, and RBAC;
- separation-of-duties enforcement between named users;
- multi-tenant cloud isolation;
- automatic Git provider push/PR/merge;
- webhook/email/chat notification transport;
- automatic retention/worktree cleanup;
- second production executor;
- generic cross-domain business workflow step model;
- Three.js fallback retirement;
- custom first-party Blender character/environment pack.

These remain roadmap capabilities rather than hidden acceptance criteria.

## Release positioning

The truthful product proposition at this checkpoint is:

> A local AI engineering team that works in isolated repository workspaces, keeps canonical evidence and findings, requires human acceptance, and delivers accepted results to a managed local branch without automatically touching main.

The 3D Office is the operational visualization layer. Task decisions, evidence, human gates, and accepted delivery are the product value loop.

## Phase 23 acceptance gates

```text
modernized GitHub Actions bootstrap: PASS
PR/main/manual-only full verification triggers: ACCEPTED
pip check: PASS
backend pytest / Ruff / format / MyPy: PASS
npm production dependency audit: PASS
frontend tests / typecheck / lint / build: PASS
Office character production guard: PASS
production Office guard: PASS
Chromium Planning / Live / Replay R3F smoke: PASS
repository whitespace verification: PASS
```
