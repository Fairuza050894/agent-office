"""Phase 3B: the Run completion gate.

Completion is decided by one central authority. A completed AgentRun, a finished
stage, or an executor self-report never bypasses it.
"""

from __future__ import annotations

import pytest
from conftest import HarnessFactory, ScriptedExecutor, registry_for

from agent_office.domain import ExecutionStatus, ExecutorCapability
from agent_office.infrastructure.executors import ReferenceScenario


def test_a_fully_satisfied_run_reports_no_gate_failures(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] == "COMPLETED"

    gates = harness.completion_gates(run["id"])
    assert gates == {"status": "COMPLETED", "complete": True, "failures": []}


def test_completed_agent_runs_alone_do_not_complete_a_run(
    harness_factory: HarnessFactory,
) -> None:
    """An executor that reports success for every assignment cannot skip gates."""

    harness = harness_factory(ReferenceScenario.WAITING)
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] != "COMPLETED"

    gates = harness.completion_gates(run["id"])
    assert gates["complete"] is False
    assert gates["failures"]


def test_unresolved_assignment_blocks_completion(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.START_UNKNOWN)
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] != "COMPLETED"

    gates = harness.completion_gates(run["id"])
    assert gates["complete"] is False
    assert "UNKNOWN_EXECUTION_STATE" in gates["failures"]


def test_blocked_required_stage_blocks_completion(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.REVIEW_BLOCKER)
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] == "BLOCKED"

    gates = harness.completion_gates(run["id"])
    assert gates["complete"] is False
    assert "VERIFICATION_FAILED" in gates["failures"]


def test_unresolved_cancellation_blocks_completion(
    harness_factory: HarnessFactory,
) -> None:
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

    gates = harness.completion_gates(run["id"])
    assert gates["complete"] is False
    assert "CANCELLATION_UNKNOWN" in gates["failures"]


def test_failed_required_stage_blocks_completion(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.VERIFICATION_FAILURE)
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    gates = harness.completion_gates(run["id"])

    assert started["status"] == "FAILED"
    assert gates["complete"] is False
    assert {"REQUIRED_STAGE_FAILED", "VERIFICATION_FAILED"} & set(gates["failures"])


def test_unresolved_remediation_blocks_completion(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.REVIEW_BLOCKER)
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] == "BLOCKED"

    gates = harness.completion_gates(run["id"])
    assert gates["complete"] is False
    assert "REMEDIATION_FAILED" in gates["failures"]


def test_missing_verification_blocks_completion(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.VERIFICATION_FAILURE)
    run, _ = harness.start_workflow("bug-fix", changed_areas=[])

    gates = harness.completion_gates(run["id"])
    assert "VERIFICATION_FAILED" in gates["failures"]


@pytest.mark.parametrize(
    "scenario",
    [
        ReferenceScenario.START_FAILURE,
        ReferenceScenario.START_UNKNOWN,
        ReferenceScenario.RUN_FAILURE,
        ReferenceScenario.WAITING,
        ReferenceScenario.UNKNOWN_RESULT,
        ReferenceScenario.VERIFICATION_FAILURE,
        ReferenceScenario.REVIEW_BLOCKER,
        ReferenceScenario.REMEDIATION_FAILURE,
    ],
)
def test_only_truthfully_complete_runs_pass_every_gate(
    harness_factory: HarnessFactory,
    scenario: ReferenceScenario,
) -> None:
    harness = harness_factory(scenario)
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] != "COMPLETED"

    gates = harness.completion_gates(run["id"])
    assert gates["complete"] is False
    assert gates["failures"]


def test_completion_gate_endpoint_rejects_unknown_run(
    harness_factory: HarnessFactory,
) -> None:
    from uuid import uuid4

    harness = harness_factory()

    response = harness.client.get(f"/api/runs/{uuid4()}/completion-gates")
    assert response.status_code == 404


def test_completion_requires_every_required_stage_obligation(
    harness_factory: HarnessFactory,
) -> None:
    """A skipped-but-required stage is acceptable; an unfinished one is not."""

    harness = harness_factory()
    run, started = harness.start_workflow("bug-fix", changed_areas=["BACKEND"])

    assert started["status"] == "COMPLETED"

    stages = {stage["stage_key"]: stage for stage in harness.stages(run["id"])}

    assert stages["DOCUMENTATION"]["status"] == "SKIPPED"
    assert stages["DOCUMENTATION"]["reason_code"] == "CONDITION_FALSE"
    assert stages["REMEDIATION"]["status"] == "SKIPPED"
    assert stages["REMEDIATION"]["reason_code"] == "NOT_APPLICABLE"

    assert harness.completion_gates(run["id"])["failures"] == []
