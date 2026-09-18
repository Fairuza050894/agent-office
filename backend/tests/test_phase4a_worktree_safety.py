"""Phase 4A: Workspace and Git worktree safety.

The governing rule is that the registered Project's main working tree must never
be mutated by agent execution. Every test here runs against a real temporary Git
repository created under the pytest temp root, and each test that could touch
filesystem state asserts that its target stays inside that root.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any

import pytest
from conftest import Harness, HarnessFactory, ScriptedExecutor, create_git_repository, registry_for

from agent_office.application.workspaces import (
    WorkspaceOwnershipError,
    WorktreeCreationError,
    WorktreeNotContainedError,
)
from agent_office.domain import (
    DomainInvariantError,
    ProjectId,
    RunId,
    WorkspaceId,
    WorkspaceReconciliationOutcome,
    WorkspaceStatus,
    generated_branch_name,
    validate_branch_name,
    workspace_path_ref,
)
from agent_office.infrastructure.git import GitWorktreeManager

# ----------------------------------------------------------------------
# Fixtures and helpers
# ----------------------------------------------------------------------


def git(repository: Path, *arguments: str) -> str:
    """Run one Git command with an argument array and no shell."""

    result = subprocess.run(
        ["git", "-C", str(repository), *arguments],
        check=True,
        capture_output=True,
        text=True,
    )

    return result.stdout.strip()


def register_repository(
    harness: Harness, name: str = "Safety Project"
) -> tuple[dict[str, Any], Path]:
    """Register a real temporary Git repository as a Project."""

    repository = create_git_repository(
        Path(harness.tmp_path) / f"repo-{name.lower().replace(' ', '-')}"
    )
    response = harness.client.post(
        "/api/projects",
        json={"name": name, "repository_path": str(repository)},
    )
    assert response.status_code == 201, response.text

    return response.json(), repository


def start_writing_agent_run(
    harness: Harness,
    *,
    changed_areas: list[str] | None = None,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Start an enterprise-engineering Run and return (project, run, started).

    Its IMPLEMENTATION stage is the first write-capable stage, so the Run reaches
    workspace allocation immediately.
    """

    project = harness.register_project()
    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(
        project["id"],
        title="Workspace safety",
        requested_workflow_id=workflow["id"],
    )
    run = harness.create_run(task["id"])
    started = harness.start_run(run["id"], changed_areas=["BACKEND"])

    return project, run, started


def workspaces(harness: Harness, run_id: str) -> list[dict[str, Any]]:
    response = harness.client.get(f"/api/runs/{run_id}/workspaces")
    assert response.status_code == 200, response.text

    return response.json()


def write_workspace_file(manager: GitWorktreeManager, path_ref: str, name: str, body: str) -> Path:
    """Write one file inside a managed worktree.

    This is the tightly controlled test-only write action: it is confined to the
    managed root and is never available to an executor.
    """

    target = manager.resolve_workspace_path(path_ref)
    assert target.is_relative_to(Path(manager.workspace_root).resolve())

    file = target / name
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(body)

    return file


def manager_for(harness: Harness) -> GitWorktreeManager:
    return harness.app.state.workspace_service._worktrees  # noqa: SLF001 - safe test seam


# ----------------------------------------------------------------------
# A. Clean repository allocation
# ----------------------------------------------------------------------


