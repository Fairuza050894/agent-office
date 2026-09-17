"""Phase 3B: restart reconciliation for non-terminal Runs.

Reconciliation records only what the Executor can prove. It never starts new
external work, never recreates an AgentRun, and blocks rather than resuming when
external state cannot be established.
"""

from __future__ import annotations

from pathlib import Path

from conftest import HarnessFactory, ScriptedExecutor, registry_for

from agent_office.domain import ExecutionStatus
from agent_office.infrastructure.executors import ReferenceScenario


def _waiting_run(harness_factory: HarnessFactory, *, database_path: Path | None = None):
    harness = harness_factory(ReferenceScenario.WAITING, database_path=database_path)
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    return harness, run


def test_restart_during_waiting_blocks_without_duplicating_work(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """Scenario 9: a restart that loses executor sessions blocks safely."""

    database_path = tmp_path / "reconcile.sqlite"
    harness, run = _waiting_run(harness_factory, database_path=database_path)

    agent_runs_before = harness.agent_runs(run["id"])
    stages_before = harness.stages(run["id"])
    assert {agent_run["status"] for agent_run in agent_runs_before} == {"WAITING"}

    # A fresh process has no in-memory reference sessions.
    reopened = harness_factory(database_path=database_path)

    assert reopened.agent_runs(run["id"]) == agent_runs_before
    assert reopened.stages(run["id"]) == stages_before

    response = reopened.reconcile_raw(run["id"])
    assert response.status_code == 200

    body = response.json()
    assert body["status"] == "BLOCKED"
    assert body["failure_code"] == "UNKNOWN_EXECUTION_STATE"

    # External state could not be proven, so nothing was recreated or rerun.
    assert reopened.agent_runs(run["id"]) == agent_runs_before

    start_requests = [
        event
        for event in reopened.events(run["id"])
        if event["event_type"] == "agent.start.requested"
    ]
    assert len(start_requests) == len(agent_runs_before)

    assert "executor.session.reconciled" in [
        event["event_type"] for event in reopened.events(run["id"])
    ]


def test_reconciliation_is_idempotent(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "reconcile-idempotent.sqlite"
    harness, run = _waiting_run(harness_factory, database_path=database_path)
    reopened = harness_factory(database_path=database_path)

    first = reopened.reconcile_raw(run["id"]).json()
    agent_runs_after_first = reopened.agent_runs(run["id"])
    stages_after_first = reopened.stages(run["id"])

    second = reopened.reconcile_raw(run["id"]).json()
    third = reopened.reconcile_raw(run["id"]).json()

    assert first == second == third
    assert reopened.agent_runs(run["id"]) == agent_runs_after_first
    assert reopened.stages(run["id"]) == stages_after_first


def test_reconciliation_leaves_terminal_runs_untouched(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    run, started = harness.start_workflow("bug-fix", changed_areas=[])
    assert started["status"] == "COMPLETED"

    agent_runs_before = harness.agent_runs(run["id"])
    events_before = harness.events(run["id"])

    response = harness.reconcile_raw(run["id"])

    assert response.status_code == 200
    assert response.json() == started
    assert harness.agent_runs(run["id"]) == agent_runs_before
    assert harness.events(run["id"]) == events_before


def test_reconciliation_preserves_completed_history(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "reconcile-history.sqlite"
    harness = harness_factory(database_path=database_path)
    run, started = harness.start_workflow("enterprise-engineering", changed_areas=[])

    agent_runs_before = harness.agent_runs(run["id"])
    events_before = harness.events(run["id"])

    reopened = harness_factory(database_path=database_path)
    reopened.reconcile_raw(run["id"])

    assert reopened.run_by_id(run["id"]) == started
    assert reopened.agent_runs(run["id"]) == agent_runs_before
    assert reopened.events(run["id"]) == events_before


def test_reconcile_of_an_unknown_run_is_not_found(
    harness_factory: HarnessFactory,
) -> None:
    from uuid import uuid4

    harness = harness_factory()

    assert harness.reconcile_raw(str(uuid4())).status_code == 404


def test_reconciliation_does_not_resume_an_agent_that_cannot_be_proven(
    harness_factory: HarnessFactory,
) -> None:
    """An AgentRun with no session and no proof is never restarted."""

    harness = harness_factory(ReferenceScenario.START_UNKNOWN)
    run, started = harness.start_workflow("bug-fix", changed_areas=[])
    assert started["status"] == "BLOCKED"

    agent_runs_before = harness.agent_runs(run["id"])

    response = harness.reconcile_raw(run["id"]).json()

    assert response["status"] == "BLOCKED"
    assert harness.agent_runs(run["id"]) == agent_runs_before
    assert {agent_run["attempt"] for agent_run in harness.agent_runs(run["id"])} == {1}


def test_in_process_reconciliation_of_a_live_waiting_session_is_provable(
    harness_factory: HarnessFactory,
) -> None:
    """While the executor can still report the session, reconciliation proves it."""

    executor = ScriptedExecutor(session_status=ExecutionStatus.WAITING)
    harness = harness_factory(registry=registry_for(executor))

    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    agent_runs_before = harness.agent_runs(run["id"])

    response = harness.reconcile_raw(run["id"]).json()

    # The executor reports the assignment is still waiting, which is a proven
    # non-terminal state, so the Run is not blocked by reconciliation.
    assert response["status"] not in {"COMPLETED", "FAILED", "CANCELLED"}
    assert harness.agent_runs(run["id"]) == agent_runs_before


def test_reconciliation_records_a_provably_completed_session(
    harness_factory: HarnessFactory,
) -> None:
    """A session the executor can prove finished is reconciled to completion."""

    executor = ScriptedExecutor(session_status=ExecutionStatus.RUNNING)
    harness = harness_factory(registry=registry_for(executor))

    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    running = [
        agent_run for agent_run in harness.agent_runs(run["id"]) if agent_run["status"] == "RUNNING"
    ]
    assert running

    # The executor now reports the work finished; reconciliation records it and
    # the workflow continues from the reconciled state.
    for session_id in executor.session_ids():
        executor.complete(session_id)

    executor.set_session_status(ExecutionStatus.COMPLETED)

    response = harness.reconcile_raw(run["id"]).json()

    assert response["status"] == "COMPLETED"
    assert {agent_run["status"] for agent_run in harness.agent_runs(run["id"])} == {"COMPLETED"}
    assert harness.stage_status(run["id"], "DISCOVERY") == "COMPLETED"

    # The reconciled workflow advanced rather than restarting from zero.
    assert len(harness.agent_runs(run["id"])) == 8
    assert {agent_run["attempt"] for agent_run in harness.agent_runs(run["id"])} == {1}
