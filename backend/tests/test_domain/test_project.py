"""Tests for Project domain primitives."""

from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import pytest

from agent_office.domain import (
    DomainInvariantError,
    Project,
    ProjectId,
    ProjectStatus,
    RepositoryIdentity,
    ensure_project_allows_new_run,
)


def test_project_status_values_match_domain_contract() -> None:
    assert set(ProjectStatus) == {
        ProjectStatus.ACTIVE,
        ProjectStatus.ARCHIVED,
    }


def test_active_project_allows_new_run() -> None:
    ensure_project_allows_new_run(ProjectStatus.ACTIVE)


def test_archived_project_rejects_new_run() -> None:
    with pytest.raises(
        DomainInvariantError,
        match="Archived Projects",
    ):
        ensure_project_allows_new_run(ProjectStatus.ARCHIVED)


def _project(status: ProjectStatus = ProjectStatus.ACTIVE) -> Project:
    created = datetime(2026, 9, 15, 1, 0, tzinfo=UTC)
    archived = datetime(2026, 9, 15, 2, 0, tzinfo=UTC) if status is ProjectStatus.ARCHIVED else None

    return Project(
        id=ProjectId(UUID("11111111-1111-4111-8111-111111111111")),
        name="Agent Office",
        repository_path=Path("/tmp/agent-office"),
        repository_identity=RepositoryIdentity(
            canonical_path=Path("/tmp/agent-office"),
            git_common_dir=Path("/tmp/agent-office/.git"),
        ),
        default_branch="main",
        preferred_executor_id=None,
        default_workflow_id=None,
        status=status,
        created_at=created,
        updated_at=archived or created,
        archived_at=archived,
    )


def test_project_archive_preserves_identity() -> None:
    project = _project()
    archived_at = datetime(2026, 9, 15, 2, 0, tzinfo=UTC)

    archived = project.archive(archived_at)

    assert archived.id == project.id
    assert archived.repository_identity == project.repository_identity
    assert archived.status is ProjectStatus.ARCHIVED
    assert archived.archived_at == archived_at


def test_project_archive_is_idempotent() -> None:
    project = _project(ProjectStatus.ARCHIVED)

    assert project.archived_at is not None
    assert project.archive(project.archived_at) is project
