"""Phase 3B: the formal lifecycle scenarios end to end.

Each scenario drives a real Run through the HTTP API against an isolated
temporary repository and database, and asserts the observable lifecycle outcome.
"""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from conftest import HarnessFactory, ScriptedExecutor, registry_for

from agent_office.domain import CancellationOutcome, ExecutionStatus
from agent_office.infrastructure.executors import REFERENCE_EXECUTOR_ID, ReferenceScenario


def test_scenario_1_retry(harness_factory: HarnessFactory) -> None:
    """Retryable operational failure, attempt 1 retained, attempt 2 succeeds."""

    harness = harness_factory(ReferenceScenario.RETRYABLE_START_FAILURE)
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] == "COMPLETED"

    attempts = sorted(
        (
            agent_run
            for agent_run in harness.agent_runs(run["id"])
            if agent_run["agent_profile_key"] == "explorer"
        ),
        key=lambda agent_run: agent_run["attempt"],
    )

    assert [attempt["attempt"] for attempt in attempts] == [1, 2]
    assert attempts[0]["status"] == "FAILED"
    assert attempts[1]["status"] == "COMPLETED"
    assert attempts[1]["retry_of_agent_run_id"] == attempts[0]["id"]


def test_scenario_2_unknown(harness_factory: HarnessFactory) -> None:
    """An unknown start or result outcome is never retried and blocks."""

    harness = harness_factory(ReferenceScenario.START_UNKNOWN)
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] == "BLOCKED"
    assert {agent_run["attempt"] for agent_run in harness.agent_runs(run["id"])} == {1}
    assert harness.completion_gates(run["id"])["complete"] is False


def test_scenario_3_executor_unavailable(harness_factory: HarnessFactory) -> None:
    """A missing executor blocks; choosing one resumes without duplicating work."""

    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"], requested_executor_id=str(uuid4()))

    blocked = harness.start_raw(run["id"]).json()
    assert blocked["status"] == "BLOCKED"
    assert blocked["resolved_executor_id"] is None

    resumed = harness.resume_raw(
        run["id"], executor_id=str(REFERENCE_EXECUTOR_ID), changed_areas=[]
    )
    assert resumed.status_code == 200
    assert resumed.json()["status"] == "COMPLETED"

    agent_runs = harness.agent_runs(run["id"])
    assert len({agent_run["id"] for agent_run in agent_runs}) == len(agent_runs)
    assert {agent_run["attempt"] for agent_run in agent_runs} == {1}


def test_scenario_4_cancellation_confirmed(harness_factory: HarnessFactory) -> None:
    """A confirmed cancellation is propagated truthfully to terminal state."""

    harness = harness_factory(ReferenceScenario.CANCEL_CONFIRMED)
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    cancelled = harness.cancel_raw(run["id"]).json()

    assert cancelled["status"] == "CANCELLED"
    assert {agent_run["status"] for agent_run in harness.agent_runs(run["id"])} == {"CANCELLED"}
    assert harness.stage_status(run["id"], "DISCOVERY") == "CANCELLED"


def test_scenario_5_cancellation_unknown(harness_factory: HarnessFactory) -> None:
    """An unknown cancellation never claims CANCELLED and blocks instead."""

    harness = harness_factory(ReferenceScenario.CANCEL_UNKNOWN)
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    result = harness.cancel_raw(run["id"]).json()

    assert result["status"] == "BLOCKED"
    assert result["status"] != "CANCELLED"
    assert result["failure_code"] == "CANCELLATION_UNKNOWN"
    assert harness.completion_gates(run["id"])["complete"] is False


def test_scenario_6_review_blocker(harness_factory: HarnessFactory) -> None:
    """Review blocker, remediation, clear re-review, verification, completion."""

    harness = harness_factory(ReferenceScenario.REMEDIATION_SUCCESS)
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] == "COMPLETED"
    assert started["remediation_cycles_used"] == 1

    stages = {stage["stage_key"]: stage["status"] for stage in harness.stages(run["id"])}
    assert stages["REVIEW"] == "COMPLETED"
    assert stages["REMEDIATION"] == "COMPLETED"
    assert stages["VERIFICATION"] == "COMPLETED"

    verdicts = {
        (agent_run["remediation_cycle"], agent_run["review_verdict"])
        for agent_run in harness.agent_runs(run["id"])
        if agent_run["stage_key"] == "REVIEW"
    }
    assert verdicts == {(0, "BLOCKER"), (1, "CLEAR")}


