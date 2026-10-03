# Phase 22 — Enterprise Trust Layer

## Status

**COMPLETE / MERGED**

```text
PR: #47
exact verified head: 3f151fbdeab69f75fdcc48f906ca8cd6ed9b7139
GitHub Actions verify #1563: SUCCESS
merge commit: e60610732d3aa642f2da9abfc0e44bd54de9c354
```

Acceptance evidence is a real exact-head GitHub-hosted run: backend Pytest/Ruff/format/MyPy, frontend tests/typecheck/lint/build, Office production guard, Chromium Planning/Live/Replay R3F smoke, and repository whitespace verification all passed before merge.

## Product goal

Turn accepted engineering work into a factual enterprise artifact and establish a measurable North Star without weakening the local safety model.

Phase 22 deliberately prioritizes trust and auditability over another visual Office iteration.

## Delivered

### Factual human-decision timestamps

`ResultReviewProjection` now exposes the actual append-only AuditRecord timestamps for:

- `changes_requested_at`;
- `approved_at`;
- `delivered_at`.

No synthetic timestamp is created. Missing decisions remain `null`.

### Accepted Change Dossier

Task Decision can export a Markdown change dossier only after the result state is `DELIVERED`.

The dossier projects existing canonical records:

- Project and Task identity;
- Task objective and constraints/human review amendments;
- Run technical status and timestamps;
- human result state;
- managed accepted branch and commit;
- Evidence;
- Findings and resolution summaries;
- result approval/delivery AuditRecords.

The export explicitly states that technical `COMPLETED` is not human `DELIVERED`, and that a managed local branch/commit does not imply push or merge to the Project default branch.

A Run that is merely `COMPLETED` is rejected by the dossier builder.

### Accepted-change North Star

Project KPI now includes factual acceptance metrics:

- accepted changes in the last seven days;
- accepted changes recorded overall;
- acceptance rate = delivered results / technically completed Runs;
- average time from technical completion to managed delivery when both timestamps exist.

These metrics do not rank people or agents. Missing delivery timestamps remain unavailable rather than inferred.

### Sandbox threat model

`docs/security/AGENT_SANDBOX_THREAT_MODEL.md` documents the accepted local threat boundary and the required controls/evaluations for:

- repository prompt injection;
- dependency/lifecycle scripts;
- local secret exposure;
- retained-worktree disk exhaustion;
- hostile or oversized agent output;
- third-party supply chain;
- duplicate/replayed human decisions and delivery.

The document also states the explicit limitations of the local MVP. It does not claim enterprise SSO, multi-tenant isolation, or hardened remote sandboxing.

## Truth boundary

Phase 22 does not add a second source of execution truth.

Canonical truth remains:

```text
Project
  -> Composer / planning
  -> RequirementCandidate / TeamProposal
  -> Task
  -> Run / Stage / AgentRun
  -> Evidence / Finding / Event
  -> human ResultReview
  -> managed local delivery
  -> AuditRecord
```

The dossier and KPI are read projections over those records.

## Acceptance gates

```text
backend pytest / Ruff / format / MyPy: PASS
frontend tests / typecheck / lint / build: PASS
accepted-change KPI tests: PASS
change-dossier truth tests: PASS
result-review timestamp tests: PASS
Office character production guard: PASS
production Office guard: PASS
Chromium Planning / Live / Replay R3F smoke: PASS
repository whitespace verification: PASS
```

## Deferred by design

The following remain separate production decisions rather than being silently claimed complete:

- enterprise identity / SSO / RBAC;
- webhook/email/chat notification delivery;
- automatic retention cleanup;
- automatic pull-request creation;
- multi-tenant cloud isolation;
- second real executor;
- generic business-workflow typed steps;
- Three.js fallback retirement.
