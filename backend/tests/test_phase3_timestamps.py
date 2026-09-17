"""Phase 3A hardening: truthful stage and AgentRun timestamps.

``started_at`` must mean the stage or assignment actually began executing. A
stage that never ran, or that was skipped by condition, must not claim a start
time, and a terminal decision always records ``completed_at``.
"""

from __future__ import annotations

from typing import Any

from conftest import Harness, HarnessFactory

from agent_office.domain import ChangeArea
from agent_office.infrastructure.executors import ReferenceScenario


def _stage(harness: Harness, run_id: str, stage_key: str) -> dict[str, Any]:
    for stage in harness.stages(run_id):
        if stage["stage_key"] == stage_key:
            return stage

    raise AssertionError(f"stage {stage_key} is missing")


def _started_run(
    harness: Harness,
    *,
    requested_workflow_id: str | None = None,
    changed_areas: list[ChangeArea] | None = None,
) -> tuple[dict[str, Any], str]:
    project = harness.register_project()
    task = harness.create_task(project["id"], requested_workflow_id=requested_workflow_id)
    run = harness.create_run(task["id"])

    return harness.start_run(run["id"], changed_areas=changed_areas), run["id"]


def test_executed_stage_records_a_real_start_time(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    started, run_id = _started_run(harness)

    discovery = _stage(harness, run_id, "DISCOVERY")

    assert discovery["status"] == "COMPLETED"
    assert discovery["started_at"] is not None
    assert discovery["completed_at"] is not None
    assert discovery["started_at"] <= discovery["completed_at"]
    assert started["status"] == "COMPLETED"


def test_skipped_stage_has_no_start_time_but_has_a_terminal_time(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    workflow = harness.workflow_by_key("bug-fix")
    started, run_id = _started_run(
        harness,
        requested_workflow_id=workflow["id"],
        changed_areas=[ChangeArea.BACKEND],
    )

    documentation = _stage(harness, run_id, "DOCUMENTATION")

    assert documentation["status"] == "SKIPPED"
    assert documentation["started_at"] is None
    assert documentation["completed_at"] is not None
    assert documentation["reason_code"] == "CONDITION_FALSE"

    assert started["status"] == "COMPLETED"


def test_blocked_stage_has_no_start_time(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    workflow = harness.workflow_by_key("bug-fix")
    _, run_id = _started_run(harness, requested_workflow_id=workflow["id"])

    documentation = _stage(harness, run_id, "DOCUMENTATION")

    assert documentation["status"] == "BLOCKED"
    assert documentation["started_at"] is None
    assert documentation["reason_code"] == "CONDITION_UNKNOWN"


def test_stage_never_reached_has_no_timestamps(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.START_FAILURE)
    _, run_id = _started_run(harness)

    review = _stage(harness, run_id, "REVIEW")

    assert review["status"] == "PENDING"
    assert review["started_at"] is None
    assert review["completed_at"] is None


def test_agent_run_that_never_started_has_no_start_time(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.START_FAILURE)
    started, run_id = _started_run(harness)

    assert started["status"] == "FAILED"

    for agent_run in harness.agent_runs(run_id):
        assert agent_run["status"] == "FAILED"
        assert agent_run["started_at"] is None
        assert agent_run["completed_at"] is not None


def test_agent_run_that_started_records_start_then_completion(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    started, run_id = _started_run(harness)

    assert started["status"] == "COMPLETED"

    for agent_run in harness.agent_runs(run_id):
        assert agent_run["status"] == "COMPLETED"
        assert agent_run["started_at"] is not None
        assert agent_run["completed_at"] is not None
        assert agent_run["started_at"] <= agent_run["completed_at"]


def test_waiting_agent_run_recorded_a_start_time(
    harness_factory: HarnessFactory,
) -> None:
    """A waiting assignment did start: the executor acknowledged it."""

    harness = harness_factory(ReferenceScenario.WAITING)
    started, run_id = _started_run(harness)

    assert started["status"] not in {"COMPLETED", "FAILED", "CANCELLED"}

    for agent_run in harness.agent_runs(run_id):
        assert agent_run["status"] == "WAITING"
        assert agent_run["started_at"] is not None
        assert agent_run["completed_at"] is None


def test_unknown_start_outcome_has_no_start_time(
    harness_factory: HarnessFactory,
) -> None:
    """An unknown start outcome cannot prove the assignment started."""

    harness = harness_factory(ReferenceScenario.START_UNKNOWN)
    _, run_id = _started_run(harness)

    for agent_run in harness.agent_runs(run_id):
        assert agent_run["status"] == "BLOCKED"
        assert agent_run["started_at"] is None
        assert agent_run["completed_at"] is None


def test_run_lifecycle_timestamps_are_ordered(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    started, _ = _started_run(harness)

    assert started["started_at"] is not None
    assert started["completed_at"] is not None
    assert started["created_at"] <= started["started_at"] <= started["completed_at"]


def test_run_that_never_started_has_no_start_time(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])

    assert run["started_at"] is None
    assert run["completed_at"] is None