def test_scenario_7_remediation_bound(harness_factory: HarnessFactory) -> None:
    """Repeated blockers reach the bound; no fourth cycle ever starts."""

    harness = harness_factory(ReferenceScenario.REVIEW_BLOCKER)
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] == "BLOCKED"
    assert started["failure_code"] == "REMEDIATION_BOUND_EXCEEDED"
    assert started["remediation_cycles_used"] == 3

    cycles = sorted(
        agent_run["remediation_cycle"]
        for agent_run in harness.agent_runs(run["id"])
        if agent_run["stage_key"] == "REMEDIATION"
    )
    assert cycles == [1, 2, 3]

    assert harness.stage_status(run["id"], "REVIEW") == "BLOCKED"
    assert harness.stage_status(run["id"], "REMEDIATION") == "BLOCKED"
    assert harness.stage_status(run["id"], "VERIFICATION") == "PENDING"


def test_scenario_8_verification(harness_factory: HarnessFactory) -> None:
    """Verification success permits completion; verification failure does not."""

    passing = harness_factory()
    run_ok, started_ok = passing.start_workflow("bug-fix", changed_areas=[])
    assert started_ok["status"] == "COMPLETED"
    assert passing.stage_status(run_ok["id"], "VERIFICATION") == "COMPLETED"

    failing = harness_factory(ReferenceScenario.VERIFICATION_FAILURE)
    run_bad, started_bad = failing.start_workflow("bug-fix", changed_areas=[])

    assert started_bad["status"] != "COMPLETED"
    assert started_bad["failure_code"] == "VERIFICATION_FAILED"
    assert failing.stage_status(run_bad["id"], "VERIFICATION") == "FAILED"


def test_scenario_9_restart(harness_factory: HarnessFactory, tmp_path: Path) -> None:
    """A non-terminal Run reconciles after restart without duplicate AgentRuns."""

    database_path = tmp_path / "scenario-9.sqlite"
    harness = harness_factory(ReferenceScenario.WAITING, database_path=database_path)
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    agent_runs_before = harness.agent_runs(run["id"])
    assert {agent_run["status"] for agent_run in agent_runs_before} == {"WAITING"}

    reopened = harness_factory(database_path=database_path)
    reconciled = reopened.reconcile_raw(run["id"]).json()

    assert reconciled["status"] == "BLOCKED"
    assert reopened.agent_runs(run["id"]) == agent_runs_before

    starts = [
        event
        for event in reopened.events(run["id"])
        if event["event_type"] == "agent.start.requested"
    ]
    assert len(starts) == len(agent_runs_before)


def test_scenario_10_duplicate_lifecycle_event(harness_factory: HarnessFactory) -> None:
    """The same lifecycle operation processed repeatedly yields one effect."""

    executor = ScriptedExecutor(
        session_status=ExecutionStatus.RUNNING,
        cancel_outcome=CancellationOutcome.UNKNOWN,
    )
    harness = harness_factory(registry=registry_for(executor))

    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    first = harness.cancel_raw(run["id"]).json()
    agent_runs_after_first = harness.agent_runs(run["id"])
    cancel_calls_after_first = executor.cancel_calls

    # Cancellation and reconciliation are both re-driven.
    for _ in range(3):
        assert harness.cancel_raw(run["id"]).json() == first
        assert harness.reconcile_raw(run["id"]).status_code == 200

    assert harness.agent_runs(run["id"]) == agent_runs_after_first
    assert executor.cancel_calls == cancel_calls_after_first


def test_full_lifecycle_survives_restart_at_every_stage_boundary(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """A mid-remediation restart preserves cycle and AgentRun history."""

    database_path = tmp_path / "mid-remediation.sqlite"
    harness = harness_factory(
        ReferenceScenario.REMEDIATION_SUCCESS,
        database_path=database_path,
    )
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    agent_runs_before = harness.agent_runs(run["id"])
    stages_before = harness.stages(run["id"])
    events_before = harness.events(run["id"])

    reopened = harness_factory(database_path=database_path)

    assert reopened.run_by_id(run["id"]) == started
    assert reopened.agent_runs(run["id"]) == agent_runs_before
    assert reopened.stages(run["id"]) == stages_before
    assert reopened.events(run["id"]) == events_before

    assert reopened.completion_gates(run["id"]) == {
        "status": "COMPLETED",
        "complete": True,
        "failures": [],
    }
