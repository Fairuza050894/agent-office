"""Real-git regression tests for managed result delivery.

The Phase 20 service tests use FakeDelivery, so the real git adapter must be
covered separately. These tests run actual git commands in a temporary
repository and never touch a user Project.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from agent_office.application.results.errors import ResultDeliveryError
from agent_office.infrastructure.git.result_delivery import GitManagedResultDelivery

RUN_ID = "3fd9fce1-23d2-49d3-a8c7-ea926e8f5261"
WS_ID = "7f725e35-6c4c-4f0e-8a64-1a3c0b8a9c11"
MANAGED = f"agent-office/{RUN_ID}/backend-engineer-{WS_ID}"
ACCEPTED = f"agent-office/{RUN_ID}/accepted-{WS_ID[:8]}"


def _git(cwd: Path, *args: str) -> str:
    done = subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
    )
    return done.stdout.strip()


@pytest.fixture
def candidate(tmp_path: Path) -> tuple[GitManagedResultDelivery, SimpleNamespace, Path]:
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(repo, "init", "-q", "-b", "main")
    _git(repo, "config", "user.email", "t@example.invalid")
    _git(repo, "config", "user.name", "Test")
    (repo / "a.txt").write_text("base\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "base")

    worktree = tmp_path / "wt"
    _git(repo, "worktree", "add", "-q", "-b", MANAGED, str(worktree))
    (worktree / "feature.txt").write_text("candidate change\n")

    manager = SimpleNamespace(resolve_workspace_path=lambda _ref: worktree)
    workspace = SimpleNamespace(git_branch=MANAGED, path_ref="wt")
    return GitManagedResultDelivery(manager), workspace, worktree  # type: ignore[arg-type]


def test_delivers_to_new_accepted_branch(candidate) -> None:
    delivery, workspace, worktree = candidate

    receipt = delivery.deliver(
        workspace,
        accepted_branch=ACCEPTED,
        commit_message="feat: x",
    )

    assert receipt.branch == ACCEPTED
    assert receipt.commit == _git(worktree, "rev-parse", f"refs/heads/{ACCEPTED}")
    assert _git(worktree, "branch", "--show-current") == MANAGED
    assert _git(worktree, "status", "--porcelain") == ""


def test_delivery_is_idempotent_for_same_commit(candidate) -> None:
    delivery, workspace, _ = candidate

    first = delivery.deliver(
        workspace,
        accepted_branch=ACCEPTED,
        commit_message="feat: x",
    )
    second = delivery.deliver(
        workspace,
        accepted_branch=ACCEPTED,
        commit_message="feat: x",
    )

    assert second.commit == first.commit


def test_existing_branch_at_other_commit_is_rejected(candidate) -> None:
    delivery, workspace, worktree = candidate
    _git(worktree, "branch", ACCEPTED, "main")

    with pytest.raises(ResultDeliveryError, match="another commit"):
        delivery.deliver(
            workspace,
            accepted_branch=ACCEPTED,
            commit_message="feat: x",
        )
