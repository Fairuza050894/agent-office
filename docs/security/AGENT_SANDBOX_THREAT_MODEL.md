# Agent Office Agent Sandbox Threat Model

## Status

Phase 22 enterprise-trust security contract.

## Scope

This document covers threats created when Agent Office allows an executor to inspect and modify an isolated repository worktree. It does not claim that the local MVP provides tenant isolation, enterprise IAM, or a hardened remote sandbox.

## Security invariants

Agent Office must preserve all of the following:

1. executor work occurs in an isolated managed workspace;
2. executor prompts forbid commit, merge, rebase, push, and force-push;
3. Codex execution remains network-disabled in the accepted local configuration;
4. Agent Office verification commands remain allowlisted and deny-by-default;
5. technical `COMPLETED` never means human acceptance;
6. accepted delivery creates only a local managed branch/commit;
7. delivery never pushes and never merges to the Project default branch;
8. human result decisions remain append-only AuditRecords;
9. missing security facts remain unknown rather than inferred.

## Threats and required controls

### Repository prompt injection

**Threat:** repository files may contain text that attempts to override system instructions, request secrets, or cause unsafe repository operations.

**Controls:**

- repository content is untrusted input;
- executor safety instructions outrank repository instructions;
- repository text never grants new capabilities;
- no network access for the accepted Codex local path;
- verification remains controlled by Agent Office, not by an agent assertion;
- human review and managed delivery remain separate gates.

**Verification target:** evaluation repositories should include malicious instructions and confirm that no push/merge/network capability is gained.

### Dependency and lifecycle scripts

**Threat:** a repository may contain package-manager or build scripts that execute arbitrary commands during install or verification.

**Controls:**

- Agent Office verification runs only commands explicitly declared in a Workflow verification contract;
- verification command classification remains deny-by-default;
- no implicit package installation should be added to executor orchestration;
- a future production deployment should provide OS-level sandboxing beyond worktree isolation.

### Secret exposure through local files

**Threat:** credentials present inside the registered repository or inherited local environment may be readable by an executor.

**Controls:**

- only the registered Project worktree is intended as executor context;
- safe metadata and audit records must not contain raw credentials;
- executor environment variables should remain explicitly bounded;
- production deployment must use scoped credentials and secret mounts rather than broad shell inheritance.

**Known limitation:** the local MVP is not a secret-isolation boundary equivalent to a hardened container or VM.

### Workspace persistence and disk exhaustion

**Threat:** retained agent/integration worktrees and generated artifacts may exhaust disk capacity.

**Controls:**

- Workspace lifecycle remains durable and inspectable;
- release/reconcile actions are explicit;
- retention/cleanup automation must be introduced before unattended multi-user operation;
- cleanup must never delete the Project source repository or an accepted managed branch without an explicit policy.

### Malicious or excessive output

**Threat:** executor logs, findings, or evidence may contain huge or hostile content.

**Controls:**

- existing domain size limits and output excerpts remain enforced;
- UI rendering must treat executor content as text, not executable markup;
- change dossiers sanitize Markdown structure and export canonical summaries rather than raw command streams.

### Supply-chain and third-party assets

**Threat:** build-time character/assets or dependencies may change upstream, disappear, or introduce licensing/security risk.

**Controls:**

- production character assets remain integrity/provenance pinned;
- dependencies remain lockfile-pinned;
- external assets are never relabeled as first-party authored content;
- Phase 23 release hardening must include dependency/license review and a vendoring decision for build-critical assets.

## Human decision threats

### Confusing technical completion with delivery

A `COMPLETED` Run is only a technical fact. A change counts as accepted only when a human approval is recorded and managed delivery succeeds. KPI, Inbox/Board, and dossier exports must preserve this distinction.

### Approval replay or duplicate delivery

Result approval and delivery must be idempotent. A repeated approve/deliver request must not create duplicate commits or a second contradictory human decision.

### Changes after approval

A result that is approved/delivered cannot later be changed by recording a conflicting `CHANGES_REQUESTED` decision against the same result. A new remediation Run is the path for requested changes.

## Required security evaluation before remote or enterprise deployment

1. malicious repository prompt-injection fixture;
2. dependency-script fixture that attempts forbidden side effects;
3. oversized-output fixture;
4. secret-canary fixture confirming safe metadata does not expose the canary;
5. disk/worktree retention stress test;
6. delivery idempotency test;
7. confirmation that no accepted-flow code performs push or merge to the default branch.

## Non-goals in Phase 22

- multi-tenant cloud isolation;
- enterprise SSO/RBAC;
- automatic pull-request creation;
- automatic merge;
- remote secret management;
- general-purpose arbitrary shell execution.

Those capabilities require their own threat model and explicit approval before implementation.
