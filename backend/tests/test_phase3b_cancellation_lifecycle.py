"""Phase 3B: cancellation lifecycle truthfulness.

Cancellation is gated on the Executor's declared CANCELLATION capability before
any cancel side effect. A request is never proof of termination, an UNKNOWN
outcome never becomes CANCELLED, and repeated requests are idempotent.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from conftest import HarnessFactory, ScriptedExecutor, registry_for

from agent_office.domain import ExecutionStatus, ExecutorCapability
from agent_office.infrastructure.executors import ReferenceScenario


def _running_run(
    harness_factory: HarnessFactory,
    scenario: ReferenceScenario,
    *,
    database_path: Path | None = None,
):
    """Start a Run whose assignments are still active at the executor."""

    harness = harness_factory(scenario, database_path=database_path)
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    return harness, run


def test_capability_supported_and_cancel_confirmed(
    harness_factory: HarnessFactory,
) -> None:
    """Scenario 4: a confirmed cancellation is propagated truthfully."""

    harness, run = _running_run(harness_factory, ReferenceScenario.CANCEL_CONFIRMED)

    assert harness.run_by_id(run["id"])["status"] not in {"COMPLETED", "FAILED", "CANCELLED"}

    response = harness.cancel_raw(run["id"])
    assert response.status_code == 200
    assert response.json()["status"] == "CANCELLED"

    assert {agent_run["status"] for agent_run in harness.agent_runs(run["id"])} == {"CANCELLED"}
    assert harness.stage_status(run["id"], "DISCOVERY") == "CANCELLED"

    event_types = [event["event_type"] for event in harness.events(run["id"])]
    assert "run.cancel.requested" in event_types
    assert "agent.cancel.requested" in event_types
    assert "agent.cancelled" in event_types
    assert event_types[-1] == "run.cancelled"


def test_capability_unknown_is_not_treated_as_support(
    harness_factory: HarnessFactory,
) -> None:
    """Scenario B: an UNKNOWN capability preserves the last-known execution truth."""

    executor = ScriptedExecutor(
        session_status=ExecutionStatus.RUNNING,
        unknown_capabilities=frozenset({ExecutorCapability.CANCELLATION}),
    )
    harness = harness_factory(registry=registry_for(executor))

    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    before = harness.agent_runs(run["id"])
    assert {agent_run["status"] for agent_run in before} == {"RUNNING"}

    cancel_calls_before = executor.cancel_calls

    response = harness.cancel_raw(run["id"])
    assert response.status_code == 200

    # The cancel adapter call never happened.
    assert executor.cancel_calls == cancel_calls_before

    body = response.json()
    assert body["status"] == "BLOCKED"
    assert body["status"] != "CANCELLED"
    assert body["failure_code"] == "CANCELLATION_UNSUPPORTED"

    after = harness.agent_runs(run["id"])

    # An inability to cancel is not proof that the external execution stopped,
    # so the AgentRun keeps the last authoritative status it was given.
    assert {agent_run["status"] for agent_run in after} == {"RUNNING"}
    assert {agent_run["reason_code"] for agent_run in after} == {"CANCELLATION_UNSUPPORTED"}
    assert [agent_run["started_at"] for agent_run in after] == [
        agent_run["started_at"] for agent_run in before
    ]
    assert {agent_run["completed_at"] for agent_run in after} == {None}


def test_capability_unsupported_preserves_last_known_status(
    harness_factory: HarnessFactory,
) -> None:
    """Scenario A: an UNSUPPORTED capability preserves the last-known execution truth."""

    executor = ScriptedExecutor(
        session_status=ExecutionStatus.RUNNING,
        unsupported_capabilities=frozenset({ExecutorCapability.CANCELLATION}),
    )
    harness = harness_factory(registry=registry_for(executor))

    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    cancel_calls_before = executor.cancel_calls
    response = harness.cancel_raw(run["id"]).json()

    assert executor.cancel_calls == cancel_calls_before
    assert response["status"] == "BLOCKED"
    assert response["failure_code"] == "CANCELLATION_UNSUPPORTED"

    agent_runs = harness.agent_runs(run["id"])
    assert {agent_run["status"] for agent_run in agent_runs} == {"RUNNING"}
    assert "agent.blocked" not in [event["event_type"] for event in harness.events(run["id"])]
    assert harness.completion_gates(run["id"])["complete"] is False


def test_unproven_cancellation_requires_reconciliation(
    harness_factory: HarnessFactory,
) -> None:
    """The assignment is only resolved by proven executor truth, never by the request."""

    executor = ScriptedExecutor(
        session_status=ExecutionStatus.RUNNING,
        unsupported_capabilities=frozenset({ExecutorCapability.CANCELLATION}),
    )
    harness = harness_factory(registry=registry_for(executor))

    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    harness.cancel_raw(run["id"])

    # The executor still reports active work, so reconciliation proves nothing
    # new and the Run stays blocked with the assignment unresolved.
    harness.reconcile_raw(run["id"])

    assert harness.run_by_id(run["id"])["status"] == "BLOCKED"
    assert {agent_run["status"] for agent_run in harness.agent_runs(run["id"])} == {"RUNNING"}

    # Once the executor proves the assignment finished, reconciliation records
    # that truth on the AgentRun instead of a claimed cancellation.
    for session_id in executor.session_ids():
        executor.complete(session_id)

    harness.reconcile_raw(run["id"])

    completed = harness.agent_runs(run["id"])
    assert {agent_run["status"] for agent_run in completed} == {"COMPLETED"}
    assert {agent_run["reason_code"] for agent_run in completed} == {None}
    assert "agent.cancelled" not in [event["event_type"] for event in harness.events(run["id"])]

    # With nothing external left running the requested cancellation is no longer
    # unproven, so the operator request can now be honoured.
    assert harness.cancel_raw(run["id"]).json()["status"] == "CANCELLED"


def test_capability_supported_and_cancel_unknown_does_not_claim_cancelled(
    harness_factory: HarnessFactory,
) -> None:
    """Scenario 5: an unknown cancellation outcome is never claimed."""

    harness, run = _running_run(harness_factory, ReferenceScenario.CANCEL_UNKNOWN)

    response = harness.cancel_raw(run["id"]).json()

    assert response["status"] == "BLOCKED"
    assert response["status"] != "CANCELLED"
    assert response["failure_code"] == "CANCELLATION_UNKNOWN"
    assert response["cancel_requested_at"] is not None

    # The cancel call happened and returned an unknowable outcome. That is not
    # proof the assignment stopped, so its last authoritative status is
    # preserved rather than replaced with a blocking claim.
    assert {agent_run["status"] for agent_run in harness.agent_runs(run["id"])} == {"RUNNING"}
    assert {agent_run["reason_code"] for agent_run in harness.agent_runs(run["id"])} == {
        "CANCELLATION_UNKNOWN"
    }

    event_types = [event["event_type"] for event in harness.events(run["id"])]
    assert "run.cancel.requested" in event_types
    assert "agent.cancel.requested" in event_types
    assert "agent.blocked" not in event_types
    assert "agent.cancelled" not in event_types
    assert "run.cancelled" not in event_types


def test_repeated_cancellation_is_idempotent(harness_factory: HarnessFactory) -> None:
    """Scenario D: a repeated request never mutates the last-known execution truth."""

    harness, run = _running_run(harness_factory, ReferenceScenario.CANCEL_UNKNOWN)

    first = harness.cancel_raw(run["id"]).json()
    agent_runs_after_first = harness.agent_runs(run["id"])
    events_after_first = harness.events(run["id"])

    assert {agent_run["status"] for agent_run in agent_runs_after_first} == {"RUNNING"}

    second = harness.cancel_raw(run["id"]).json()
    third = harness.cancel_raw(run["id"]).json()

    assert second == first
    assert third == first
    assert harness.agent_runs(run["id"]) == agent_runs_after_first
    assert harness.events(run["id"]) == events_after_first


def test_repeated_cancellation_does_not_duplicate_cancel_calls(
    harness_factory: HarnessFactory,
) -> None:
    executor = ScriptedExecutor(session_status=ExecutionStatus.RUNNING)
    harness = harness_factory(registry=registry_for(executor))

    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    harness.cancel_raw(run["id"])
    calls_after_first = executor.cancel_calls
    assert calls_after_first > 0

    harness.cancel_raw(run["id"])
    harness.cancel_raw(run["id"])

    assert executor.cancel_calls == calls_after_first


def test_cancellation_of_a_terminal_run_is_a_no_op(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    run, started = harness.start_workflow("bug-fix", changed_areas=[])
    assert started["status"] == "COMPLETED"

    events_before = harness.events(run["id"])
    response = harness.cancel_raw(run["id"])

    assert response.status_code == 200
    assert response.json()["status"] == "COMPLETED"
    assert harness.events(run["id"]) == events_before


def test_cancellation_result_survives_restart(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "cancellation.sqlite"
    harness, run = _running_run(
        harness_factory, ReferenceScenario.CANCEL_CONFIRMED, database_path=database_path
    )

    cancelled = harness.cancel_raw(run["id"]).json()
    assert cancelled["status"] == "CANCELLED"

    reopened = harness_factory(database_path=database_path)

    assert reopened.run_by_id(run["id"])["status"] == "CANCELLED"
    assert {agent_run["status"] for agent_run in reopened.agent_runs(run["id"])} == {"CANCELLED"}


def test_unproven_cancellation_survives_restart_as_blocked(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "cancellation-unknown.sqlite"
    harness, run = _running_run(
        harness_factory, ReferenceScenario.CANCEL_UNKNOWN, database_path=database_path
    )

    blocked = harness.cancel_raw(run["id"]).json()
    assert blocked["status"] == "BLOCKED"
    assert {agent_run["status"] for agent_run in harness.agent_runs(run["id"])} == {"RUNNING"}

    reopened = harness_factory(database_path=database_path)

    assert reopened.run_by_id(run["id"])["status"] == "BLOCKED"
    assert reopened.run_by_id(run["id"])["failure_code"] == "CANCELLATION_UNKNOWN"

    # The last-known execution truth survives restart alongside the Run block.
    assert {agent_run["status"] for agent_run in reopened.agent_runs(run["id"])} == {"RUNNING"}
    assert {agent_run["reason_code"] for agent_run in reopened.agent_runs(run["id"])} == {
        "CANCELLATION_UNKNOWN"
    }

    # A repeated request after restart still must not claim CANCELLED.
    assert reopened.cancel_raw(run["id"]).json()["status"] == "BLOCKED"


@pytest.mark.parametrize(
    ("scenario", "expected"),
    [
        (ReferenceScenario.CANCEL_CONFIRMED, "CANCELLED"),
        (ReferenceScenario.CANCEL_UNKNOWN, "BLOCKED"),
        (ReferenceScenario.CANCEL_REQUESTED, None),
    ],
)
def test_cancellation_scenario_matrix(
    harness_factory: HarnessFactory,
    scenario: ReferenceScenario,
    expected: str | None,
) -> None:
    harness, run = _running_run(harness_factory, scenario)

    status = harness.cancel_raw(run["id"]).json()["status"]

    if expected is None:
        assert status != "CANCELLED"
    else:
        assert status == expected
