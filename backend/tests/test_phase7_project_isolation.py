"""Phase 7 cross-Project isolation and explicit executor-switch acceptance."""

from __future__ import annotations

import sqlite3
from typing import Any
from uuid import uuid4

import pytest
from conftest import Harness, HarnessFactory, registry_for

from agent_office.application.workspaces import WorkspaceOwnershipError
from agent_office.domain import AgentRunId, RunId, utc_now
from agent_office.infrastructure.executors.reference import (
    REFERENCE_EXECUTOR_ID,
    ReferenceExecutor,
)


def _started_run(harness: Harness, name: str) -> tuple[dict[str, Any], dict[str, Any]]:
    project = harness.register_project(name)
    task = harness.create_task(str(project["id"]))
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])
    return project, run


def test_workspace_allocation_rejects_agent_run_from_another_project(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    _, run_a = _started_run(harness, "Phase 7 A")
    _, run_b = _started_run(harness, "Phase 7 B")

    run = harness.app.state.run_service.get_run(RunId.parse(run_a["id"]))
    foreign_agent_json = harness.agent_runs(run_b["id"])[0]
    foreign_agent = harness.app.state.agent_run_service.get(
        AgentRunId.parse(foreign_agent_json["id"])
    )

    with pytest.raises(WorkspaceOwnershipError, match="ownership scope|scope does not match"):
        harness.app.state.workspace_service.allocate_for_agent_run(run, foreign_agent)


def test_database_rejects_cross_project_workspace_event_and_candidate_links(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project_a, run_a = _started_run(harness, "Phase 7 DB A")
    project_b, run_b = _started_run(harness, "Phase 7 DB B")
    foreign_agent = harness.agent_runs(run_b["id"])[0]
    now = utc_now().isoformat()
    database = harness.app.state.project_database

    with pytest.raises(sqlite3.IntegrityError, match="workspace ownership scope mismatch"):
        with database.transaction() as connection:
            connection.execute(
                """
                INSERT INTO workspaces (
                    id, project_id, run_id, owner_agent_run_id, kind, access_mode,
                    status, path_ref, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid4()),
                    project_b["id"],
                    run_a["id"],
                    None,
                    "GIT_WORKTREE",
                    "WRITE",
                    "ALLOCATING",
                    "phase7/foreign-workspace",
                    now,
                    now,
                ),
            )

    with pytest.raises(sqlite3.IntegrityError, match="event AgentRun ownership scope mismatch"):
        with database.transaction() as connection:
            connection.execute(
                """
                INSERT INTO events (
                    id, schema_version, event_type, project_id, run_id, agent_run_id,
                    source, occurred_at, recorded_at, payload_json,
                    redacted_keys_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid4()),
                    1,
                    "agent.activity",
                    project_a["id"],
                    run_a["id"],
                    foreign_agent["id"],
                    "EXECUTOR",
                    now,
                    now,
                    "{}",
                    "[]",
                    now,
                ),
            )

    foreign_workspace_id = str(uuid4())
    with database.transaction() as connection:
        connection.execute(
            """
            INSERT INTO workspaces (
                id, project_id, run_id, owner_agent_run_id, kind, access_mode,
                status, path_ref, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                foreign_workspace_id,
                project_b["id"],
                run_b["id"],
                None,
                "GIT_WORKTREE",
                "WRITE",
                "ALLOCATING",
                "phase7/project-b-workspace",
                now,
                now,
            ),
        )

    with pytest.raises(
        sqlite3.IntegrityError,
        match="candidate Workspace ownership scope mismatch",
    ):
        with database.transaction() as connection:
            connection.execute(
                "UPDATE runs SET candidate_workspace_id = ? WHERE id = ?",
                (foreign_workspace_id, run_a["id"]),
            )


def test_unavailable_executor_does_not_silently_fallback_and_explicit_switch_succeeds(
    harness_factory: HarnessFactory,
) -> None:
    reference = ReferenceExecutor()
    harness = harness_factory(registry=registry_for(reference))
    project = harness.register_project("Phase 7 Executor Switch")
    task = harness.create_task(project["id"])
    unavailable_executor_id = "10000000-0000-4000-8000-000000000099"
    run = harness.create_run(
        task["id"],
        requested_executor_id=unavailable_executor_id,
    )

    blocked = harness.start_run(run["id"])

    assert blocked["status"] == "BLOCKED"
    assert blocked["failure_code"] == "EXECUTOR_UNAVAILABLE"
    assert blocked["requested_executor_id"] == unavailable_executor_id
    assert blocked["resolved_executor_id"] is None
    assert reference.start_calls == 0

    response = harness.resume_raw(
        run["id"],
        executor_id=str(REFERENCE_EXECUTOR_ID),
    )
    assert response.status_code == 200, response.text
    resumed = response.json()

    assert resumed["status"] == "COMPLETED"
    assert resumed["requested_executor_id"] == unavailable_executor_id
    assert resumed["resolved_executor_id"] == str(REFERENCE_EXECUTOR_ID)
    assert reference.start_calls > 0

    agents = harness.agent_runs(run["id"])
    assert agents
    assert {agent["executor_id"] for agent in agents} == {str(REFERENCE_EXECUTOR_ID)}

    operator_actions = {record["action"] for record in harness.operator_audit(run["id"])}
    assert "RUN_EXECUTOR_SELECTED" in operator_actions
    assert "RUN_RESUME_REQUESTED" in operator_actions
