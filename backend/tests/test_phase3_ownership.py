"""Phase 3A acceptance: ownership chains and cross-project safety.

Snapshot, stage, AgentRun, and Event must each belong to the correct
Run/Project chain, and a cross-project violation must be rejected rather than
silently stored.
"""

from __future__ import annotations

import asyncio
import sqlite3
from dataclasses import replace
from typing import Any
from uuid import uuid4

import pytest
from conftest import Harness, HarnessFactory

from agent_office.application.events import EventScopeError
from agent_office.domain import (
    EVENT_SCHEMA_VERSION,
    AgentRunId,
    Event,
    EventId,
    EventSource,
    EventType,
    ExecutorId,
    ProjectId,
    RunId,
    utc_now,
)


def _started_run(harness: Harness, name: str) -> tuple[dict[str, Any], dict[str, Any]]:
    project = harness.register_project(name)
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    return project, run


def test_snapshot_stage_and_agent_run_share_one_ownership_chain(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project, run = _started_run(harness, "Owner A")

    snapshot = harness.client.get(f"/api/runs/{run['id']}/snapshot").json()
    assert snapshot["run_id"] == run["id"]
    assert snapshot["project_id"] == project["id"]

    database = harness.app.state.project_database

    with database.connection() as connection:
        stage_rows = connection.execute(
            "SELECT run_id, project_id, stage_key FROM run_stages WHERE run_id = ?",
            (run["id"],),
        ).fetchall()

        agent_rows = connection.execute(
            "SELECT run_id, project_id, stage_key FROM agent_runs WHERE run_id = ?",
            (run["id"],),
        ).fetchall()

        snapshot_rows = connection.execute(
            "SELECT run_id, project_id FROM workflow_snapshots WHERE run_id = ?",
            (run["id"],),
        ).fetchall()

    assert stage_rows
    assert {row["run_id"] for row in stage_rows} == {run["id"]}
    assert {row["project_id"] for row in stage_rows} == {project["id"]}

    assert agent_rows
    assert {row["run_id"] for row in agent_rows} == {run["id"]}
    assert {row["project_id"] for row in agent_rows} == {project["id"]}

    stage_keys = {row["stage_key"] for row in stage_rows}
    assert {row["stage_key"] for row in agent_rows} <= stage_keys

    assert len(snapshot_rows) == 1

    for agent_run in harness.agent_runs(run["id"]):
        assert agent_run["run_id"] == run["id"]
        assert agent_run["project_id"] == project["id"]


def test_database_rejects_a_cross_project_stage_without_an_existing_run(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project_a, run_a = _started_run(harness, "Owner A")
    project_b, run_b = _started_run(harness, "Owner B")

    assert project_a["id"] != project_b["id"]

    database = harness.app.state.project_database

    # A stage row may not claim a Project that does not own its Run.
    with pytest.raises(sqlite3.IntegrityError):
        with database.transaction() as connection:
            connection.execute(
                """
                INSERT INTO run_stages (
                    run_id, project_id, stage_key, status, required, order_hint,
                    execution_mode, condition, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_a["id"],
                    project_b["id"],
                    "FINALIZATION",
                    "PENDING",
                    1,
                    99,
                    "SEQUENTIAL",
                    "ALWAYS",
                    utc_now().isoformat(),
                    utc_now().isoformat(),
                ),
            )

    # An AgentRun row may not claim a Project that does not own its Run.
    with pytest.raises(sqlite3.IntegrityError):
        with database.transaction() as connection:
            connection.execute(
                """
                INSERT INTO agent_runs (
                    id, run_id, project_id, stage_key, agent_profile_id,
                    agent_profile_key, agent_profile_version, executor_id,
                    access_mode, status, attempt, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid4()),
                    run_a["id"],
                    project_b["id"],
                    "DISCOVERY",
                    str(uuid4()),
                    "explorer",
                    1,
                    "00000000-0000-4000-8000-000000000001",
                    "READ_ONLY",
                    "PENDING",
                    1,
                    utc_now().isoformat(),
                    utc_now().isoformat(),
                ),
            )

    # Both Runs remain untouched by the rejected writes.
    assert harness.client.get(f"/api/runs/{run_a['id']}").status_code == 200
    assert harness.client.get(f"/api/runs/{run_b['id']}").status_code == 200


def test_database_rejects_an_agent_run_for_an_unknown_stage(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project, run = _started_run(harness, "Owner A")

    database = harness.app.state.project_database

    with pytest.raises(sqlite3.IntegrityError):
        with database.transaction() as connection:
            connection.execute(
                """
                INSERT INTO agent_runs (
                    id, run_id, project_id, stage_key, agent_profile_id,
                    agent_profile_key, agent_profile_version, executor_id,
                    access_mode, status, attempt, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid4()),
                    run["id"],
                    project["id"],
                    "FINALIZATION",
                    str(uuid4()),
                    "explorer",
                    1,
                    "00000000-0000-4000-8000-000000000001",
                    "READ_ONLY",
                    "PENDING",
                    1,
                    utc_now().isoformat(),
                    utc_now().isoformat(),
                ),
            )


def test_event_with_a_foreign_project_is_rejected(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project_a, run_a = _started_run(harness, "Owner A")
    project_b, _ = _started_run(harness, "Owner B")

    agent_run = harness.agent_runs(run_a["id"])[0]
    now = utc_now()

    forged = Event(
        id=EventId.new(),
        schema_version=EVENT_SCHEMA_VERSION,
        event_type=EventType.AGENT_COMPLETED,
        project_id=ProjectId.parse(project_b["id"]),
        run_id=RunId.parse(run_a["id"]),
        agent_run_id=AgentRunId.parse(agent_run["id"]),
        source=EventSource.EXECUTOR,
        occurred_at=now,
        recorded_at=now,
        payload=(),
        created_at=now,
        executor_id=ExecutorId.parse("00000000-0000-4000-8000-000000000001"),
    )

    with pytest.raises(EventScopeError):
        asyncio.run(harness.app.state.orchestrator.apply_external_event(forged))


def test_event_referencing_an_agent_run_from_another_run_is_rejected(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    _, run_a = _started_run(harness, "Owner A")
    _, run_b = _started_run(harness, "Owner B")

    foreign_agent_run = harness.agent_runs(run_b["id"])[0]
    now = utc_now()

    mismatched = Event(
        id=EventId.new(),
        schema_version=EVENT_SCHEMA_VERSION,
        event_type=EventType.AGENT_COMPLETED,
        project_id=ProjectId.parse(
            harness.client.get(f"/api/runs/{run_a['id']}").json()["project_id"]
        ),
        run_id=RunId.parse(run_a["id"]),
        agent_run_id=AgentRunId.parse(foreign_agent_run["id"]),
        source=EventSource.EXECUTOR,
        occurred_at=now,
        recorded_at=now,
        payload=(),
        created_at=now,
        executor_id=ExecutorId.parse("00000000-0000-4000-8000-000000000001"),
    )

    with pytest.raises(EventScopeError):
        asyncio.run(harness.app.state.orchestrator.apply_external_event(mismatched))


def test_two_projects_remain_isolated_through_orchestration(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project_a, run_a = _started_run(harness, "Owner A")
    project_b, run_b = _started_run(harness, "Owner B")

    assert run_a["id"] != run_b["id"]
    assert run_a["project_id"] == project_a["id"]
    assert run_b["project_id"] == project_b["id"]

    for agent_run in harness.agent_runs(run_a["id"]):
        assert agent_run["project_id"] == project_a["id"]

    for agent_run in harness.agent_runs(run_b["id"]):
        assert agent_run["project_id"] == project_b["id"]

    events_a = harness.events(run_a["id"])
    events_b = harness.events(run_b["id"])

    assert {event["run_id"] for event in events_a} == {run_a["id"]}
    assert {event["run_id"] for event in events_b} == {run_b["id"]}
    assert not {event["id"] for event in events_a} & {event["id"] for event in events_b}

    # Archive of one project does not affect the other.
    harness.client.post(f"/api/projects/{project_a['id']}/archive")

    assert harness.client.get(f"/api/runs/{run_b['id']}").json()["status"] == "COMPLETED"
    assert harness.client.get(f"/api/runs/{run_a['id']}").json()["status"] == "COMPLETED"


def test_duplicate_dedupe_key_is_rejected_at_the_database_level(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project, run = _started_run(harness, "Owner A")
    agent_run = harness.agent_runs(run["id"])[0]

    database = harness.app.state.project_database
    now = utc_now()

    def insert(dedupe_key: str) -> None:
        with database.transaction() as connection:
            connection.execute(
                """
                INSERT INTO events (
                    id, schema_version, event_type, project_id, run_id, agent_run_id,
                    source, occurred_at, recorded_at, payload_json,
                    redacted_keys_json, dedupe_key, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid4()),
                    EVENT_SCHEMA_VERSION,
                    EventType.AGENT_ACTIVITY.value,
                    project["id"],
                    run["id"],
                    agent_run["id"],
                    EventSource.EXECUTOR.value,
                    now.isoformat(),
                    now.isoformat(),
                    "{}",
                    "[]",
                    dedupe_key,
                    now.isoformat(),
                ),
            )

    insert("executor|session|event-1")

    with pytest.raises(sqlite3.IntegrityError):
        insert("executor|session|event-1")


def test_event_repository_reports_a_duplicate_instead_of_raising(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    _, run = _started_run(harness, "Owner A")
    agent_run = harness.agent_runs(run["id"])[0]
    run_row = harness.client.get(f"/api/runs/{run['id']}").json()

    now = utc_now()
    event = Event(
        id=EventId.new(),
        schema_version=EVENT_SCHEMA_VERSION,
        event_type=EventType.AGENT_ACTIVITY,
        project_id=ProjectId.parse(run_row["project_id"]),
        run_id=RunId.parse(run["id"]),
        agent_run_id=AgentRunId.parse(agent_run["id"]),
        source=EventSource.EXECUTOR,
        source_ref="session-1",
        occurred_at=now,
        recorded_at=now,
        payload=(),
        created_at=now,
        external_event_id="event-1",
        executor_id=ExecutorId.parse("00000000-0000-4000-8000-000000000001"),
    )

    repository = harness.app.state.event_service

    assert repository.record(event) is True
    assert repository.record(replace(event, id=EventId.new())) is False
