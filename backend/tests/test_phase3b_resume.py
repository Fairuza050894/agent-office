"""Phase 3B: safe explicit resume of a BLOCKED Run.

Resume re-validates the blocking condition before any work continues. It never
silently substitutes an Executor, never resets historical AgentRuns, and never
changes the frozen WorkflowSnapshot.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from conftest import Harness, HarnessFactory, ScriptedExecutor, registry_for

from agent_office.domain import CancellationOutcome, ExecutionStatus
from agent_office.infrastructure.executors import REFERENCE_EXECUTOR_ID


def _blocked_on_executor(harness: Harness) -> tuple[dict, dict]:
    """Create a Run whose requested Executor is not registered."""

    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"], requested_executor_id=str(uuid4()))

    blocked = harness.start_raw(run["id"]).json()
    assert blocked["status"] == "BLOCKED"

    return run, blocked


def test_resume_with_an_unregistered_executor_stays_blocked(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    run, blocked = _blocked_on_executor(harness)

    response = harness.resume_raw(run["id"], executor_id=str(uuid4()))

    assert response.status_code == 409
    assert harness.run_by_id(run["id"]) == blocked
    assert harness.agent_runs(run["id"]) == []


def test_resume_without_a_usable_executor_stays_blocked(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    run, blocked = _blocked_on_executor(harness)

    response = harness.resume_raw(run["id"])

    assert response.status_code == 409
    assert harness.run_by_id(run["id"]) == blocked


def test_resume_with_a_registered_executor_plans_and_continues(
    harness_factory: HarnessFactory,
) -> None:
    """Scenario 3: choosing an available Executor lets the Run continue."""

    harness = harness_factory()
    run, blocked = _blocked_on_executor(harness)

    assert blocked["resolved_executor_id"] is None
    assert harness.stages(run["id"]) == []

    response = harness.resume_raw(
        run["id"],
        executor_id=str(REFERENCE_EXECUTOR_ID),
        changed_areas=[],
    )

    assert response.status_code == 200, response.text
    resumed = response.json()

    assert resumed["status"] == "COMPLETED"
    assert resumed["resolved_executor_id"] == str(REFERENCE_EXECUTOR_ID)
    assert resumed["workflow_snapshot_id"] is not None

    # The Run was planned on resume and then executed normally.
    assert len(harness.agent_runs(run["id"])) == 8

    event_types = [event["event_type"] for event in harness.events(run["id"])]
    assert "run.resumed" in event_types
    assert "run.blocked" in event_types
    assert "run.completed" in event_types


def test_resume_does_not_reset_existing_agent_runs(
    harness_factory: HarnessFactory,
) -> None:
    """Resume continues existing work rather than starting from zero."""

    executor = ScriptedExecutor(
        executor_id=str(REFERENCE_EXECUTOR_ID),
        session_status=ExecutionStatus.RUNNING,
        cancel_outcome=CancellationOutcome.UNKNOWN,
    )
    harness = harness_factory(registry=registry_for(executor))

    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_raw(run["id"])

    # Block the Run through cancellation that cannot be proven.
    blocked = harness.cancel_raw(run["id"]).json()
    assert blocked["status"] == "BLOCKED"

    agent_runs_before = harness.agent_runs(run["id"])
    stages_before = harness.stages(run["id"])
    assert agent_runs_before

    # Cancellation-unknown is not a resumable block: it refuses safely.
    refused = harness.resume_raw(run["id"])
    assert refused.status_code == 409

    assert harness.agent_runs(run["id"]) == agent_runs_before
    assert harness.stages(run["id"]) == stages_before


def test_resume_of_a_non_blocked_run_is_rejected(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    run, started = harness.start_workflow("bug-fix", changed_areas=[])
    assert started["status"] == "COMPLETED"

    agent_runs_before = harness.agent_runs(run["id"])

    response = harness.resume_raw(run["id"])

    assert response.status_code == 409
    assert harness.run_by_id(run["id"]) == started
    assert harness.agent_runs(run["id"]) == agent_runs_before


def test_resume_is_rejected_for_a_condition_unknown_block(
    harness_factory: HarnessFactory,
) -> None:
    """An unevaluable condition cannot be cleared by resume."""

    harness = harness_factory()
    run, started = harness.start_workflow("bug-fix")
    assert started["status"] == "BLOCKED"
    assert started["failure_code"] == "CONDITION_UNKNOWN"

    agent_runs_before = harness.agent_runs(run["id"])

    response = harness.resume_raw(run["id"])

    assert response.status_code == 409
    assert harness.run_by_id(run["id"])["status"] == "BLOCKED"
    assert harness.agent_runs(run["id"]) == agent_runs_before


def test_repeated_resume_is_idempotent(
    harness_factory: HarnessFactory,
) -> None:
    """A second resume of an already-resumed Run changes nothing."""

    harness = harness_factory()
    run, _ = _blocked_on_executor(harness)

    first = harness.resume_raw(run["id"], executor_id=str(REFERENCE_EXECUTOR_ID))
    assert first.status_code == 200

    agent_runs_after_first = harness.agent_runs(run["id"])
    stages_after_first = harness.stages(run["id"])
    events_after_first = harness.events(run["id"])

    second = harness.resume_raw(run["id"], executor_id=str(REFERENCE_EXECUTOR_ID))

    assert second.status_code == 409
    assert harness.agent_runs(run["id"]) == agent_runs_after_first
    assert harness.stages(run["id"]) == stages_after_first
    assert harness.events(run["id"]) == events_after_first


def test_resume_does_not_change_the_workflow_snapshot(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    run, _ = _blocked_on_executor(harness)

    harness.resume_raw(run["id"], executor_id=str(REFERENCE_EXECUTOR_ID))
    snapshot_after_resume = harness.client.get(f"/api/runs/{run['id']}/snapshot").json()

    second_resume = harness.resume_raw(run["id"])

    assert second_resume.status_code == 409
    assert harness.client.get(f"/api/runs/{run['id']}/snapshot").json() == snapshot_after_resume


def test_resume_rejects_a_malformed_executor_id(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    run, _ = _blocked_on_executor(harness)

    response = harness.resume_raw(run["id"], executor_id="not-a-uuid")

    assert response.status_code == 422


def test_resume_of_an_unknown_run_is_not_found(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()

    response = harness.resume_raw(str(uuid4()))

    assert response.status_code == 404


@pytest.mark.parametrize("stage_key", ["DISCOVERY", "VERIFICATION"])
def test_resume_never_reopens_a_terminal_stage(
    harness_factory: HarnessFactory,
    stage_key: str,
) -> None:
    harness = harness_factory()
    run, _ = _blocked_on_executor(harness)

    harness.resume_raw(run["id"], executor_id=str(REFERENCE_EXECUTOR_ID))

    stages = {stage["stage_key"]: stage for stage in harness.stages(run["id"])}
    assert stages[stage_key]["status"] == "COMPLETED"

    before = harness.stages(run["id"])
    harness.resume_raw(run["id"])
    assert harness.stages(run["id"]) == before
