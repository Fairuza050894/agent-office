"""Phase 3C: restart recovery discovery.

Recovery discovery identifies durable non-terminal Runs that may need an
operator. It is a pure read: it performs no external I/O and mutates nothing.
Reconciliation stays an explicit, bounded action.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import uuid4

from conftest import Harness, HarnessFactory

from agent_office.infrastructure.executors import ReferenceScenario


def _waiting_run(
    harness: Harness,
    *,
    project_name: str = "Recovery Project",
) -> dict[str, Any]:
    """Start a Run whose assignments stay active at the executor."""

    project = harness.register_project(project_name)
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    return {"project": project, "task": task, "run": run}


def _candidate(candidates: list[dict[str, Any]], run_id: str) -> dict[str, Any]:
    for candidate in candidates:
        if candidate["run_id"] == run_id:
            return candidate

    raise AssertionError(f"Run {run_id} is absent from recovery discovery")


def test_completed_run_is_not_a_recovery_candidate(
    harness_factory: HarnessFactory,
) -> None:
    """Terminal Runs need no recovery."""

    harness = harness_factory()
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] == "COMPLETED"
    assert harness.recovery_candidates() == []


def test_non_terminal_run_appears_after_reopen(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """A Run left mid-flight is discoverable in a fresh process."""

    database_path = tmp_path / "recovery.sqlite"
    harness = harness_factory(ReferenceScenario.WAITING, database_path=database_path)
    created = _waiting_run(harness)
    run = created["run"]

    reopened = harness_factory(database_path=database_path)
    candidates = reopened.recovery_candidates()

    assert [candidate["run_id"] for candidate in candidates] == [run["id"]]

    candidate = _candidate(candidates, run["id"])
    assert candidate["project_id"] == created["project"]["id"]
    assert candidate["status"] not in {"COMPLETED", "FAILED", "CANCELLED"}
    assert candidate["unresolved_agent_run_count"] == len(reopened.agent_runs(run["id"]))


def test_started_unresolved_agent_run_requires_reconciliation(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """A started assignment with no proven state must be reconciled first."""

    database_path = tmp_path / "recovery-required.sqlite"
    harness = harness_factory(ReferenceScenario.WAITING, database_path=database_path)
    created = _waiting_run(harness)
    run = created["run"]

    reopened = harness_factory(database_path=database_path)
    candidate = _candidate(reopened.recovery_candidates(), run["id"])

    assert candidate["reconciliation_required"] is True
    assert candidate["classification"] == "RECONCILIATION_REQUIRED"


def test_discovery_performs_no_execution_and_mutates_nothing(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """Discovery is a read: no adapter call, no state change, no new record."""

    database_path = tmp_path / "recovery-readonly.sqlite"
    harness = harness_factory(ReferenceScenario.WAITING, database_path=database_path)
    created = _waiting_run(harness)
    run = created["run"]

    reopened = harness_factory(database_path=database_path)
    reopened_executor = reopened.app.state.executor_registry.default().adapter

    runs_before = reopened.run_by_id(run["id"])
    agents_before = reopened.agent_runs(run["id"])
    stages_before = reopened.stages(run["id"])
    events_before = reopened.events(run["id"])
    audit_before = reopened.audit(run["id"])
    start_calls_before = reopened_executor.start_calls

    for _ in range(3):
        assert reopened.recovery_candidates()

    assert reopened_executor.start_calls == start_calls_before
    assert reopened.run_by_id(run["id"]) == runs_before
    assert reopened.agent_runs(run["id"]) == agents_before
    assert reopened.stages(run["id"]) == stages_before
    assert reopened.events(run["id"]) == events_before
    assert reopened.audit(run["id"]) == audit_before

    # The Executor exposes one observable counter: how many start attempts it
    # was asked to make. Discovery must not add any.
    assert reopened_executor.start_calls == start_calls_before


def test_recovery_candidate_carries_no_path_or_session(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """Discovery is not a filesystem or provider inspection surface."""

    database_path = tmp_path / "recovery-safe.sqlite"
    harness = harness_factory(ReferenceScenario.WAITING, database_path=database_path)
    created = _waiting_run(harness)
    run = created["run"]

    reopened = harness_factory(database_path=database_path)
    blob = str(reopened.recovery_candidates())

    assert run["id"] in blob

    for forbidden in (
        "repository_path",
        "canonical_path",
        "git_common_dir",
        str(tmp_path),
        "opaque_session_id",
        "executor_session",
    ):
        assert forbidden not in blob


def test_policy_blocked_run_is_classified_as_such(
    harness_factory: HarnessFactory,
) -> None:
    """A block that resume cannot clear is reported as needing a decision."""

    harness = harness_factory(ReferenceScenario.REVIEW_BLOCKER)
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] == "BLOCKED"
    assert started["failure_code"] == "REMEDIATION_BOUND_EXCEEDED"

    candidate = _candidate(harness.recovery_candidates(), run["id"])
    assert candidate["classification"] == "BLOCKED_POLICY"
    assert candidate["reason_code"] == "REMEDIATION_BOUND_EXCEEDED"
    assert candidate["reconciliation_required"] is False


def test_resumable_block_is_classified_as_resumable(
    harness_factory: HarnessFactory,
) -> None:
    """A block an explicit resume can clear is reported differently."""

    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"], requested_executor_id=str(uuid4()))
    harness.start_raw(run["id"])

    assert harness.run_by_id(run["id"])["failure_code"] == "EXECUTOR_UNAVAILABLE"

    candidate = _candidate(harness.recovery_candidates(), run["id"])
    assert candidate["classification"] == "RESUMABLE_BLOCK"
    assert candidate["reconciliation_required"] is False
    assert candidate["unresolved_agent_run_count"] == 0


def test_explicit_reconciliation_remains_idempotent_after_restart(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """Recovery discovery does not replace explicit, idempotent reconciliation."""

    database_path = tmp_path / "recovery-idempotent.sqlite"
    harness = harness_factory(ReferenceScenario.WAITING, database_path=database_path)
    created = _waiting_run(harness)
    run = created["run"]

    reopened = harness_factory(database_path=database_path)
    agents_before = reopened.agent_runs(run["id"])

    first = reopened.reconcile_raw(run["id"]).json()
    second = reopened.reconcile_raw(run["id"]).json()
    third = reopened.reconcile_raw(run["id"]).json()

    assert first == second == third
    assert first["status"] == "BLOCKED"
    assert first["failure_code"] == "UNKNOWN_EXECUTION_STATE"

    # Reconciliation created no duplicate AgentRun and started no work.
    assert reopened.agent_runs(run["id"]) == agents_before
    assert reopened.app.state.executor_registry.default().adapter.start_calls == 0


def test_unknown_executor_state_blocks_safely_after_restart(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """Unproven external state remains blocked and is never claimed as success."""

    database_path = tmp_path / "recovery-unknown.sqlite"
    harness = harness_factory(ReferenceScenario.WAITING, database_path=database_path)
    created = _waiting_run(harness)
    run = created["run"]

    reopened = harness_factory(database_path=database_path)
    reconciled = reopened.reconcile_raw(run["id"]).json()

    assert reconciled["status"] == "BLOCKED"
    assert reconciled["status"] != "COMPLETED"
    assert reopened.completion_gates(run["id"])["complete"] is False

    candidate = _candidate(reopened.recovery_candidates(), run["id"])
    assert candidate["classification"] == "RECONCILIATION_REQUIRED"
    assert candidate["status"] == "BLOCKED"


def test_recovery_discovery_survives_a_second_reopen(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """Discovery reflects durable state, not process memory."""

    database_path = tmp_path / "recovery-second.sqlite"
    harness = harness_factory(ReferenceScenario.WAITING, database_path=database_path)
    created = _waiting_run(harness)
    run = created["run"]

    first = harness_factory(database_path=database_path)
    first.reconcile_raw(run["id"])
    after_first = first.recovery_candidates()

    second = harness_factory(database_path=database_path)
    assert second.recovery_candidates() == after_first

    second.reconcile_raw(run["id"])
    assert second.recovery_candidates() == after_first


def test_recovery_candidates_are_scoped_to_their_project(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """Two Projects stay isolated through recovery discovery."""

    database_path = tmp_path / "recovery-isolation.sqlite"
    harness = harness_factory(ReferenceScenario.WAITING, database_path=database_path)
    first = _waiting_run(harness, project_name="Recovery A")
    second = _waiting_run(harness, project_name="Recovery B")

    reopened = harness_factory(database_path=database_path)
    candidates = reopened.recovery_candidates()

    first_candidate = _candidate(candidates, first["run"]["id"])
    second_candidate = _candidate(candidates, second["run"]["id"])

    assert first_candidate["project_id"] == first["project"]["id"]
    assert second_candidate["project_id"] == second["project"]["id"]
    assert first_candidate["project_id"] != second_candidate["project_id"]
