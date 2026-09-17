"""Phase 3A acceptance: ReferenceExecutor scenarios through real orchestration.

Each scenario is driven through the HTTP API against a temporary Git
repository. The expected Run and AgentRun outcomes are asserted exactly, so
UNKNOWN is never silently promoted and cancellation never over-claims.
"""

from __future__ import annotations

from typing import Any

import pytest
from conftest import Harness, HarnessFactory

from agent_office.infrastructure.executors import ReferenceScenario


def _drive(
    harness_factory: HarnessFactory,
    scenario: ReferenceScenario,
) -> tuple[Harness, dict[str, Any]]:
    harness = harness_factory(scenario)
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])

    started = harness.start_run(run["id"])

    return harness, started


def test_success_completes_run_and_every_assignment(
    harness_factory: HarnessFactory,
) -> None:
    harness, started = _drive(harness_factory, ReferenceScenario.SUCCESS)

    assert started["status"] == "COMPLETED"
    assert started["failure_code"] is None
    assert started["completed_at"] is not None
    assert {agent["status"] for agent in harness.agent_runs(started["id"])} == {"COMPLETED"}


def test_start_failure_fails_run_without_a_session(
    harness_factory: HarnessFactory,
) -> None:
    harness, started = _drive(harness_factory, ReferenceScenario.START_FAILURE)

    assert started["status"] == "FAILED"
    assert started["failure_code"] == "REQUIRED_STAGE_FAILED"
    assert harness.stage_status(started["id"], "DISCOVERY") == "FAILED"

    agents = harness.agent_runs(started["id"])
    assert {agent["status"] for agent in agents} == {"FAILED"}
    assert {agent["reason_code"] for agent in agents} == {"EXECUTOR_START_FAILED"}

    failed_event = next(
        event for event in harness.events(started["id"]) if event["event_type"] == "agent.failed"
    )
    assert failed_event["payload"]["retryable"] is False


def test_start_unknown_blocks_run_and_is_never_retried(
    harness_factory: HarnessFactory,
) -> None:
    harness, started = _drive(harness_factory, ReferenceScenario.START_UNKNOWN)

    assert started["status"] == "BLOCKED"
    assert started["status"] != "COMPLETED"
    assert harness.stage_status(started["id"], "DISCOVERY") == "BLOCKED"

    agents = harness.agent_runs(started["id"])
    assert {agent["status"] for agent in agents} == {"BLOCKED"}
    assert {agent["reason_code"] for agent in agents} == {"EXECUTOR_START_UNKNOWN"}

    events = harness.events(started["id"])
    start_requests = [event for event in events if event["event_type"] == "agent.start.requested"]

    # Exactly one start attempt per assignment: an unknown outcome is never
    # retried automatically.
    assert len(start_requests) == len(agents)
    assert not [event for event in events if event["event_type"] == "agent.completed"]


def test_run_failure_is_distinct_from_start_failure(
    harness_factory: HarnessFactory,
) -> None:
    harness, started = _drive(harness_factory, ReferenceScenario.RUN_FAILURE)

    assert started["status"] == "FAILED"

    agents = harness.agent_runs(started["id"])
    assert {agent["reason_code"] for agent in agents} == {"EXECUTION_FAILED"}

    # A session existed: the assignment started before it failed.
    assert any(event["event_type"] == "agent.started" for event in harness.events(started["id"]))


def test_waiting_leaves_run_non_terminal_and_records_a_reason(
    harness_factory: HarnessFactory,
) -> None:
    harness, started = _drive(harness_factory, ReferenceScenario.WAITING)

    assert started["status"] not in {"COMPLETED", "FAILED", "CANCELLED"}
    assert harness.stage_status(started["id"], "DISCOVERY") == "WAITING"

    agents = harness.agent_runs(started["id"])
    assert {agent["status"] for agent in agents} == {"WAITING"}
    assert {agent["reason_code"] for agent in agents} == {"EXECUTOR_WAITING"}

    waiting_event = next(
        event for event in harness.events(started["id"]) if event["event_type"] == "agent.waiting"
    )
    assert waiting_event["payload"]["reason_code"] == "EXECUTOR_WAITING"
    assert waiting_event["payload"]["summary"]


