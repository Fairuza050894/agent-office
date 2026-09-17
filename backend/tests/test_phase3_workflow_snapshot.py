"""Phase 3A acceptance: WorkflowDefinition freezing and snapshot immutability.

The core guarantee under test is that once a Run starts, its workflow is frozen.
Editing the reusable WorkflowDefinition afterwards must not change active or
historical Run behavior, and that must remain true across a restart.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import uuid4

from conftest import Harness, HarnessFactory


def _stages(*, discovery_name: str, extra_review: bool) -> list[dict[str, Any]]:
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


def _create_workflow(
    harness: Harness,
    *,
    key: str,
    name: str,
    stages: list[dict[str, Any]],
) -> dict[str, Any]:
    response = harness.client.post(
        "/api/workflows",
        json={"key": key, "name": name, "description": "Phase 3A acceptance", "stages": stages},
    )
    assert response.status_code == 201, response.text

    return response.json()


def test_workflow_definition_lifecycle_is_queryable(harness_factory: HarnessFactory) -> None:
    harness = harness_factory()
    created = _create_workflow(
        harness,
        key="custom-flow",
        name="Custom Flow",
        stages=_stages(discovery_name="Discovery", extra_review=False),
    )

    assert created["version"] == 1
    assert created["status"] == "ACTIVE"
    assert [stage["key"] for stage in created["stages"]] == ["DISCOVERY"]

    listed = harness.client.get("/api/workflows")
    assert listed.status_code == 200
    assert created["id"] in [workflow["id"] for workflow in listed.json()]

    fetched = harness.client.get(f"/api/workflows/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == created

    validated = harness.client.post(f"/api/workflows/{created['id']}/validate")
    assert validated.status_code == 200
    assert validated.json() == {
        "valid": True,
        "schema_version": 1,
        "stage_count": 1,
        "stage_keys": ["DISCOVERY"],
        "issues": [],
    }


def test_built_in_workflows_are_registered(harness_factory: HarnessFactory) -> None:
    harness = harness_factory()

    enterprise = harness.workflow_by_key("enterprise-engineering")
    bug_fix = harness.workflow_by_key("bug-fix")

    assert enterprise["status"] == "ACTIVE"
    assert bug_fix["status"] == "ACTIVE"
    assert {stage["key"] for stage in enterprise["stages"]} == {
        "DISCOVERY",
        "IMPLEMENTATION",
        "REVIEW",
        "DOCUMENTATION",
    }


def test_invalid_workflow_graph_is_rejected_with_controlled_status(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()

    cyclic = harness.client.post(
        "/api/workflows",
        json={
            "key": "cyclic-flow",
            "name": "Cyclic",
            "stages": [
                {
                    "key": "DISCOVERY",
                    "name": "Discovery",
                    "order_hint": 0,
                    "depends_on": ["REVIEW"],
                    "assignments": [{"profile_key": "explorer"}],
                },
                {
                    "key": "REVIEW",
                    "name": "Review",
                    "order_hint": 1,
                    "depends_on": ["DISCOVERY"],
                    "assignments": [{"profile_key": "qa-reviewer"}],
                },
            ],
        },
    )
    assert cyclic.status_code == 422

    unknown_dependency = harness.client.post(
        "/api/workflows",
        json={
            "key": "unknown-dependency",
            "name": "Unknown Dependency",
            "stages": [
                {
                    "key": "REVIEW",
                    "name": "Review",
                    "order_hint": 0,
                    "depends_on": ["DISCOVERY"],
                    "assignments": [{"profile_key": "qa-reviewer"}],
                }
            ],
        },
    )
    assert unknown_dependency.status_code == 422

    create_valid = harness.client.post(
        "/api/workflows",
        json={
            "key": "duplicate-key-flow",
            "name": "Duplicate Key Flow",
            "stages": _stages(discovery_name="Discovery", extra_review=False),
        },
    )
    assert create_valid.status_code == 201, create_valid.text

    duplicate_key = harness.client.post(
        "/api/workflows",
        json={
            "key": "duplicate-key-flow",
            "name": "Duplicate Key",
            "stages": _stages(discovery_name="Discovery", extra_review=False),
        },
    )
    assert duplicate_key.status_code == 409


def test_definition_edit_does_not_alter_existing_snapshot_and_newer_run_uses_new_version(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """The nine-step Workflow Snapshot Rule acceptance path."""

    database_path = tmp_path / "snapshot.sqlite"
    harness = harness_factory(database_path=database_path)

    # 1. Create WorkflowDefinition V1.
    definition = _create_workflow(
        harness,
        key="snapshot-flow",
        name="Snapshot Flow",
        stages=_stages(discovery_name="Original Discovery", extra_review=False),
    )
    assert definition["version"] == 1
    workflow_id = definition["id"]

    project = harness.register_project()
    task = harness.create_task(project["id"], requested_workflow_id=workflow_id)

    # 2/3. Start a Run that uses V1 and capture its immutable snapshot.
    first_run = harness.create_run(task["id"])
    harness.start_run(first_run["id"])
    snapshot_v1 = harness.client.get(f"/api/runs/{first_run['id']}/snapshot").json()
    assert snapshot_v1["source_workflow_version"] == 1
    assert snapshot_v1["stages"][0]["name"] == "Original Discovery"

    # 4. Edit the reusable definition.
    edited = harness.client.put(
        f"/api/workflows/{workflow_id}",
        json={
            "name": "Snapshot Flow",
            "description": "Edited after the first Run started.",
            "stages": _stages(discovery_name="Renamed Discovery", extra_review=True),
        },
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["version"] == 2

    # 5. The existing Run still resolves to its original snapshot, unchanged.
    unchanged = harness.client.get(f"/api/runs/{first_run['id']}/snapshot")
    assert unchanged.status_code == 200
    assert unchanged.json() == snapshot_v1
    assert [stage["key"] for stage in unchanged.json()["stages"]] == ["DISCOVERY"]

    # 6/7. A later Run may use the newer definition version.
    second_run = harness.create_run(task["id"])
    harness.start_run(second_run["id"])
    snapshot_v2 = harness.client.get(f"/api/runs/{second_run['id']}/snapshot").json()

    assert snapshot_v2["source_workflow_version"] == 2
    assert snapshot_v2["id"] != snapshot_v1["id"]
    assert [stage["key"] for stage in snapshot_v2["stages"]] == ["DISCOVERY", "REVIEW"]

    # 8/9. Restart against the same database: both snapshots stay historically
    # correct and the frozen graphs do not drift.
    reopened = harness_factory(database_path=database_path)

    after_restart_v1 = reopened.client.get(f"/api/runs/{first_run['id']}/snapshot")
    after_restart_v2 = reopened.client.get(f"/api/runs/{second_run['id']}/snapshot")

    assert after_restart_v1.status_code == 200
    assert after_restart_v2.status_code == 200
    assert after_restart_v1.json() == snapshot_v1
    assert after_restart_v2.json() == snapshot_v2


def test_run_records_the_frozen_snapshot_it_executes(harness_factory: HarnessFactory) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])

    run = harness.create_run(task["id"])
    assert run["workflow_snapshot_id"] is None

    started = harness.start_run(run["id"])

    assert started["workflow_snapshot_id"] is not None
    assert started["resolved_executor_id"] is not None

    snapshot = harness.client.get(f"/api/runs/{run['id']}/snapshot").json()
    assert snapshot["id"] == started["workflow_snapshot_id"]
    assert snapshot["run_id"] == run["id"]
    assert snapshot["project_id"] == project["id"]


def test_starting_a_run_twice_is_rejected(harness_factory: HarnessFactory) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])

    harness.start_run(run["id"])

    second = harness.client.post(f"/api/runs/{run['id']}/start", json={})
    assert second.status_code == 409


def test_archived_project_cannot_start_a_run(harness_factory: HarnessFactory) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])

    archived = harness.client.post(f"/api/projects/{project['id']}/archive")
    assert archived.status_code == 200

    response = harness.client.post(f"/api/runs/{run['id']}/start", json={})
    assert response.status_code == 409

    # The Run remains readable and untouched.
    assert harness.client.get(f"/api/runs/{run['id']}").json()["status"] == "CREATED"


def test_orchestration_inspection_endpoints_reject_unknown_run(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    unknown = str(uuid4())

    assert harness.client.get(f"/api/runs/{unknown}/snapshot").status_code == 404
    assert harness.client.get(f"/api/runs/{unknown}/stages").status_code == 404
    assert harness.client.get(f"/api/runs/{unknown}/agents").status_code == 404
    assert harness.client.get(f"/api/runs/{unknown}/events").status_code == 404
