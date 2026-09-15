"""Project domain model and invariants."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
from enum import StrEnum
from pathlib import Path

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.identifiers import (
    ExecutorId,
    ProjectId,
    WorkflowDefinitionId,
)
from agent_office.domain.timestamps import to_utc


class ProjectStatus(StrEnum):
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"


@dataclass(frozen=True, slots=True)
class RepositoryIdentity:
    """Stable identity of one registered Git repository."""

    canonical_path: Path
    git_common_dir: Path

    def __post_init__(self) -> None:
        if not self.canonical_path.is_absolute():
            raise DomainInvariantError("Repository canonical_path must be absolute")

        if not self.git_common_dir.is_absolute():
            raise DomainInvariantError("Repository git_common_dir must be absolute")


@dataclass(frozen=True, slots=True)
class Project:
    """One software repository managed by Agent Office."""

    id: ProjectId
    name: str
    repository_path: Path
    repository_identity: RepositoryIdentity
    default_branch: str
    preferred_executor_id: ExecutorId | None
    default_workflow_id: WorkflowDefinitionId | None
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None = None

    def __post_init__(self) -> None:
        name = self.name.strip()
        branch = self.default_branch.strip()

        if not name:
            raise DomainInvariantError("Project name must not be empty")

        if not branch:
            raise DomainInvariantError("Project default branch must not be empty")

        if not self.repository_path.is_absolute():
            raise DomainInvariantError("Project repository_path must be absolute")

        if self.repository_path != self.repository_identity.canonical_path:
            raise DomainInvariantError(
                "Project repository_path must match canonical repository identity"
            )

        created_at = to_utc(self.created_at)
        updated_at = to_utc(self.updated_at)

        if updated_at < created_at:
            raise DomainInvariantError("Project updated_at must not precede created_at")

        archived_at = None if self.archived_at is None else to_utc(self.archived_at)

        if self.status is ProjectStatus.ACTIVE and archived_at is not None:
            raise DomainInvariantError("Active Project must not have archived_at")

        if self.status is ProjectStatus.ARCHIVED and archived_at is None:
            raise DomainInvariantError("Archived Project must have archived_at")

        if archived_at is not None and archived_at < created_at:
            raise DomainInvariantError("Project archived_at must not precede created_at")

        object.__setattr__(self, "name", name)
        object.__setattr__(self, "default_branch", branch)
        object.__setattr__(self, "created_at", created_at)
        object.__setattr__(self, "updated_at", updated_at)
        object.__setattr__(self, "archived_at", archived_at)

    def archive(self, archived_at: datetime) -> Project:
        """Archive the Project while preserving its identity and history."""

        if self.status is ProjectStatus.ARCHIVED:
            return self

        timestamp = to_utc(archived_at)

        if timestamp < self.created_at:
            raise DomainInvariantError("Project archive time must not precede creation")

        return replace(
            self,
            status=ProjectStatus.ARCHIVED,
            archived_at=timestamp,
            updated_at=timestamp,
        )


def ensure_project_allows_new_run(status: ProjectStatus) -> None:
    """Reject creation of new Runs for archived Projects."""

    if status is ProjectStatus.ARCHIVED:
        raise DomainInvariantError("Archived Projects cannot start new Runs")
