"""Phase 4B: the review handoff.

WORKTREE_POLICY §112/§113 require that once the implementation is terminal, the
candidate revision is captured and the reviewer receives a read-only view.

A reader creates no worktree, owns nothing, and can never alter the revision it
is judging. The handoff is derived from durable Workspace state, never from what
an executor claims it did.
"""

from __future__ import annotations

from typing import Any

from conftest import Harness, HarnessFactory

from agent_office.domain import AgentAccessMode, ChangeArea, EvidenceKind
from agent_office.infrastructure.executors import ReferenceScenario

FORBIDDEN_PATH_REFS = ("repository_path", "canonical_path", "git_common_dir")


def workspaces(harness: Harness, run_id: str) -> list[dict[str, Any]]:
    response = harness.client.get(f"/api/runs/{run_id}/workspaces")
    assert response.status_code == 200, response.text

    return response.json()


def evidence(harness: Harness, run_id: str) -> list[dict[str, Any]]:
    response = harness.client.get(f"/api/runs/{run_id}/evidence")
    assert response.status_code == 200, response.text

    return response.json()


def review_harness(harness_factory: HarnessFactory) -> tuple[Harness, dict[str, Any]]:
    """Run the bug-fix loop, which reviews an implementation worktree."""

    harness = harness_factory(ReferenceScenario.SUCCESS)
    run, _ = harness.start_workflow("bug-fix", changed_areas=[ChangeArea.BACKEND])

    return harness, harness.run_by_id(run["id"])


def test_reviewer_observes_the_implementation_candidate(
    harness_factory: HarnessFactory,
) -> None:
    """The review assignment is given a read-only view of the candidate."""

    harness, run = review_harness(harness_factory)
    assert run["status"] == "COMPLETED"

    recorded = workspaces(harness, run["id"])
    candidates = [item for item in recorded if item["writable"]]
    views = [item for item in recorded if not item["writable"]]

    assert candidates
    assert views

    assert {view["kind"] for view in views} == {"PROJECT_READ_VIEW"}
    assert {view["access_mode"] for view in views} == {AgentAccessMode.READ_ONLY}
    # A view is never a second writer: it is never owned.
    assert {view["owner_agent_run_id"] for view in views} == {None}
    # It observes the exact frozen revision under review.
    assert {view["base_revision"] for view in views} == {
        candidate["base_revision"] for candidate in candidates
    }
    assert {view["status"] for view in views} == {"READY"}

    # The reviewers are the assignments holding a view, and they are read-only.
    reviewers = [agent for agent in harness.agent_runs(run["id"]) if agent["stage_key"] == "REVIEW"]
    assert reviewers
    assert {agent["access_mode"] for agent in reviewers} == {AgentAccessMode.READ_ONLY}

    # Each reviewer observes one of the views. The verification stage's reader
    # gets its own view of the same candidate, so this is a subset.
    assert {agent["workspace_id"] for agent in reviewers} <= {view["id"] for view in views}
    assert all(agent["workspace_id"] is not None for agent in reviewers)
    assert len({view["id"] for view in views}) == len(views)


def test_read_only_assignment_before_any_write_needs_no_workspace(
    harness_factory: HarnessFactory,
) -> None:
    """Discovery runs before a candidate exists, so it observes nothing."""

    harness, run = review_harness(harness_factory)

    discovery = [
        agent for agent in harness.agent_runs(run["id"]) if agent["stage_key"] == "DISCOVERY"
    ]

    assert discovery
    assert {agent["access_mode"] for agent in discovery} == {AgentAccessMode.READ_ONLY}
    assert {agent["workspace_id"] for agent in discovery} == {None}


def test_handoff_records_a_git_derived_diff_summary(
    harness_factory: HarnessFactory,
) -> None:
    """The candidate's change set is captured before review begins."""

    harness, run = review_harness(harness_factory)

    summaries = [
        item for item in evidence(harness, run["id"]) if item["kind"] == EvidenceKind.DIFF_SUMMARY
    ]

    assert summaries

    summary = summaries[0]
    metadata = summary["metadata"]

    assert metadata["base_revision"]
    assert int(metadata["files_changed"]) >= 0

    # Attributed to the reviewer that received the handoff, not to the writer.
    reviewer_ids = {
        agent["id"] for agent in harness.agent_runs(run["id"]) if agent["stage_key"] == "REVIEW"
    }
    assert summary["agent_run_id"] in reviewer_ids


def test_releasing_a_view_never_removes_the_candidate_worktree(
    harness_factory: HarnessFactory,
) -> None:
    """A logical view owns no filesystem object and cannot destroy one."""

    harness, run = review_harness(harness_factory)

    recorded = workspaces(harness, run["id"])
    views = [item for item in recorded if not item["writable"]]
    assert views

    service = harness.app.state.workspace_service
    manager = service._worktrees  # noqa: SLF001 - safe test seam

    from agent_office.domain import WorkspaceId

    candidate_id = next(item["id"] for item in recorded if item["writable"])
    candidate_path = manager.resolve_workspace_path(
        service.get(WorkspaceId.parse(candidate_id)).path_ref
    )

    assert candidate_path.exists()

    released = harness.client.post(f"/api/workspaces/{views[0]['id']}/release").json()

    assert released["status"] == "RELEASED"
    assert released["released_at"] is not None

    # The worktree the view observed is still exactly where it was.
    assert candidate_path.exists()
    assert service.get(WorkspaceId.parse(candidate_id)).status != "RELEASED"


def test_handoff_discloses_no_host_path(harness_factory: HarnessFactory) -> None:
    """Neither the view DTO nor the handoff Evidence names a host location."""

    harness, run = review_harness(harness_factory)

    payload = harness.client.get(f"/api/runs/{run['id']}/workspaces").text
    payload += harness.client.get(f"/api/runs/{run['id']}/evidence").text

    for key in FORBIDDEN_PATH_REFS:
        assert key not in payload

    assert str(harness.tmp_path) not in payload


def test_main_working_tree_is_never_a_review_candidate(
    harness_factory: HarnessFactory,
) -> None:
    """The registered Project's own tree is never handed to a reader."""

    from test_phase4b_verification import register_repository

    harness = harness_factory(ReferenceScenario.SUCCESS)
    project, repository = register_repository(harness, "Handoff Project")
    repository_after = repository.resolve()

    workflow = harness.workflow_by_key("bug-fix")
    task = harness.create_task(
        project["id"],
        title="Handoff",
        requested_workflow_id=workflow["id"],
    )
    run = harness.create_run(task["id"])
    harness.start_run(run["id"], changed_areas=[ChangeArea.BACKEND])

    service = harness.app.state.workspace_service
    manager = service._worktrees  # noqa: SLF001 - safe test seam

    from agent_office.domain import WorkspaceId

    for workspace in workspaces(harness, run["id"]):
        location = manager.resolve_workspace_path(
            service.get(WorkspaceId.parse(workspace["id"])).path_ref
        )
        assert location.resolve() != repository_after