def test_unknown_result_blocks_run_and_never_claims_success(
    harness_factory: HarnessFactory,
) -> None:
    harness, started = _drive(harness_factory, ReferenceScenario.UNKNOWN_RESULT)

    assert started["status"] == "BLOCKED"
    assert started["status"] != "COMPLETED"
    assert started["failure_code"] == "UNKNOWN_EXECUTION_STATE"

    agents = harness.agent_runs(started["id"])
    assert {agent["status"] for agent in agents} == {"BLOCKED"}
    assert {agent["reason_code"] for agent in agents} == {"EXECUTION_RESULT_UNKNOWN"}

    events = harness.events(started["id"])
    assert not [event for event in events if event["event_type"] == "agent.completed"]
    assert not [event for event in events if event["event_type"] == "run.completed"]


def test_cancel_confirmed_scenario_reaches_a_cancel_state(
    harness_factory: HarnessFactory,
) -> None:
    harness, started = _drive(harness_factory, ReferenceScenario.CANCEL_CONFIRMED)

    # The assignment itself is still active, so the Run is not terminal yet.
    assert started["status"] not in {"COMPLETED", "FAILED", "CANCELLED"}

    cancelled = harness.client.post(f"/api/runs/{started['id']}/cancel").json()

    assert cancelled["status"] == "CANCELLED"
    assert {agent["status"] for agent in harness.agent_runs(started["id"])} == {"CANCELLED"}


def test_cancel_requested_scenario_does_not_claim_cancelled(
    harness_factory: HarnessFactory,
) -> None:
    harness, started = _drive(harness_factory, ReferenceScenario.CANCEL_REQUESTED)

    cancelled = harness.client.post(f"/api/runs/{started['id']}/cancel").json()

    # A cancellation request is not proof of cancellation.
    assert cancelled["status"] != "CANCELLED"
    assert cancelled["cancel_requested_at"] is not None

    agents = harness.agent_runs(started["id"])
    assert {agent["status"] for agent in agents} == {"WAITING"}
    assert {agent["reason_code"] for agent in agents} == {"CANCELLATION_REQUESTED_UNCONFIRMED"}


def test_cancel_unknown_scenario_blocks_instead_of_claiming_cancelled(
    harness_factory: HarnessFactory,
) -> None:
    harness, started = _drive(harness_factory, ReferenceScenario.CANCEL_UNKNOWN)

    cancelled = harness.client.post(f"/api/runs/{started['id']}/cancel").json()

    assert cancelled["status"] == "BLOCKED"
    assert cancelled["status"] != "CANCELLED"
    assert cancelled["failure_code"] == "CANCELLATION_UNKNOWN"

    # An unknowable cancellation outcome is not proof that the external
    # execution stopped, so the AgentRun keeps its last authoritative status and
    # is resolved by reconciliation rather than by a blocking claim.
    agents = harness.agent_runs(started["id"])
    assert {agent["status"] for agent in agents} == {"RUNNING"}
    assert {agent["reason_code"] for agent in agents} == {"CANCELLATION_UNKNOWN"}

    event_types = [event["event_type"] for event in harness.events(started["id"])]
    assert "agent.blocked" not in event_types
    assert "agent.cancelled" not in event_types


@pytest.mark.parametrize(
    ("scenario", "expected_run_status"),
    [
        (ReferenceScenario.SUCCESS, "COMPLETED"),
        (ReferenceScenario.START_FAILURE, "FAILED"),
        (ReferenceScenario.START_UNKNOWN, "BLOCKED"),
        (ReferenceScenario.RUN_FAILURE, "FAILED"),
        (ReferenceScenario.UNKNOWN_RESULT, "BLOCKED"),
    ],
)
def test_scenario_matrix_is_deterministic(
    harness_factory: HarnessFactory,
    scenario: ReferenceScenario,
    expected_run_status: str,
) -> None:
    _, started = _drive(harness_factory, scenario)

    assert started["status"] == expected_run_status


def test_capability_snapshot_is_recorded_without_being_exposed(
    harness_factory: HarnessFactory,
) -> None:
    harness, started = _drive(harness_factory, ReferenceScenario.SUCCESS)

    agent_run = harness.agent_runs(started["id"])[0]

    # The DTO must not leak executor internals such as the capability snapshot
    # or the opaque provider session reference.
    assert "capability_snapshot" not in agent_run
    assert "executor_session_ref" not in agent_run
