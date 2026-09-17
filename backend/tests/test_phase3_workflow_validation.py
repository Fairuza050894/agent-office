"""Phase 3A hardening: real workflow validation.

Validation is one central path used by creation, revision, the validate
endpoint, and the Run start gate. It must never report success unconditionally
and an invalid definition must never start a Run.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from conftest import Harness, HarnessFactory

from agent_office.domain import (
    AgentAssignment,
    StageDefinition,
    StageKey,
    WorkflowDefinition,
    WorkflowDefinitionId,
    WorkflowDefinitionStatus,
    WorkflowGraph,
    utc_now,
)
from agent_office.infrastructure.persistence import SQLiteWorkflowDefinitionRepository


def _create(harness: Harness, *, key: str, stages: list[dict[str, Any]]) -> Any:
    return harness.client.post(
        "/api/workflows",
        json={"key": key, "name": key.title(), "stages": stages},
    )


def test_unknown_agent_profile_is_rejected_at_creation(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()

    response = _create(
        harness,
        key="unknown-profile-flow",
        stages=[
            {
                "key": "DISCOVERY",
                "name": "Discovery",
                "order_hint": 0,
                "assignments": [{"profile_key": "not-a-real-role"}],
            }
        ],
    )

    assert response.status_code == 422
    assert "UNKNOWN_AGENT_PROFILE" in response.text


def test_unknown_agent_profile_is_rejected_on_revision(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    valid = _create(
        harness,
        key="revision-validation-flow",
        stages=[
            {
                "key": "DISCOVERY",
                "name": "Discovery",
                "order_hint": 0,
                "assignments": [{"profile_key": "explorer"}],
            }
        ],
    )
    assert valid.status_code == 201, valid.text

    revised = harness.client.put(
        f"/api/workflows/{valid.json()['id']}",
        json={
            "name": "Revision Validation Flow",
            "stages": [
                {
                    "key": "DISCOVERY",
                    "name": "Discovery",
                    "order_hint": 0,
                    "assignments": [{"profile_key": "still-not-a-real-role"}],
                }
            ],
        },
    )

    assert revised.status_code == 422
    assert "UNKNOWN_AGENT_PROFILE" in revised.text

    # The rejected revision never became a version.
    versions = harness.client.get(f"/api/workflows/{valid.json()['id']}/versions")
    assert [entry["version"] for entry in versions.json()] == [1]


def test_duplicate_assignment_in_one_stage_is_rejected(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()

    response = _create(
        harness,
        key="duplicate-assignment-flow",
        stages=[
            {
                "key": "DISCOVERY",
                "name": "Discovery",
                "order_hint": 0,
                "assignments": [{"profile_key": "explorer"}, {"profile_key": "explorer"}],
            }
        ],
    )

    assert response.status_code == 422
    assert "DUPLICATE_STAGE_ASSIGNMENT" in response.text


def test_validate_endpoint_reports_issues_instead_of_always_valid(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()

    valid = _create(
        harness,
        key="validate-endpoint-flow",
        stages=[
            {
                "key": "DISCOVERY",
                "name": "Discovery",
                "order_hint": 0,
                "assignments": [{"profile_key": "explorer"}],
            }
        ],
    )
    assert valid.status_code == 201, valid.text

    report = harness.client.post(f"/api/workflows/{valid.json()['id']}/validate")

    assert report.status_code == 200
    assert report.json()["valid"] is True
    assert report.json()["issues"] == []


def test_validate_endpoint_reports_a_stored_invalid_definition(
    harness_factory: HarnessFactory,
) -> None:
    """A definition that became invalid after storage is reported as invalid."""

    harness = harness_factory()
    workflow_id = WorkflowDefinitionId.parse(str(uuid4()))
    now = utc_now()

    graph = WorkflowGraph(
        stages=(
            StageDefinition(
                key=StageKey.DISCOVERY,
                name="Discovery",
                order_hint=0,
                # Bypasses the application service: simulates legacy or foreign
                # data that predates the central validation gate.
                assignments=(AgentAssignment(profile_key="retired-role"),),
            ),
        )
    )

    repository = SQLiteWorkflowDefinitionRepository(harness.app.state.project_database)
    harness.app.state.project_database.initialize()
    repository.add(
        WorkflowDefinition(
            id=workflow_id,
            key="stored-invalid-flow",
            name="Stored Invalid Flow",
            description="",
            version=1,
            status=WorkflowDefinitionStatus.ACTIVE,
            graph=graph,
            created_at=now,
            updated_at=now,
        )
    )

    report = harness.client.post(f"/api/workflows/{workflow_id}/validate")

    assert report.status_code == 200
    body = report.json()
    assert body["valid"] is False
    assert body["issues"][0]["code"] == "UNKNOWN_AGENT_PROFILE"
    assert body["issues"][0]["stage_key"] == "DISCOVERY"


def test_invalid_stored_definition_cannot_start_a_run(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    workflow_id = WorkflowDefinitionId.parse(str(uuid4()))
    now = utc_now()

    repository = SQLiteWorkflowDefinitionRepository(harness.app.state.project_database)
    harness.app.state.project_database.initialize()
    repository.add(
        WorkflowDefinition(
            id=workflow_id,
            key="unstorable-flow",
            name="Unstorable Flow",
            description="",
            version=1,
            status=WorkflowDefinitionStatus.ACTIVE,
            graph=WorkflowGraph(
                stages=(
                    StageDefinition(
                        key=StageKey.DISCOVERY,
                        name="Discovery",
                        order_hint=0,
                        assignments=(AgentAssignment(profile_key="retired-role"),),
                    ),
                )
            ),
            created_at=now,
            updated_at=now,
        )
    )

    project = harness.register_project()
    task = harness.create_task(project["id"], requested_workflow_id=str(workflow_id))
    run = harness.create_run(task["id"])

    response = harness.client.post(f"/api/runs/{run['id']}/start", json={})

    assert response.status_code == 422

    # Nothing started: no snapshot, no stage, no AgentRun.
    assert harness.client.get(f"/api/runs/{run['id']}").json()["status"] == "CREATED"
    assert harness.stages(run["id"]) == []
    assert harness.agent_runs(run["id"]) == []


def test_draft_workflow_cannot_start_a_run(harness_factory: HarnessFactory) -> None:
    harness = harness_factory()

    draft = harness.client.post(
        "/api/workflows",
        json={
            "key": "draft-flow",
            "name": "Draft Flow",
            "status": "DRAFT",
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
    assert draft.status_code == 201, draft.text
    assert draft.json()["status"] == "DRAFT"

    # A DRAFT definition is structurally valid...
    report = harness.client.post(f"/api/workflows/{draft.json()['id']}/validate")
    assert report.json()["valid"] is True

    # ...but it is not executable.
    project = harness.register_project()
    task = harness.create_task(project["id"], requested_workflow_id=draft.json()["id"])
    run = harness.create_run(task["id"])

    response = harness.client.post(f"/api/runs/{run['id']}/start", json={})
    assert response.status_code == 409
    assert harness.client.get(f"/api/runs/{run['id']}").json()["status"] == "CREATED"


def test_activation_makes_a_draft_workflow_executable(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()

    draft = harness.client.post(
        "/api/workflows",
        json={
            "key": "activatable-flow",
            "name": "Activatable Flow",
            "status": "DRAFT",
            "stages": [
                {
                    "key": "DISCOVERY",
                    "name": "Discovery",
                    "order_hint": 0,
                    "assignments": [{"profile_key": "explorer"}],
                }
            ],
        },
    ).json()

    activated = harness.client.put(
        f"/api/workflows/{draft['id']}",
        json={"name": "Activatable Flow", "status": "ACTIVE", "stages": draft["stages"]},
    )
    assert activated.status_code == 200, activated.text
    assert activated.json()["status"] == "ACTIVE"
    assert activated.json()["version"] == 2

    project = harness.register_project()
    task = harness.create_task(project["id"], requested_workflow_id=draft["id"])
    run = harness.create_run(task["id"])

    started = harness.start_run(run["id"])

    assert started["status"] == "COMPLETED"


def test_built_in_workflows_pass_the_central_validation(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()

    for key in ("enterprise-engineering", "bug-fix"):
        workflow = harness.workflow_by_key(key)
        report = harness.client.post(f"/api/workflows/{workflow['id']}/validate")

        assert report.status_code == 200
        assert report.json()["valid"] is True, report.text
        assert report.json()["issues"] == []

    # And they remain executable.
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    assert harness.start_run(run["id"], changed_areas=[])["status"] == "COMPLETED"
