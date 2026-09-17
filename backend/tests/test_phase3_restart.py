"""Phase 3A acceptance: restart persistence of orchestration state.

Everything the orchestrator produces must survive a real application restart
against the same SQLite database: definitions, snapshots, stages, AgentRuns,
Events, and the Run lifecycle itself.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from conftest import Harness, HarnessFactory

from agent_office.infrastructure.executors import ReferenceScenario


def _full_run(harness: Harness, name: str = "Restart Project") -> dict[str, Any]:
    project = harness.register_project(name)
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    started = harness.start_run(run["id"])

    return {"project": project, "task": task, "run": run, "started": started}


def test_orchestration_state_survives_a_real_restart(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "restart.sqlite"
    harness = harness_factory(database_path=database_path)
    created = _full_run(harness)

    run_id = created["run"]["id"]
    snapshot_before = harness.client.get(f"/api/runs/{run_id}/snapshot").json()
    stages_before = harness.stages(run_id)
    agents_before = harness.agent_runs(run_id)
    events_before = harness.events(run_id)
    run_before = harness.client.get(f"/api/runs/{run_id}").json()
    workflows_before = harness.client.get("/api/workflows").json()

    assert run_before["status"] == "COMPLETED"
    assert events_before

    # Stop this application instance and start a new one on the same database.
    reopened = harness_factory(database_path=database_path)

    run_after = reopened.client.get(f"/api/runs/{run_id}").json()
    assert run_after == run_before

    assert reopened.client.get(f"/api/runs/{run_id}/snapshot").json() == snapshot_before
    assert reopened.stages(run_id) == stages_before
    assert reopened.agent_runs(run_id) == agents_before
    assert reopened.events(run_id) == events_before

    workflows_after = reopened.client.get("/api/workflows").json()
    assert {workflow["id"] for workflow in workflows_before} <= {
        workflow["id"] for workflow in workflows_after
    }


def test_ownership_chain_survives_a_restart(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "restart-ownership.sqlite"
    harness = harness_factory(database_path=database_path)
    created = _full_run(harness)

    run_id = created["run"]["id"]
    project_id = created["project"]["id"]
    task_id = created["task"]["id"]

    reopened = harness_factory(database_path=database_path)

    run_after = reopened.client.get(f"/api/runs/{run_id}").json()
    assert run_after["project_id"] == project_id
    assert run_after["task_id"] == task_id

    snapshot_after = reopened.client.get(f"/api/runs/{run_id}/snapshot").json()
    assert snapshot_after["project_id"] == project_id
    assert snapshot_after["run_id"] == run_id

    task_after = reopened.client.get(f"/api/tasks/{task_id}").json()
    assert task_after["project_id"] == project_id

    for agent_run in reopened.agent_runs(run_id):
        assert agent_run["run_id"] == run_id
        assert agent_run["project_id"] == project_id

    for event in reopened.events(run_id):
        assert event["run_id"] == run_id
        assert event["project_id"] == project_id


def test_non_terminal_run_state_survives_a_restart_without_false_completion(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "restart-non-terminal.sqlite"
    harness = harness_factory(ReferenceScenario.UNKNOWN_RESULT, database_path=database_path)
    created = _full_run(harness)

    run_id = created["run"]["id"]
    assert created["started"]["status"] == "BLOCKED"

    reopened = harness_factory(database_path=database_path)

    run_after = reopened.client.get(f"/api/runs/{run_id}").json()

    # An unresolved execution state stays unresolved across restart: it is
    # never upgraded to COMPLETED and never silently retried.
    assert run_after["status"] == "BLOCKED"
    assert run_after["failure_code"] == "UNKNOWN_EXECUTION_STATE"

    agents = reopened.agent_runs(run_id)
    assert {agent["status"] for agent in agents} == {"BLOCKED"}

    start_requests = [
        event for event in reopened.events(run_id) if event["event_type"] == "agent.start.requested"
    ]
    assert len(start_requests) == len(agents)


def test_cancelled_run_state_survives_a_restart(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "restart-cancelled.sqlite"
    harness = harness_factory(ReferenceScenario.CANCEL_CONFIRMED, database_path=database_path)
    created = _full_run(harness)

    run_id = created["run"]["id"]
    cancelled = harness.client.post(f"/api/runs/{run_id}/cancel").json()
    assert cancelled["status"] == "CANCELLED"

    reopened = harness_factory(database_path=database_path)

    assert reopened.client.get(f"/api/runs/{run_id}").json()["status"] == "CANCELLED"
    assert {agent["status"] for agent in reopened.agent_runs(run_id)} == {"CANCELLED"}
    assert {stage["status"] for stage in reopened.stages(run_id)} <= {
        "CANCELLED",
        "COMPLETED",
    }


def test_schema_migration_is_idempotent_across_reopen(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "restart-schema.sqlite"
    harness = harness_factory(database_path=database_path)
    _full_run(harness)

    for _ in range(2):
        reopened = harness_factory(database_path=database_path)
        assert reopened.client.get("/health").json() == {"status": "ok"}

    database = harness.app.state.project_database
    assert database.current_schema_version() == database.LATEST_SCHEMA_VERSION