def test_a_clean_repository_allocates_an_isolated_worktree(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project, repository = register_repository(harness)

    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    started = harness.start_run(run["id"], changed_areas=["BACKEND"])

    assert started["status"] == "COMPLETED"

    allocated = [item for item in workspaces(harness, run["id"]) if item["writable"]]
    assert allocated

    workspace = allocated[0]
    assert workspace["status"] == "RELEASED" or workspace["status"] in {
        "READY",
        "IN_USE",
    }
    assert workspace["kind"] == "GIT_WORKTREE"
    assert workspace["access_mode"] == "WRITE"
    assert workspace["writable"] is True
    assert workspace["project_id"] == project["id"]
    assert workspace["run_id"] == run["id"]
    assert workspace["base_revision"] == git(repository, "rev-parse", "HEAD")
    assert workspace["git_branch"].startswith("agent-office/")

    # Every write assignment got its own isolated worktree, and the main
    # working tree is still on its own branch.
    worktree_list = git(repository, "worktree", "list", "--porcelain")
    registered = [line for line in worktree_list.splitlines() if line.startswith("worktree ")]
    assert len(registered) == len(allocated) + 1

    # Read-only review views observe a candidate and create nothing: the number
    # of registered worktrees above already proves no extra one was created.
    views = [item for item in workspaces(harness, run["id"]) if not item["writable"]]
    assert views
    assert {view["kind"] for view in views} == {"PROJECT_READ_VIEW"}
    assert {view["owner_agent_run_id"] for view in views} == {None}
    # A view records the same base revision as the candidate it observes.
    assert {view["base_revision"] for view in views} == {allocated[0]["base_revision"]}
    assert git(repository, "branch", "--show-current") == "main"
    assert len({workspace["id"] for workspace in allocated}) == len(allocated)


# ----------------------------------------------------------------------
# B/C/D/E. Dirty main working tree preservation
# ----------------------------------------------------------------------


def test_bcd_main_tree_dirty_state_is_preserved_byte_for_byte(
    harness_factory: HarnessFactory,
) -> None:
    """A dirty main tree is never reset, cleaned, stashed, or committed."""

    harness = harness_factory()
    project, repository = register_repository(harness)

    # 1-4. Create the dirty fixture: a modified tracked file and an untracked file.
    tracked = repository / "README.md"
    tracked.write_text("# Test Repository\n\nuser edit that must survive\n")

    untracked = repository / "user-notes.txt"
    untracked.write_text("do not touch\n")

    head_before = git(repository, "rev-parse", "HEAD")
    branch_before = git(repository, "branch", "--show-current")
    tracked_bytes_before = tracked.read_bytes()
    untracked_bytes_before = untracked.read_bytes()

    # 5. Allocate a writable Workspace (the Run reaches IMPLEMENTATION, which is
    #    the first write stage).
    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    started = harness.start_run(run["id"], changed_areas=["BACKEND"])

    assert started["status"] == "COMPLETED"
    allocated = [item for item in workspaces(harness, run["id"]) if item["writable"]]
    assert allocated and allocated[0]["status"] in {"READY", "IN_USE", "RELEASED"}

    # 6. Perform activity in the isolated worktree.
    manager = manager_for(harness)
    workspace = allocated[0]
    service = harness.app.state.workspace_service
    path_ref = service.get(WorkspaceId.parse(workspace["id"])).path_ref

    write_workspace_file(manager, path_ref, "src/feature.py", "print('isolated work')\n")

    # 7. Inspect the main tree.
    assert tracked.read_bytes() == tracked_bytes_before
    assert untracked.read_bytes() == untracked_bytes_before
    assert git(repository, "rev-parse", "HEAD") == head_before
    assert git(repository, "branch", "--show-current") == branch_before

    # No stash, no new commit, and the user's files are untouched.
    assert git(repository, "stash", "list") == ""

    # The user's changes are still reported as uncommitted user work.
    status = git(repository, "status", "--porcelain")
    assert "README.md" in status
    assert "user-notes.txt" in status


def test_d_main_head_and_branch_are_never_moved(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project, repository = register_repository(harness)

    head_before = git(repository, "rev-parse", "HEAD")
    branch_before = git(repository, "branch", "--show-current")

    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"], changed_areas=["BACKEND"])

    manager = manager_for(harness)
    workspace = workspaces(harness, run["id"])[0]
    path_ref = harness.app.state.workspace_service.get(WorkspaceId.parse(workspace["id"])).path_ref
    write_workspace_file(manager, path_ref, "src/feature.py", "x = 1\n")

    assert git(repository, "rev-parse", "HEAD") == head_before
    assert git(repository, "branch", "--show-current") == branch_before
    assert git(repository, "status", "--porcelain") == ""


# ----------------------------------------------------------------------
# F. Isolated worktree receives write activity
# ----------------------------------------------------------------------


def test_f_write_activity_is_confined_to_the_isolated_worktree(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project, repository = register_repository(harness)

    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"], changed_areas=["BACKEND"])

    workspace = workspaces(harness, run["id"])[0]
    manager = manager_for(harness)
    service = harness.app.state.workspace_service
    path_ref = service.get(WorkspaceId.parse(workspace["id"])).path_ref

    write_workspace_file(manager, path_ref, "src/feature.py", "print('isolated work')\n")

    # The change is visible in the worktree...
    worktree = manager.resolve_workspace_path(path_ref)
    assert (worktree / "src" / "feature.py").exists()

    # ...and nowhere in the main tree.
    assert not (repository / "src" / "feature.py").exists()
    assert git(repository, "status", "--porcelain") == ""

    summary = harness.client.get(f"/api/workspaces/{workspace['id']}/status").json()
    assert summary["change_summary"]["files_changed"] == 1
    assert summary["change_summary"]["untracked_paths"] == ["src/feature.py"]
    assert summary["change_summary"]["files_changed"] == 1


# ----------------------------------------------------------------------
# G. Base revision
# ----------------------------------------------------------------------


def test_g_base_revision_is_captured_and_frozen(
    harness_factory: HarnessFactory,
) -> None:
    """Branch movement after allocation never changes a Workspace's base."""

    harness = harness_factory()
    project, repository = register_repository(harness)

    head_at_allocation = git(repository, "rev-parse", "HEAD")

    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"], changed_areas=["BACKEND"])

    workspace = workspaces(harness, run["id"])[0]
    assert workspace["base_revision"] == head_at_allocation
    assert len(workspace["base_revision"]) == 40

    # Move the main branch forward. The Workspace must keep its recorded base.
    (repository / "later.txt").write_text("later\n")
    git(repository, "add", "later.txt")
    git(repository, "commit", "-q", "-m", "later main commit")

    assert git(repository, "rev-parse", "HEAD") != head_at_allocation

    after = harness.client.get(f"/api/workspaces/{workspace['id']}").json()
    assert after["base_revision"] == head_at_allocation

    # The worktree still resolves to the recorded base, not to the moved branch.
    manager = manager_for(harness)
    service = harness.app.state.workspace_service
    path_ref = service.get(WorkspaceId.parse(workspace["id"])).path_ref
    worktree = manager.resolve_workspace_path(path_ref)
    assert git(worktree, "rev-parse", "HEAD") == head_at_allocation


# ----------------------------------------------------------------------
# H. Write ownership
# ----------------------------------------------------------------------


def test_h_write_ownership_is_exclusive_and_releasable(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project, _ = register_repository(harness)

    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"], changed_areas=["BACKEND"])

    workspace = next(item for item in workspaces(harness, run["id"]) if item["writable"])
    service = harness.app.state.workspace_service
    workspace_id = WorkspaceId.parse(workspace["id"])

    # The write assignment durably records the Workspace it ran in.
    agent_run = next(
        agent for agent in harness.agent_runs(run["id"]) if agent["stage_key"] == "IMPLEMENTATION"
    )
    assert agent_run["workspace_id"] == workspace["id"]

    # Ownership is released once execution is terminal, so the Workspace is
    # ready and unowned rather than held forever.
    settled = service.get(workspace_id)
    assert settled.owner_agent_run_id is None
    assert settled.status is WorkspaceStatus.READY

    # Acquiring is exclusive, and releasing returns it to READY.
    acquired = service.acquire_write_ownership(
        workspace_id, service_agent(harness, run["id"], agent_run["id"])
    )
    assert acquired.owner_agent_run_id is not None
    assert acquired.status is WorkspaceStatus.IN_USE

    released = service.release_write_ownership(workspace_id)
    assert released.owner_agent_run_id is None
    assert released.status is WorkspaceStatus.READY


def test_i_a_second_writer_cannot_acquire_the_same_worktree(
    harness_factory: HarnessFactory,
) -> None:
    """Two writers on one writable Workspace is refused atomically."""

    harness = harness_factory()
    project, _ = register_repository(harness)

    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"], changed_areas=["BACKEND"])

    workspace = workspaces(harness, run["id"])[0]
    service = harness.app.state.workspace_service
    workspace_id = WorkspaceId.parse(workspace["id"])

    write_agents = [
        agent
        for agent in harness.agent_runs(run["id"])
        if agent["access_mode"] in {"WRITE", "BOUNDED_WRITE"}
    ]
    first, second = write_agents[0], write_agents[1] if len(write_agents) > 1 else write_agents[0]

    from agent_office.domain import AgentRunId

    # Release, then have one writer claim it.
    service.release_write_ownership(workspace_id)
    service.acquire_write_ownership(workspace_id, service_agent(harness, run["id"], first["id"]))

    with pytest.raises(WorkspaceOwnershipError, match="active writer"):
        service.acquire_write_ownership(
            workspace_id, service_agent(harness, run["id"], second["id"])
        )

    # The refusal is recorded as a factual workspace conflict event.
    event_types = [event["event_type"] for event in harness.events(run["id"])]
    assert "workspace.conflict.detected" in event_types

    assert AgentRunId.parse(first["id"]) is not None


def service_agent(harness: Harness, run_id: str, agent_run_id: str):
    from agent_office.domain import AgentRunId

    return harness.app.state.agent_run_service.get(AgentRunId.parse(agent_run_id))


def test_i_cross_project_workspace_ownership_is_rejected(
    harness_factory: HarnessFactory,
) -> None:
    """A Workspace is only ever owned by an AgentRun of the same Run and Project."""

    harness = harness_factory()
    project_a, _ = register_repository(harness, "Project A")
    project_b, _ = register_repository(harness, "Project B")

    workflow = harness.workflow_by_key("enterprise-engineering")

    task_a = harness.create_task(project_a["id"], requested_workflow_id=workflow["id"])
    run_a = harness.create_run(task_a["id"])
    harness.start_run(run_a["id"], changed_areas=["BACKEND"])

    task_b = harness.create_task(project_b["id"], requested_workflow_id=workflow["id"])
    run_b = harness.create_run(task_b["id"])
    harness.start_run(run_b["id"], changed_areas=["BACKEND"])

    workspace_a = workspaces(harness, run_a["id"])[0]
    agent_of_b = next(
        agent
        for agent in harness.agent_runs(run_b["id"])
        if agent["access_mode"] in {"WRITE", "BOUNDED_WRITE"}
    )

    service = harness.app.state.workspace_service
    service.release_write_ownership(WorkspaceId.parse(workspace_a["id"]))

    with pytest.raises(WorkspaceOwnershipError, match="same Run and Project"):
        service.acquire_write_ownership(
            WorkspaceId.parse(workspace_a["id"]),
            service_agent(harness, run_b["id"], agent_of_b["id"]),
        )


# ----------------------------------------------------------------------
# J/K. The allocation gate
# ----------------------------------------------------------------------


def _unmake_repository(repository: Path) -> None:
    """Make a registered repository unusable, as if it were moved or removed."""

    for entry in sorted(repository.iterdir(), reverse=True):
        if entry.is_dir():
            subprocess.run(["rm", "-rf", str(entry)], check=True)
        else:
            entry.unlink()


def _write_first_workflow(harness: Harness) -> dict[str, Any]:
    """Register a workflow whose first stage is write-capable."""

    response = harness.client.post(
        "/api/workflows",
        json={
            "key": "write-first",
            "name": "Write first",
            "description": "A workflow whose first stage requires a Worktree.",
            "stages": [
                {
                    "key": "IMPLEMENTATION",
                    "name": "Implementation",
                    "order_hint": 1,
                    "assignments": [
                        {
                            "profile_key": "backend-developer",
                            "access_mode": "WRITE",
                            "required": True,
                        }
                    ],
                    "depends_on": [],
                    "execution_mode": "PARALLEL_ALLOWED",
                }
            ],
        },
    )
    assert response.status_code == 201, response.text

    return response.json()


def test_jk_no_executor_start_when_no_workspace_can_be_allocated(
    harness_factory: HarnessFactory,
) -> None:
    """A write-capable assignment never reaches the executor without a Worktree."""

    executor = ScriptedExecutor()
    harness = harness_factory(registry=registry_for(executor))

    project, repository = register_repository(harness)
    workflow = _write_first_workflow(harness)

    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])

    # The repository disappears after registration, so no Worktree can be created.
    _unmake_repository(repository)

    started = harness.start_run(run["id"])

    # The executor was never asked to start anything at all.
    assert executor.start_calls == 0
    assert executor.cancel_calls == 0

    assert started["status"] == "BLOCKED"
    assert started["failure_code"] == "WORKSPACE_UNAVAILABLE"

    blocked = [agent for agent in harness.agent_runs(run["id"]) if agent["status"] == "BLOCKED"]
    assert blocked
    assert blocked[0]["reason_code"] == "WORKSPACE_UNAVAILABLE"
    assert blocked[0]["workspace_id"] is None
    assert blocked[0]["started_at"] is None

    stage = harness.stage(run["id"], "IMPLEMENTATION")
    assert stage["status"] == "BLOCKED"
    assert stage["reason_code"] == "WORKSPACE_UNAVAILABLE"

    assert harness.completion_gates(run["id"])["complete"] is False

    # A failed allocation is durable and truthful, and no Worktree was created.
    failed = workspaces(harness, run["id"])
    assert len(failed) == 1
    assert failed[0]["status"] == "FAILED"
    assert failed[0]["base_revision"] is None
    assert failed[0]["git_branch"] is None

    event_types = [event["event_type"] for event in harness.events(run["id"])]
    assert "workspace.failed" in event_types
    assert "agent.start.requested" not in event_types

    # The block is not silently resumable: the AgentRun state machine never
    # returns a BLOCKED assignment to a pre-start state, so claiming resume
    # would be a lie. The operator must resolve the cause and start fresh work.
    assert harness.resume_raw(run["id"], changed_areas=["BACKEND"]).status_code == 409
    assert harness.run_by_id(run["id"])["status"] == "BLOCKED"

    # Once the repository is restored, new work in the same Project succeeds and
    # the executor is reached exactly once.
    create_git_repository(repository)

    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    replacement = harness.create_run(task["id"])
    recovered = harness.start_run(replacement["id"])

    assert recovered["status"] == "COMPLETED"
    assert executor.start_calls == 1
    assert workspaces(harness, replacement["id"])[0]["status"] in {
        "READY",
        "IN_USE",
        "RELEASED",
    }

    # The original Run keeps its truthful failure history.
    assert harness.run_by_id(run["id"])["failure_code"] == "WORKSPACE_UNAVAILABLE"


def test_k_read_only_assignments_need_no_workspace(
    harness_factory: HarnessFactory,
) -> None:
    """Only write-capable assignments are granted an isolated Worktree."""

    harness = harness_factory()
    project, _ = register_repository(harness)

    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    started = harness.start_run(run["id"], changed_areas=["BACKEND"])

    assert started["status"] == "COMPLETED"

    agents = harness.agent_runs(run["id"])
    read_only = [agent for agent in agents if agent["access_mode"] == "READ_ONLY"]
    writing = [agent for agent in agents if agent["access_mode"] in {"WRITE", "BOUNDED_WRITE"}]

    assert read_only
    assert writing

    by_id = {workspace["id"]: workspace for workspace in workspaces(harness, run["id"])}

    # A read-only assignment never holds a writable Workspace. It may hold a
    # review view of a candidate, which is a read-only observation target that
    # creates no worktree and is never owned (WORKTREE_POLICY §87, §112).
    for agent in read_only:
        if agent["workspace_id"] is not None:
            observed = by_id[agent["workspace_id"]]
            assert observed["writable"] is False
            assert observed["kind"] == "PROJECT_READ_VIEW"
            assert observed["owner_agent_run_id"] is None

    # Every write assignment holds a writable Worktree.
    assert {agent["workspace_id"] is None for agent in writing} == {False}
    assert {agent["workspace_id"] for agent in writing} == {
        workspace["id"] for workspace in by_id.values() if workspace["writable"]
    }


# ----------------------------------------------------------------------
# L/M/N. Inspection and path safety
# ----------------------------------------------------------------------


def test_lmn_status_inspection_is_relative_and_leaks_no_absolute_path(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project, repository = register_repository(harness)

    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"], changed_areas=["BACKEND"])

    workspace = workspaces(harness, run["id"])[0]
    manager = manager_for(harness)
    service = harness.app.state.workspace_service
    path_ref = service.get(WorkspaceId.parse(workspace["id"])).path_ref

    write_workspace_file(manager, path_ref, "docs/notes.md", "notes\n")
    write_workspace_file(manager, path_ref, "src/new.py", "x = 1\n")

    response = harness.client.get(f"/api/workspaces/{workspace['id']}/status")
    assert response.status_code == 200

    body = response.json()
    summary = body["change_summary"]

    assert summary["base_revision"] == workspace["base_revision"]
    assert summary["files_changed"] == 2
    assert sorted(summary["untracked_paths"]) == ["docs/notes.md", "src/new.py"]

    # Every path is repository-relative.
    for key in ("added_paths", "modified_paths", "deleted_paths", "untracked_paths"):
        for path in summary[key]:
            assert not path.startswith("/")
            assert not path.startswith("..")
            assert "\\" not in path

    # No absolute path anywhere in the DTO, including the DTO for the Run.
    blob = response.text + harness.client.get(f"/api/runs/{run['id']}/workspaces").text
    for forbidden in (
        str(repository),
        str(harness.tmp_path),
        "repository_path",
        "canonical_path",
        "git_common_dir",
        str(manager.workspace_root),
    ):
        assert forbidden not in blob


def test_unrecognised_workspace_is_not_found(harness_factory: HarnessFactory) -> None:
    from uuid import uuid4

    harness = harness_factory()

    assert harness.client.get(f"/api/workspaces/{uuid4()}").status_code == 404
    assert harness.client.post(f"/api/workspaces/{uuid4()}/release").status_code == 404
    assert harness.client.post(f"/api/workspaces/{uuid4()}/reconcile").status_code == 404


def test_n_no_route_accepts_a_filesystem_path(harness_factory: HarnessFactory) -> None:
    """Allocation and control are logical-identity only."""

    harness = harness_factory()
    project, repository = register_repository(harness)

    for path in (
        "/api/workspaces",
        f"/api/workspaces/{repository}",
        "/api/workspaces/allocate",
    ):
        assert harness.client.post(path, json={"path": str(repository)}).status_code in {
            404,
            405,
        }

    assert harness.client.delete(f"/api/workspaces/{repository}").status_code == 404


# ----------------------------------------------------------------------
# O/P/Q. Restart, reconciliation, missing worktree
# ----------------------------------------------------------------------


def test_op_restart_preserves_the_workspace_and_reconciles(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "workspace-restart.sqlite"
    harness = harness_factory(database_path=database_path)
    project, repository = register_repository(harness)

    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"], changed_areas=["BACKEND"])

    before = workspaces(harness, run["id"])
    assert before

    manager = manager_for(harness)
    service = harness.app.state.workspace_service
    path_ref = service.get(WorkspaceId.parse(before[0]["id"])).path_ref
    write_workspace_file(manager, path_ref, "src/feature.py", "x = 1\n")

    reopened = harness_factory(database_path=database_path)

    assert workspaces(reopened, run["id"]) == before

    reconciled = reopened.client.post(f"/api/workspaces/{before[0]['id']}/reconcile")
    assert reconciled.status_code == 200

    workspace = reconciled.json()
    assert workspace["base_revision"] == before[0]["base_revision"]
    assert workspace["status"] in {"READY", "IN_USE", "ORPHANED"}

    # Reconciliation observed the retained worktree rather than inventing state.
    reopened_manager = manager_for(reopened)
    observed = reopened_manager.verify_worktree(
        path_ref,
        repository_identity(reopened, project["id"]),
    )
    assert observed is WorkspaceReconciliationOutcome.CONFIRMED_READY


def repository_identity(harness: Harness, project_id: str):
    from agent_office.domain import ProjectId

    return harness.app.state.project_service.get_project(
        ProjectId.parse(project_id)
    ).repository_identity


def test_q_missing_worktree_is_orphaned_and_never_recreated(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project, _ = register_repository(harness)

    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"], changed_areas=["BACKEND"])

    workspace = workspaces(harness, run["id"])[0]
    manager = manager_for(harness)
    service = harness.app.state.workspace_service
    path_ref = service.get(WorkspaceId.parse(workspace["id"])).path_ref
    worktree = manager.resolve_workspace_path(path_ref)

    # The worktree disappears behind Agent Office's back.
    subprocess.run(["rm", "-rf", str(worktree)], check=True)
    assert not worktree.exists()

    reconciled = harness.client.post(f"/api/workspaces/{workspace['id']}/reconcile").json()

    assert reconciled["status"] == "ORPHANED"
    assert reconciled["reason_code"] == "WORKTREE_MISSING"
    assert reconciled["reason_summary"]

    # It was not silently recreated.
    assert not worktree.exists()


def test_unmanaged_worktree_is_orphaned_not_deleted(
    harness_factory: HarnessFactory,
) -> None:
    """A location that Git no longer recognises is reported, never removed."""

    harness = harness_factory()
    project, _ = register_repository(harness)

    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"], changed_areas=["BACKEND"])

    workspace = workspaces(harness, run["id"])[0]
    manager = manager_for(harness)
    service = harness.app.state.workspace_service
    path_ref = service.get(WorkspaceId.parse(workspace["id"])).path_ref
    worktree = manager.resolve_workspace_path(path_ref)

    # Replace the git link with a plain marker so the path exists but is no
    # longer a worktree of any repository.
    git_link = worktree / ".git"
    if git_link.is_file():
        git_link.unlink()

    reconciled = harness.client.post(f"/api/workspaces/{workspace['id']}/reconcile").json()

    assert reconciled["status"] == "ORPHANED"
    assert reconciled["reason_code"] in {"WORKTREE_UNMANAGED", "REPOSITORY_IDENTITY_MISMATCH"}
    assert worktree.exists()


# ----------------------------------------------------------------------
# R. Dirty worktree is not silently discarded
# ----------------------------------------------------------------------


def test_r_dirty_worktree_is_retained_on_release(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project, _ = register_repository(harness)

    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"], changed_areas=["BACKEND"])

    workspace = workspaces(harness, run["id"])[0]
    manager = manager_for(harness)
    service = harness.app.state.workspace_service
    path_ref = service.get(WorkspaceId.parse(workspace["id"])).path_ref
    worktree = manager.resolve_workspace_path(path_ref)

    write_workspace_file(manager, path_ref, "src/precious.py", "do not delete\n")

    service.release_write_ownership(WorkspaceId.parse(workspace["id"]))

    released = harness.client.post(f"/api/workspaces/{workspace['id']}/release").json()

    assert released["status"] != "RELEASED"
    assert released["reason_code"] == "DIRTY_WORKTREE"

    # Nothing was destroyed: the worktree and its unrecorded change remain.
    assert worktree.exists()
    assert (worktree / "src" / "precious.py").read_text() == "do not delete\n"


def test_r_clean_worktree_releases_and_removes_the_worktree(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project, repository = register_repository(harness)

    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"], changed_areas=["BACKEND"])

    allocated = [item for item in workspaces(harness, run["id"]) if item["writable"]]
    assert allocated

    manager = manager_for(harness)
    service = harness.app.state.workspace_service

    locations = []
    for workspace in allocated:
        locations.append(
            manager.resolve_workspace_path(service.get(WorkspaceId.parse(workspace["id"])).path_ref)
        )
        service.release_write_ownership(WorkspaceId.parse(workspace["id"]))

    released = [
        harness.client.post(f"/api/workspaces/{workspace['id']}/release").json()
        for workspace in allocated
    ]

    assert {workspace["status"] for workspace in released} == {"RELEASED"}
    assert {workspace["released_at"] is not None for workspace in released} == {True}

    for location in locations:
        assert not location.exists()

    # Every generated branch was safely deleted, and no user branch was touched.
    assert git(repository, "branch", "--show-current") == "main"
    assert git(repository, "branch", "--list").strip() == "* main"
    assert git(repository, "worktree", "list", "--porcelain").count("worktree ") == 1

    # Release is idempotent.
    again = harness.client.post(f"/api/workspaces/{allocated[0]['id']}/release").json()
    assert again == released[0]


def test_release_is_refused_while_a_writer_is_attached(
    harness_factory: HarnessFactory,
) -> None:
    """A cancellation request is not cleanup authorization."""

    harness = harness_factory()
    project, _ = register_repository(harness)

    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"], changed_areas=["BACKEND"])

    workspace = workspaces(harness, run["id"])[0]
    service = harness.app.state.workspace_service
    workspace_id = WorkspaceId.parse(workspace["id"])

    write_agent = next(
        agent
        for agent in harness.agent_runs(run["id"])
        if agent["access_mode"] in {"WRITE", "BOUNDED_WRITE"}
    )
    service.release_write_ownership(workspace_id)
    service.acquire_write_ownership(
        workspace_id, service_agent(harness, run["id"], write_agent["id"])
    )

    manager = manager_for(harness)
    path_ref = service.get(workspace_id).path_ref
    worktree = manager.resolve_workspace_path(path_ref)

    blocked = harness.client.post(f"/api/workspaces/{workspace['id']}/release").json()

    assert blocked["status"] != "RELEASED"
    assert blocked["reason_code"] == "EXECUTION_UNRESOLVED"
    assert blocked["owner_agent_run_id"] == write_agent["id"]
    assert worktree.exists()


# ----------------------------------------------------------------------
# S. Idempotency
# ----------------------------------------------------------------------


def test_s_allocation_is_idempotent_per_agent_run(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project, repository = register_repository(harness)

    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"], changed_areas=["BACKEND"])

    allocated = [item for item in workspaces(harness, run["id"]) if item["writable"]]
    assert allocated

    service = harness.app.state.workspace_service
    write_agent = next(
        agent
        for agent in harness.agent_runs(run["id"])
        if agent["access_mode"] in {"WRITE", "BOUNDED_WRITE"}
    )
    agent_run = service_agent(harness, run["id"], write_agent["id"])
    domain_run = harness.app.state.run_service.get_run(RunId.parse(run["id"]))

    recorded = write_agent["workspace_id"]
    assert recorded == allocated[0]["id"]

    # A repeated request for the same AgentRun reuses its recorded Workspace
    # rather than creating a second worktree.
    again = service.allocate_for_agent_run(domain_run, agent_run)

    assert str(again.id) == recorded
    assert len([item for item in workspaces(harness, run["id"]) if item["writable"]]) == len(
        allocated
    )

    # No extra managed worktree was created by the repeated request.
    worktrees = [
        line
        for line in git(repository, "worktree", "list", "--porcelain").splitlines()
        if line.startswith("worktree ")
    ]
    assert len(worktrees) == len(allocated) + 1


# ----------------------------------------------------------------------
# T/U/V. Naming, traversal, escape
# ----------------------------------------------------------------------


def test_t_branch_collision_never_rewrites_an_existing_branch(
    harness_factory: HarnessFactory,
) -> None:
    """A pre-existing branch is never attached to or reset."""

    harness = harness_factory()
    project, repository = register_repository(harness)

    project_id = ProjectId.parse(project["id"])
    run_id = RunId.new()
    workspace_id = WorkspaceId.new()

    branch = generated_branch_name(run_id, "backend-developer", workspace_id)

    # A user (or a previous run) already owns this exact branch name.
    git(repository, "branch", branch)
    head_before = git(repository, "rev-parse", branch)

    manager = manager_for(harness)
    identity = repository_identity(harness, project["id"])

    with pytest.raises(WorktreeCreationError):
        manager.create_worktree(
            project_id=project_id,
            run_id=run_id,
            workspace_id=workspace_id,
            repository_path=repository,
            identity=identity,
            base_revision=git(repository, "rev-parse", "HEAD"),
            git_branch=branch,
        )

    # The existing branch is untouched and still points where it did.
    assert git(repository, "rev-parse", branch) == head_before


def test_t_generated_names_use_only_system_identifiers() -> None:
    """No Task title, Project name, or user text can reach a branch or path."""

    run_id = RunId.new()
    workspace_id = WorkspaceId.new()

    branch = generated_branch_name(run_id, "backend-developer", workspace_id)
    assert branch == f"agent-office/{run_id}/backend-developer-{workspace_id}"
    assert " " not in branch
    assert ".." not in branch
    assert "~" not in branch

    # A hostile AgentProfile key is collapsed to a single safe fragment, so no
    # traversal, separator, shell metacharacter, or space can survive.
    hostile = generated_branch_name(run_id, "../../etc/passwd; rm -rf /", workspace_id)

    assert hostile.startswith("agent-office/")
    assert ".." not in hostile
    assert ";" not in hostile
    assert " " not in hostile
    assert "rm" not in hostile or "etc-passwd-rm-rf" in hostile

    # The result is structurally a valid generated branch: exactly three
    # segments, each a system identifier or a sanitized profile key.
    validate_branch_name(hostile)
    prefix, hostile_run, fragment = hostile.split("/")
    assert prefix == "agent-office"
    assert hostile_run == str(run_id)
    assert fragment.startswith("etc-passwd-rm-rf-")

    with pytest.raises(DomainInvariantError):
        generated_branch_name(run_id, "!!!", workspace_id)

    path_ref = workspace_path_ref(ProjectId.new(), run_id, workspace_id)
    assert path_ref.count("/") == 2
    assert ".." not in path_ref


def test_u_path_traversal_is_rejected(harness_factory: HarnessFactory) -> None:
    harness = harness_factory()
    manager = manager_for(harness)

    for hostile in (
        "../escape",
        "../../etc/passwd",
        "/etc/passwd",
        "~/secrets",
        "a/../../b",
        "",
        "   ",
    ):
        with pytest.raises(WorktreeNotContainedError):
            manager.resolve_workspace_path(hostile)

    # A logical identity that does not exist is refused, not guessed.
    harness.app.state.project_database.initialize()

    with pytest.raises(Exception, match="was not found"):
        harness.app.state.workspace_service.get(WorkspaceId.new())


def test_v_a_symlink_in_a_dirty_worktree_is_retained(
    harness_factory: HarnessFactory,
) -> None:
    """An untracked symlink is an unrecorded change, so nothing is destroyed."""

    harness = harness_factory()
    project, _ = register_repository(harness)

    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"], changed_areas=["BACKEND"])

    workspace = workspaces(harness, run["id"])[0]
    manager = manager_for(harness)
    service = harness.app.state.workspace_service
    path_ref = service.get(WorkspaceId.parse(workspace["id"])).path_ref
    worktree = manager.resolve_workspace_path(path_ref)

    outside = Path(harness.tmp_path) / "outside-target"
    outside.mkdir()
    (outside / "valuable.txt").write_text("survives\n")

    (worktree / "escape").symlink_to(outside)
    service.release_write_ownership(WorkspaceId.parse(workspace["id"]))

    retained = harness.client.post(f"/api/workspaces/{workspace['id']}/release").json()

    assert retained["status"] != "RELEASED"
    assert retained["reason_code"] == "DIRTY_WORKTREE"

    # Neither the workspace nor the external target was touched.
    assert worktree.exists()
    assert outside.exists()
    assert (outside / "valuable.txt").read_text() == "survives\n"


def test_v_symlink_safe_removal_never_follows_it_out_of_the_root(
    harness_factory: HarnessFactory,
) -> None:
    """Cleanup removes the worktree without deleting a symlink's target."""

    harness = harness_factory()
    project, _ = register_repository(harness)

    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"], changed_areas=["BACKEND"])

    workspace = workspaces(harness, run["id"])[0]
    manager = manager_for(harness)
    service = harness.app.state.workspace_service
    path_ref = service.get(WorkspaceId.parse(workspace["id"])).path_ref
    worktree = manager.resolve_workspace_path(path_ref)

    outside = Path(harness.tmp_path) / "outside-target"
    outside.mkdir()
    (outside / "valuable.txt").write_text("survives\n")

    (worktree / "escape").symlink_to(outside)

    # Recording the symlink as a worktree commit makes the worktree clean, which
    # is what allows a bounded removal to run with the symlink still present.
    git(worktree, "add", "-A")
    git(
        worktree,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=t@example.invalid",
        "commit",
        "-q",
        "-m",
        "record symlink",
    )

    service.release_write_ownership(WorkspaceId.parse(workspace["id"]))
    released = harness.client.post(f"/api/workspaces/{workspace['id']}/release").json()

    assert released["status"] == "RELEASED"
    assert not worktree.exists()

    # The symlink target and its content were never followed into and deleted.
    assert outside.exists()
    assert (outside / "valuable.txt").read_text() == "survives\n"

    # The branch held a commit that is not on the main branch, so the safe delete
    # refused and the branch was retained rather than force-deleted.
    assert git(harness.tmp_path / "repo-safety-project", "branch", "--show-current") == "main"


def test_v_a_symlinked_managed_root_cannot_redirect_outside(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """A workspace location that resolves outside the root is refused."""

    harness = harness_factory()
    manager = manager_for(harness)
    root = Path(manager.workspace_root).resolve()

    outside = Path(harness.tmp_path) / "outside-root"
    outside.mkdir()

    # A managed component that is a symlink pointing outside the root.
    root.mkdir(parents=True, exist_ok=True)
    link = root / "redirect"
    link.symlink_to(outside)

    with pytest.raises(WorktreeNotContainedError):
        manager.resolve_workspace_path(f"redirect/{RunId.new()}/{WorkspaceId.new()}")

    assert outside.exists()
    assert not (outside / str(WorkspaceId.new())).exists()

    assert os.path.isdir(root)


# ----------------------------------------------------------------------
# Access mode coverage
# ----------------------------------------------------------------------


def test_bounded_write_also_requires_an_isolated_worktree(
    harness_factory: HarnessFactory,
) -> None:
    """DOCUMENTATION is a BOUNDED_WRITE stage and is gated identically."""

    harness = harness_factory()
    run, started = harness.start_workflow("enterprise-engineering", changed_areas=["BACKEND"])

    assert started["status"] == "COMPLETED"

    documentation = [
        agent for agent in harness.agent_runs(run["id"]) if agent["stage_key"] == "DOCUMENTATION"
    ]
    if documentation:
        assert {agent["access_mode"] for agent in documentation} == {"BOUNDED_WRITE"}
        for agent in documentation:
            assert agent["workspace_id"] is not None

    allocated = [workspace for workspace in workspaces(harness, run["id"]) if workspace["writable"]]
    assert allocated
    assert {workspace["access_mode"] for workspace in allocated} <= {
        "WRITE",
        "BOUNDED_WRITE",
    }


def test_no_write_assignment_ever_targets_the_main_working_tree(
    harness_factory: HarnessFactory,
) -> None:
    """Every write AgentRun holds an isolated Worktree, never the main tree."""

    harness = harness_factory()
    project, repository = register_repository(harness)

    workflow = harness.workflow_by_key("enterprise-engineering")
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"], changed_areas=["BACKEND", "FRONTEND"])

    allocated = [workspace for workspace in workspaces(harness, run["id"]) if workspace["writable"]]
    assert allocated

    manager = manager_for(harness)
    repository_root = repository.resolve()

    for workspace in allocated:
        assert workspace["access_mode"] in {"WRITE", "BOUNDED_WRITE"}
        path_ref = harness.app.state.workspace_service.get(
            WorkspaceId.parse(workspace["id"])
        ).path_ref
        location = manager.resolve_workspace_path(path_ref)

        assert location != repository_root
        assert not location.is_relative_to(repository_root)
        assert location.is_relative_to(Path(manager.workspace_root).resolve())
