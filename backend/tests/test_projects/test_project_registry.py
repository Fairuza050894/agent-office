"""Integration tests for Project Registry core."""

from __future__ import annotations

import subprocess
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import pytest

from agent_office.application.projects import (
    DuplicateProjectError,
    ProjectNotFoundError,
    ProjectService,
)
from agent_office.domain import ProjectId, ProjectStatus
from agent_office.infrastructure.git import GitRepositoryInspector
from agent_office.infrastructure.persistence import (
    SQLiteProjectRepository,
)
from agent_office.persistence import SQLiteDatabase


def _git(repository: Path, *arguments: str) -> None:
    subprocess.run(
        ["git", "-C", str(repository), *arguments],
        check=True,
        capture_output=True,
        text=True,
    )


@pytest.fixture
def git_repository(tmp_path: Path) -> Path:
    repository = tmp_path / "project repo"
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

    (repository / "README.md").write_text("# Project\n")
    _git(repository, "add", "README.md")
    _git(repository, "commit", "-m", "initial")

    return repository


@pytest.fixture
def project_service(
    tmp_path: Path,
) -> ProjectService:
    database = SQLiteDatabase(tmp_path / "registry.sqlite")
    database.initialize()

    repository = SQLiteProjectRepository(database)
    inspector = GitRepositoryInspector()

    fixed_id = ProjectId(UUID("44444444-4444-4444-8444-444444444444"))
    fixed_time = datetime(2026, 9, 15, 1, 0, tzinfo=UTC)

    return ProjectService(
        repository,
        inspector,
        project_id_factory=lambda: fixed_id,
        clock=lambda: fixed_time,
    )


def test_register_get_and_list_project(
    project_service: ProjectService,
    git_repository: Path,
) -> None:
    project = project_service.register_project(
        name="Example Project",
        repository_path=git_repository,
    )

    loaded = project_service.get_project(project.id)
    listed = project_service.list_projects()

    assert loaded == project
    assert listed == (project,)
    assert project.status is ProjectStatus.ACTIVE
    assert project.default_branch == "main"
    assert project.repository_path == git_repository.resolve()


def test_duplicate_repository_is_rejected(
    project_service: ProjectService,
    git_repository: Path,
) -> None:
    project_service.register_project(
        name="First",
        repository_path=git_repository,
    )

    with pytest.raises(DuplicateProjectError):
        project_service.register_project(
            name="Duplicate",
            repository_path=git_repository,
        )


def test_archive_project_is_persisted(
    project_service: ProjectService,
    git_repository: Path,
) -> None:
    project = project_service.register_project(
        name="Archive Me",
        repository_path=git_repository,
    )

    archived = project_service.archive_project(project.id)
    loaded = project_service.get_project(project.id)

    assert archived.status is ProjectStatus.ARCHIVED
    assert loaded.status is ProjectStatus.ARCHIVED
    assert loaded.archived_at is not None


def test_archive_is_idempotent(
    project_service: ProjectService,
    git_repository: Path,
) -> None:
    project = project_service.register_project(
        name="Archive Me",
        repository_path=git_repository,
    )

    first = project_service.archive_project(project.id)
    second = project_service.archive_project(project.id)

    assert second == first


def test_unknown_project_is_rejected(
    project_service: ProjectService,
) -> None:
    missing = ProjectId(UUID("55555555-5555-4555-8555-555555555555"))

    with pytest.raises(ProjectNotFoundError):
        project_service.get_project(missing)


def test_same_repository_via_symlink_is_rejected(
    project_service: ProjectService,
    git_repository: Path,
    tmp_path: Path,
) -> None:
    alias = tmp_path / "repository alias"
    alias.symlink_to(
        git_repository,
        target_is_directory=True,
    )

    project_service.register_project(
        name="Original",
        repository_path=git_repository,
    )

    with pytest.raises(DuplicateProjectError):
        project_service.register_project(
            name="Alias",
            repository_path=alias,
        )
