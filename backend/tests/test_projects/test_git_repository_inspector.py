"""Integration tests for read-only Git repository inspection."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from agent_office.application.projects import InvalidRepositoryError
from agent_office.infrastructure.git import GitRepositoryInspector


def _git(repository: Path, *arguments: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repository), *arguments],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


@pytest.fixture
def git_repository(tmp_path: Path) -> Path:
    repository = tmp_path / "repository with spaces"
    repository.mkdir()

    subprocess.run(
        ["git", "init", "-b", "main", str(repository)],
        check=True,
        capture_output=True,
        text=True,
    )

    _git(repository, "config", "user.name", "Agent Office Tests")
    _git(
        repository,
        "config",
        "user.email",
        "agent-office@example.invalid",
    )

    tracked = repository / "tracked.txt"
    tracked.write_text("baseline\n")

    _git(repository, "add", "tracked.txt")
    _git(repository, "commit", "-m", "initial")

    return repository


def test_valid_repository_with_spaces_is_accepted(
    git_repository: Path,
) -> None:
    inspection = GitRepositoryInspector().inspect(git_repository)

    assert inspection.repository_path == git_repository.resolve()
    assert inspection.default_branch == "main"
    assert inspection.repository_identity.canonical_path == (git_repository.resolve())


def test_missing_path_is_rejected(tmp_path: Path) -> None:
    missing = tmp_path / "missing"

    with pytest.raises(InvalidRepositoryError):
        GitRepositoryInspector().inspect(missing)


def test_non_git_directory_is_rejected(tmp_path: Path) -> None:
    directory = tmp_path / "plain"
    directory.mkdir()

    with pytest.raises(InvalidRepositoryError):
        GitRepositoryInspector().inspect(directory)


def test_dirty_repository_is_not_modified(
    git_repository: Path,
) -> None:
    tracked = git_repository / "tracked.txt"
    untracked = git_repository / "untracked.txt"

    tracked.write_text("dirty tracked content\n")
    untracked.write_text("dirty untracked content\n")

    status_before = _git(
        git_repository,
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
    )
    tracked_before = tracked.read_bytes()
    untracked_before = untracked.read_bytes()

    GitRepositoryInspector().inspect(git_repository)

    status_after = _git(
        git_repository,
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
    )

    assert status_after == status_before
    assert tracked.read_bytes() == tracked_before
    assert untracked.read_bytes() == untracked_before


def test_symlink_resolves_to_same_repository_identity(
    git_repository: Path,
    tmp_path: Path,
) -> None:
    alias = tmp_path / "repository-alias"
    alias.symlink_to(git_repository, target_is_directory=True)

    inspector = GitRepositoryInspector()

    original = inspector.inspect(git_repository)
    via_alias = inspector.inspect(alias)

    assert original.repository_identity == via_alias.repository_identity
