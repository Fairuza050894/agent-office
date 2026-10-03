# Phase 23 — Release Hardening

## Status

Final checkpoint of the accelerated Phase 20–23 delivery sequence.

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

- [ ] A real Project can reach a human-accepted managed branch without manual copying between worktrees.
- [ ] Request changes creates a new remediation Run and preserves the original completed Run.
- [ ] Inbox/Board surfaces every implemented human decision gate without draggable fake state.
- [ ] Accepted-change KPI counts only delivered human decisions.
- [ ] Change dossier exports only after `DELIVERED`.

### Repository safety

- [ ] Executor work remains isolated from the Project source checkout.
- [ ] Agent instructions prohibit commit/merge/rebase/push/force-push.
- [ ] Managed delivery never pushes or merges to the default branch.
- [ ] Duplicate approve/deliver calls remain idempotent.
- [ ] Verification commands remain allowlisted/deny-by-default.

### Verification

- [ ] backend Pytest passes;
- [ ] Ruff passes;
- [ ] formatting check passes;
- [ ] MyPy passes;
- [ ] `pip check` passes;
- [ ] frontend tests pass;
- [ ] TypeScript typecheck passes;
- [ ] ESLint passes;
- [ ] production npm dependency audit has no high/critical finding;
- [ ] production build passes;
- [ ] Office production guard passes;
- [ ] Chromium Planning/Live/Replay R3F smoke passes;
- [ ] repository whitespace check passes.

### Truth and audit

- [ ] missing facts remain null/unknown rather than inferred;
- [ ] ResultReview timestamps come from AuditRecords;
- [ ] Evidence and Finding records remain linked to the canonical Run;
- [ ] `COMPLETED`, `DELIVERED`, and accepted-change KPI wording remain distinct;
- [ ] no agent/person productivity ranking is introduced.

### Known release boundaries

The release must clearly state that the following are **not yet enterprise-complete**:

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

These are roadmap capabilities, not hidden acceptance criteria for the local release candidate.

## Release positioning

The truthful product proposition at this checkpoint is:

> A local AI engineering team that works in isolated repository workspaces, keeps canonical evidence and findings, requires human acceptance, and delivers accepted results to a managed local branch without automatically touching main.

The 3D Office is the operational visualization layer. Task decisions, evidence, human gates, and accepted delivery are the product value loop.

## Phase 23 acceptance gates

```text
modernized GitHub Actions bootstrap
pip check
backend pytest / Ruff / format / MyPy
npm production dependency audit
frontend tests / typecheck / lint / build
Office character production guard
production Office guard
Chromium Planning / Live / Replay R3F smoke
repository whitespace verification
```
