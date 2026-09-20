"""Phase 4C-3: end-to-end closure of candidate durability and cleanup truth."""

from __future__ import annotations

from pathlib import Path

from conftest import HarnessFactory
from test_phase4b_verification import (
    check_request,
    create_workflow,
    evidence_of,
    execute,
    git,
    register_repository,
    verification_of,
)

from agent_office.domain import ChangeArea, EvidenceKind, WorkspaceId
from agent_office.infrastructure.executors import ReferenceScenario


def _completed_multi_writer_run(
    harness_factory: HarnessFactory,
    tmp_path: Path,
    *,
    database_name: str,
):
    database = tmp_path / database_name
    harness = harness_factory(ReferenceScenario.SUCCESS, database_path=database)
    project, repository = register_repository(harness, "Phase 4C3 Closure")
    workflow = create_workflow(
        harness,
        checks=[check_request()],
        multi_writer=True,
    )
    run = execute(
        harness,
        workflow,
        project=project,
        changed_areas=[ChangeArea.BACKEND, ChangeArea.UI],
    )

    assert run["status"] == "COMPLETED"

    candidate_id = harness.run_by_id(run["id"])["candidate_workspace_id"]
    assert candidate_id is not None

    workspaces = harness.client.get(f"/api/runs/{run['id']}/workspaces").json()
    candidate = next(item for item in workspaces if item["id"] == candidate_id)
    assert candidate["kind"] == "INTEGRATION_WORKTREE"

    return harness, database, repository, run, candidate_id


def test_integration_candidate_and_evidence_survive_restart(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """Restart preserves candidate identity, Evidence, and verifiable Git state."""

    first, database, repository, run, candidate_id = _completed_multi_writer_run(
        harness_factory,
        tmp_path,
        database_name="phase4c3-restart.sqlite",
    )
    original_evidence = evidence_of(first, run["id"])
    assert original_evidence

    reopened = harness_factory(ReferenceScenario.SUCCESS, database_path=database)
    persisted = reopened.run_by_id(run["id"])

    assert persisted["status"] == "COMPLETED"
    assert persisted["candidate_workspace_id"] == candidate_id
    assert evidence_of(reopened, run["id"]) == original_evidence
    assert verification_of(reopened, run["id"])["checks"][0]["satisfied"] is True

    reconciled = reopened.client.post(f"/api/workspaces/{candidate_id}/reconcile")
    assert reconciled.status_code == 200, reconciled.text
    assert reconciled.json()["status"] == "READY"

    assert git(repository, "branch", "--show-current") == "main"
    assert git(repository, "status", "--porcelain") == ""


def test_dirty_integration_candidate_is_retained_across_cleanup_and_reconcile(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """Cleanup never discards post-verification changes from an integration candidate."""

    harness, _, repository, run, candidate_id = _completed_multi_writer_run(
        harness_factory,
        tmp_path,
        database_name="phase4c3-dirty-cleanup.sqlite",
    )
    service = harness.app.state.workspace_service
    manager = service._worktrees  # noqa: SLF001 - deliberate closure audit seam
    workspace = service.get(WorkspaceId.parse(candidate_id))
    location = manager.resolve_workspace_path(workspace.path_ref)

    (location / "post-verification-change.txt").write_text("retain me\n")

    release = harness.client.post(f"/api/workspaces/{candidate_id}/release")
    assert release.status_code == 200, release.text
    assert release.json()["status"] == "READY"
    assert release.json()["reason_code"] == "DIRTY_WORKTREE"
    assert location.exists()

    reconciliation = harness.client.post(f"/api/workspaces/{candidate_id}/reconcile")
    assert reconciliation.status_code == 200, reconciliation.text
    assert reconciliation.json()["status"] == "READY"
    assert location.exists()

    repeated_release = harness.client.post(f"/api/workspaces/{candidate_id}/release")
    assert repeated_release.status_code == 200, repeated_release.text
    assert repeated_release.json()["status"] == "READY"
    assert repeated_release.json()["reason_code"] == "DIRTY_WORKTREE"
    assert location.exists()

    assert verification_of(harness, run["id"])["checks"][0]["satisfied"] is False
    assert "VERIFICATION_EVIDENCE_MISSING" in harness.completion_gates(run["id"])["failures"]
    assert git(repository, "branch", "--show-current") == "main"
    assert git(repository, "status", "--porcelain") == ""


def test_clean_candidate_release_does_not_retroactively_invalidate_completed_run(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """Safe cleanup after completion preserves durable completion truth."""

    harness, database, repository, run, candidate_id = _completed_multi_writer_run(
        harness_factory,
        tmp_path,
        database_name="phase4c3-clean-release.sqlite",
    )
    service = harness.app.state.workspace_service
    manager = service._worktrees  # noqa: SLF001 - deliberate closure audit seam
    workspace = service.get(WorkspaceId.parse(candidate_id))
    location = manager.resolve_workspace_path(workspace.path_ref)
    assert location.exists()

    verification_evidence = [
        item for item in evidence_of(harness, run["id"]) if item["kind"] == EvidenceKind.TEST_RESULT
    ]
    assert verification_evidence
    assert {item["metadata"]["workspace_id"] for item in verification_evidence} == {candidate_id}

    released = harness.client.post(f"/api/workspaces/{candidate_id}/release")
    assert released.status_code == 200, released.text
    assert released.json()["status"] == "RELEASED"
    assert not location.exists()

    gates = harness.completion_gates(run["id"])
    assert gates == {"status": "COMPLETED", "complete": True, "failures": []}

    reopened = harness_factory(ReferenceScenario.SUCCESS, database_path=database)
    persisted = reopened.run_by_id(run["id"])
    assert persisted["status"] == "COMPLETED"
    assert persisted["candidate_workspace_id"] == candidate_id

    released_after_restart = reopened.client.get(f"/api/workspaces/{candidate_id}")
    assert released_after_restart.status_code == 200
    assert released_after_restart.json()["status"] == "RELEASED"
    assert evidence_of(reopened, run["id"]) == evidence_of(harness, run["id"])
    assert reopened.completion_gates(run["id"]) == {
        "status": "COMPLETED",
        "complete": True,
        "failures": [],
    }

    assert git(repository, "branch", "--show-current") == "main"
    assert git(repository, "status", "--porcelain") == ""
