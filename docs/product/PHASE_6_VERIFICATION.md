# Agent Office Phase 6 Verification

Status: CLOSED

Phase: Phase 6 — First Real Executor

Verification date: 2026-09-25

Verified implementation checkpoint:

```text
948bfb5 docs: align phase 6 milestone status
```

## Scope

Phase 6 integrates the first real AI executor without redesigning Agent Office core domain semantics.

The selected runtime is Codex CLI, integrated through the existing provider-neutral `ExecutorAdapter` boundary.

The Phase 6 acceptance source is `docs/product/MVP_ACCEPTANCE.md` §§109–125. The exit criterion requires one real executor to perform a bounded engineering AgentRun in an isolated worktree while Agent Office truthfully reflects lifecycle, evidence, cancellation, reconciliation, capability limitations, and result.

## Implemented boundary

Phase 6 adds:

- bounded `CodexExecutor`
- Codex execution context bound to an Agent Office-managed Workspace
- opt-in configuration and executor registry integration
- health, runtime, capability, and security-limitation exposure
- provider-neutral orchestration integration
- fail-closed unknown-start behavior with no blind duplicate retry
- truthful cancellation/reconciliation semantics
- raw-provider-output suppression from ordinary Event/API surfaces
- bounded environment construction
- deterministic unit, conformance, orchestration, and isolated-workspace integration tests
- opt-in live Codex smoke runner using a disposable temporary repository

The implementation preserves the existing Agent Office safety boundary:

- no automatic commit
- no automatic merge
- no push or force-push
- no destructive Git against the registered Project main working tree
- write-capable Codex execution only in an Agent Office-managed isolated Workspace
- executor web/network capability remains disabled by Agent Office policy for this integration
- ambient apps/plugins/multi-agent/MCP configuration is not inherited into executor execution
- normal CI does not consume real Codex quota or authentication

## Automated verification

GitHub Actions PR run:

```text
36126333798
```

at implementation checkpoint:

```text
948bfb5
```

completed successfully.

Observed result:

```text
BACKEND PYTEST
627 passed, 1 dependency warning

RUFF
All checks passed!

RUFF FORMAT
182 files already formatted

MYPY
Success: no issues found in 121 source files

FRONTEND TEST
10 test files passed
52 tests passed

FRONTEND TYPECHECK
PASS

FRONTEND LINT
PASS

FRONTEND BUILD
PASS

REPOSITORY WHITESPACE
PASS
```

The remaining Python warning is a FastAPI/Starlette test-client dependency deprecation and is not a Phase 6 failure.

## Real adapter acceptance

The deterministic Phase 6 test suite verifies the required adapter surface and failure semantics without using a real provider during normal CI.

Covered behavior includes:

- `describe`
- `capabilities`
- `health`
- `start`
- `status`
- `cancel`
- `reconcile`
- `result`
- canonical lifecycle event mapping
- explicit unsupported/unknown capability representation
- provider session identity bound to one AgentRun
- fail-closed ambiguous start
- no automatic duplicate retry after unknown start outcome
- truthful cancellation state
- restart/reconciliation behavior
- isolation from raw provider payloads in normal API/event surfaces
- credential non-persistence in ordinary Project/Run/Event state
- assigned isolated Workspace enforcement

## Authenticated live smoke

The opt-in live smoke was executed manually on the operator's local Mac after installing and authenticating Codex CLI.

Preflight:

```text
codex-cli 0.157.0
Logged in using ChatGPT
```

Command:

```bash
./scripts/smoke-codex.sh
```

Observed result:

```json
{
  "agent_run_id": "f11f3064-15d2-4a4a-bd5c-df8397f59ef8",
  "agent_run_status": "COMPLETED",
  "canonical_events": [
    "agent.completed",
    "agent.started",
    "run.completed"
  ],
  "changed_paths": [
    "phase6-live-smoke.txt"
  ],
  "codex_health": "AVAILABLE",
  "codex_runtime_version": "codex-cli 0.157.0",
  "executor_id": "00000000-0000-4000-8000-000000000002",
  "main_repository_preserved": true,
  "quota_usage": "Unavailable; Agent Office does not fabricate provider usage.",
  "result_outcome": "SUCCESS",
  "run_failure_code": null,
  "run_id": "2fa89afc-c7cc-4b8c-8b36-5fce39c69e5b",
  "status": "PASS",
  "workspace_id": "03e19ca8-7112-4c22-bdd5-a1bd51120598",
  "workspace_retained": true
}
```

The smoke root was created under the operating system temporary directory and was not the Agent Office source repository.

The smoke test therefore proves:

- the authenticated Codex CLI is available to the adapter
- executor health is reported as `AVAILABLE`
- a real Codex AgentRun can execute through Agent Office
- the AgentRun reaches `COMPLETED`
- the parent Run reaches `COMPLETED`
- the result outcome is `SUCCESS`
- lifecycle events are normalized into canonical Agent Office events
- the real executor changes only the assigned isolated Workspace
- the registered/main repository is preserved
- the Workspace is retained after smoke for inspection
- provider quota is not fabricated when exact usage is unavailable

## Phase 6 acceptance reconciliation

### Precondition gate — §110

**Accepted.** ReferenceExecutor, worktree safety, event redaction, command policy, cancellation semantics, unknown-state handling, and secret handling were established before the real executor was enabled.

### Adapter operations and capability honesty — §§112–113

**Accepted.** Codex is exposed through `ExecutorAdapter` operations and unsupported or unavailable provider facts remain explicit rather than fabricated.

### Session, start ambiguity, cancellation, and reconciliation — §§114–117

**Accepted.** Session identity is bound to AgentRun identity, ambiguous start fails closed without automatic duplicate retry, cancellation is not falsely promoted to confirmed cancellation, and reconciliation has deterministic coverage.

### Event and provider-data safety — §§118–120

**Accepted.** Provider lifecycle is normalized into canonical Event types, ordinary frontend/core lifecycle does not require Codex-specific branching, raw provider output is not exposed as normal Event/API data, and credentials are not persisted in ordinary domain records.

### Isolated real-executor Workspace — §121

**Accepted.** The authenticated live smoke modified only `phase6-live-smoke.txt` in its assigned isolated Workspace and reported `main_repository_preserved: true`.

### Verification truthfulness — §122

**Accepted.** Agent/provider claims do not replace actual Agent Office verification evidence. Normal verification remains evidence-driven.

### Adapter conformance — §123

**Accepted.** Unit, conformance, failure-mode, orchestration, and isolated-workspace integration tests pass in normal CI without consuming provider quota.

### Live smoke — §124

**Accepted.** The smoke was explicitly opt-in, used a disposable temporary Git repository, was non-destructive to the Agent Office source/main repository, retained the Workspace, used authenticated local provider access rather than production application credentials, and reported quota as unavailable instead of inventing usage.

## Known limitations

Phase 6 intentionally does not claim:

- exact token usage or provider quota when Codex CLI does not expose it through this adapter
- automatic commit or merge
- provider-independent confirmation for capabilities Codex does not expose
- a second real executor
- mixed-executor orchestration across multiple real providers
- remote worker execution

Those remain explicit limitations or later-phase work.

## Final conclusion

The Phase 6 exit criterion in `MVP_ACCEPTANCE.md` §125 is satisfied.

One real executor can now safely perform a bounded engineering AgentRun in an isolated worktree through the existing `ExecutorAdapter` architecture, while Agent Office truthfully represents executor health, capability limitations, lifecycle, result, unknown-state safety, and Workspace isolation.

Therefore:

```text
Phase 6 CLOSED
Phase 7 NEXT — Multi-Executor / Second Project Dogfood
```
