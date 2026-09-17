"""Phase 3A hardening: append-only WorkflowDefinition version history.

An edit must add a new immutable version and must never rewrite the version a
Run already froze. The old version stays retrievable from the catalog, not only
from Run snapshots.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from conftest import Harness, HarnessFactory


def _stages(*, discovery_name: str, extra_review: bool = False) -> list[dict[str, Any]]:
    stages: list[dict[str, Any]] = [
        {
            "key": "DISCOVERY",
            "name": discovery_name,
            "order_hint": 0,
            "assignments": [{"profile_key": "explorer", "access_mode": "READ_ONLY"}],
        }
    ]

    if extra_review:
        stages.append(
            {
                "key": "REVIEW",
                "name": "Review",
                "order_hint": 1,
                "depends_on": ["DISCOVERY"],
                "assignments": [{"profile_key": "qa-reviewer", "access_mode": "READ_ONLY"}],
            }
        )

    return stages


def _create(harness: Harness, *, key: str, name: str) -> dict[str, Any]:
    response = harness.client.post(
        "/api/workflows",
        json={"key": key, "name": name, "stages": _stages(discovery_name="Original Discovery")},
    )
    assert response.status_code == 201, response.text

    return response.json()


def _version_rows(harness: Harness, workflow_id: str) -> list[dict[str, Any]]:
    database = harness.app.state.project_database

    with database.connection() as connection:
        return [
            dict(row)
            for row in connection.execute(
                """
                SELECT version, definition_json
                FROM workflow_definition_versions
                WHERE workflow_id = ?
                ORDER BY version ASC
                """,
                (workflow_id,),
            ).fetchall()
        ]


def test_revising_appends_a_version_and_preserves_the_previous_one(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    definition = _create(harness, key="versioned-flow", name="Versioned Flow")
    workflow_id = definition["id"]

    rows_before = _version_rows(harness, workflow_id)
    assert [row["version"] for row in rows_before] == [1]

    revised = harness.client.put(
        f"/api/workflows/{workflow_id}",
        json={
            "name": "Versioned Flow",
            "description": "Second revision.",
            "stages": _stages(discovery_name="Renamed Discovery", extra_review=True),
        },
    )
    assert revised.status_code == 200, revised.text
    assert revised.json()["version"] == 2
    assert revised.json()["description"] == "Second revision."

    # The version 1 row is byte-for-byte unchanged: history is append-only.
    rows_after = _version_rows(harness, workflow_id)
    assert [row["version"] for row in rows_after] == [1, 2]
    assert rows_after[0] == rows_before[0]

    # Latest reads point at version 2.
    latest = harness.client.get(f"/api/workflows/{workflow_id}").json()
    assert latest["version"] == 2
    assert [stage["key"] for stage in latest["stages"]] == ["DISCOVERY", "REVIEW"]

    # The historical version stays retrievable from the catalog.
    versions = harness.client.get(f"/api/workflows/{workflow_id}/versions")
    assert versions.status_code == 200
    assert [entry["version"] for entry in versions.json()] == [1, 2]

    historical = harness.client.get(f"/api/workflows/{workflow_id}/versions/1")
    assert historical.status_code == 200
    assert historical.json()["version"] == 1
    assert historical.json()["name"] == "Versioned Flow"
    assert [stage["key"] for stage in historical.json()["stages"]] == ["DISCOVERY"]
    assert historical.json()["stages"][0]["name"] == "Original Discovery"

    newest = harness.client.get(f"/api/workflows/{workflow_id}/versions/2")
    assert newest.status_code == 200
    assert [stage["key"] for stage in newest.json()["stages"]] == ["DISCOVERY", "REVIEW"]

    missing = harness.client.get(f"/api/workflows/{workflow_id}/versions/99")
    assert missing.status_code == 404


def test_runs_keep_their_frozen_version_across_revisions_and_restart(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "version-history.sqlite"
    harness = harness_factory(database_path=database_path)

    definition = _create(harness, key="run-version-flow", name="Run Version Flow")
    workflow_id = definition["id"]

    project = harness.register_project()
    task = harness.create_task(project["id"], requested_workflow_id=workflow_id)

    # Run A freezes V1.
    run_a = harness.create_run(task["id"])
    harness.start_run(run_a["id"])
    snapshot_v1 = harness.client.get(f"/api/runs/{run_a['id']}/snapshot").json()
    assert snapshot_v1["source_workflow_version"] == 1

    # Revise to V2.
    revised = harness.client.put(
        f"/api/workflows/{workflow_id}",
        json={
            "name": "Run Version Flow",
            "stages": _stages(discovery_name="Renamed Discovery", extra_review=True),
        },
    )
    assert revised.status_code == 200
    assert revised.json()["version"] == 2

    # Run A is untouched and still resolves V1.
    assert harness.client.get(f"/api/runs/{run_a['id']}/snapshot").json() == snapshot_v1

    # Run B freezes V2.
    run_b = harness.create_run(task["id"])
    harness.start_run(run_b["id"])
    snapshot_v2 = harness.client.get(f"/api/runs/{run_b['id']}/snapshot").json()
    assert snapshot_v2["source_workflow_version"] == 2
    assert snapshot_v2["id"] != snapshot_v1["id"]
    assert [stage["key"] for stage in snapshot_v2["stages"]] == ["DISCOVERY", "REVIEW"]

    # Restart: the version history and both snapshots remain correct.
    reopened = harness_factory(database_path=database_path)

    versions = reopened.client.get(f"/api/workflows/{workflow_id}/versions")
    assert versions.status_code == 200
    assert [entry["version"] for entry in versions.json()] == [1, 2]

    historical = reopened.client.get(f"/api/workflows/{workflow_id}/versions/1").json()
    assert historical["stages"][0]["name"] == "Original Discovery"

    assert reopened.client.get(f"/api/runs/{run_a['id']}/snapshot").json() == snapshot_v1
    assert reopened.client.get(f"/api/runs/{run_b['id']}/snapshot").json() == snapshot_v2

    assert [row["version"] for row in _version_rows(reopened, workflow_id)] == [1, 2]


def test_version_rows_are_immutable_at_the_repository_level(
    harness_factory: HarnessFactory,
) -> None:
    """The repository refuses to rewrite an existing immutable version row."""

    from agent_office.application.workflows.errors import WorkflowPersistenceError
    from agent_office.domain import WorkflowDefinitionId
    from agent_office.infrastructure.persistence import SQLiteWorkflowDefinitionRepository

    harness = harness_factory()
    definition = _create(harness, key="append-only-flow", name="Append Only Flow")
    workflow_id = WorkflowDefinitionId.parse(definition["id"])
    repository = SQLiteWorkflowDefinitionRepository(harness.app.state.project_database)

    latest = repository.get(workflow_id)
    assert latest is not None

    try:
        repository.add_version(latest)
    except WorkflowPersistenceError:
        pass
    else:
        raise AssertionError("re-persisting an existing version must be refused")

    assert [row["version"] for row in _version_rows(harness, str(workflow_id))] == [1]


def test_built_in_workflows_remain_executable_after_revision(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    bug_fix = harness.workflow_by_key("bug-fix")

    revised = harness.client.put(
        f"/api/workflows/{bug_fix['id']}",
        json={
            "name": "Bug Fix",
            "stages": [
                {
                    "key": "DISCOVERY",
                    "name": "Discovery",
                    "order_hint": 0,
                    "assignments": [{"profile_key": "explorer"}],
                }
            ],
        },
    )
    assert revised.status_code == 200
    assert revised.json()["version"] == bug_fix["version"] + 1

    project = harness.register_project()
    task = harness.create_task(project["id"], requested_workflow_id=bug_fix["id"])
    run = harness.create_run(task["id"])

    started = harness.start_run(run["id"], changed_areas=[])

    assert started["status"] == "COMPLETED"
    snapshot = harness.client.get(f"/api/runs/{run['id']}/snapshot").json()
    assert snapshot["source_workflow_version"] == bug_fix["version"] + 1
