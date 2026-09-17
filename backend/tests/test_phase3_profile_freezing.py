"""Phase 3A hardening: frozen AgentProfile authority in WorkflowSnapshot.

A later AgentProfile revision must not change the meaning of an already-started
Run, so the snapshot freezes the resolved profile identity and version, and
AgentRun creation reads that frozen authority rather than the live catalog.
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Any

from conftest import Harness, HarnessFactory

from agent_office.domain import (
    BUILT_IN_AGENT_PROFILES,
    AgentProfileCatalog,
    agent_profile_id_for_key,
)


def _catalog_with_architect_version(version: int) -> AgentProfileCatalog:
    """Return the built-in catalog with one profile at a later version."""

    return AgentProfileCatalog(
        profiles=tuple(
            replace(profile, version=version) if profile.key == "architect" else profile
            for profile in BUILT_IN_AGENT_PROFILES
        )
    )


def _create_discovery_workflow(harness: Harness, *, key: str) -> dict[str, Any]:
    response = harness.client.post(
        "/api/workflows",
        json={
            "key": key,
            "name": key.title(),
            "stages": [
                {
                    "key": "DISCOVERY",
                    "name": "Discovery",
                    "order_hint": 0,
                    "assignments": [{"profile_key": "architect"}],
                }
            ],
        },
    )
    assert response.status_code == 201, response.text

    return response.json()


def _run_once(harness: Harness, workflow_id: str) -> tuple[str, dict[str, Any]]:
    project = harness.register_project()
    task = harness.create_task(project["id"], requested_workflow_id=workflow_id)
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    return run["id"], harness.client.get(f"/api/runs/{run['id']}/snapshot").json()


def test_snapshot_freezes_the_resolved_profile_identity_and_version(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    definition = _create_discovery_workflow(harness, key="freeze-profile-flow")
    run_id, snapshot = _run_once(harness, definition["id"])

    assert snapshot["agent_assignments"] == [
        {
            "stage_key": "DISCOVERY",
            "profile_id": str(agent_profile_id_for_key("architect")),
            "profile_key": "architect",
            "profile_name": "Architect",
            "profile_version": 1,
            "access_mode": "READ_ONLY",
            "required": True,
        }
    ]

    agent_run = harness.agent_runs(run_id)[0]
    assert agent_run["agent_profile_key"] == "architect"
    assert agent_run["agent_profile_version"] == 1


def test_newer_catalog_version_is_frozen_for_later_runs_only(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """A later profile revision applies to new Runs, never to frozen ones."""

    database_path = tmp_path / "catalog-revision.sqlite"

    # First deployment: architect is at version 1.
    harness_v1 = harness_factory(database_path=database_path)
    definition = _create_discovery_workflow(harness_v1, key="profile-version-flow")
    workflow_id = definition["id"]
    run_a, snapshot_a = _run_once(harness_v1, workflow_id)

    assert snapshot_a["agent_assignments"][0]["profile_version"] == 1
    assert harness_v1.agent_runs(run_a)[0]["agent_profile_version"] == 1

    # Second deployment over the same database: the catalog now reports a later
    # revision of the same profile.
    harness_v2 = harness_factory(
        agent_profiles=_catalog_with_architect_version(2),
        database_path=database_path,
    )

    project = harness_v2.register_project()
    task = harness_v2.create_task(project["id"], requested_workflow_id=workflow_id)
    run_b = harness_v2.create_run(task["id"])
    harness_v2.start_run(run_b["id"])

    frozen_b = harness_v2.client.get(f"/api/runs/{run_b['id']}/snapshot").json()

    # The newer Run freezes the newer version...
    assert frozen_b["agent_assignments"][0]["profile_version"] == 2
    assert harness_v2.agent_runs(run_b["id"])[0]["agent_profile_version"] == 2

    # ...while the earlier Run keeps its own frozen authority untouched, even
    # when read through the newer deployment.
    assert snapshot_a["agent_assignments"][0]["profile_version"] == 1
    assert harness_v2.client.get(f"/api/runs/{run_a}/snapshot").json() == snapshot_a
    assert harness_v2.agent_runs(run_a)[0]["agent_profile_version"] == 1

    # Stable profile identity is shared; only the version differs.
    assert (
        frozen_b["agent_assignments"][0]["profile_id"]
        == snapshot_a["agent_assignments"][0]["profile_id"]
    )
    assert frozen_b["id"] != snapshot_a["id"]


def test_agent_run_creation_uses_frozen_authority_not_the_live_catalog(
    harness_factory: HarnessFactory,
) -> None:
    """An AgentRun copies the snapshot's frozen profile version verbatim."""

    harness = harness_factory(agent_profiles=_catalog_with_architect_version(7))
    definition = _create_discovery_workflow(harness, key="frozen-authority-flow")
    run_id, snapshot = _run_once(harness, definition["id"])

    assert snapshot["agent_assignments"][0]["profile_version"] == 7
    assert harness.agent_runs(run_id)[0]["agent_profile_version"] == 7


def test_frozen_access_mode_and_required_flag_survive_the_snapshot(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    response = harness.client.post(
        "/api/workflows",
        json={
            "key": "frozen-flags-flow",
            "name": "Frozen Flags Flow",
            "stages": [
                {
                    "key": "IMPLEMENTATION",
                    "name": "Implementation",
                    "order_hint": 0,
                    "assignments": [
                        {
                            "profile_key": "backend-developer",
                            "access_mode": "BOUNDED_WRITE",
                            "required": False,
                        }
                    ],
                }
            ],
        },
    )
    assert response.status_code == 201, response.text

    definition = response.json()
    run_id, snapshot = _run_once(harness, definition["id"])

    frozen = snapshot["agent_assignments"][0]
    assert frozen["access_mode"] == "BOUNDED_WRITE"
    assert frozen["required"] is False

    agent_run = harness.agent_runs(run_id)[0]
    assert agent_run["access_mode"] == "BOUNDED_WRITE"
