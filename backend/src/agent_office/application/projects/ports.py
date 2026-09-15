"""Application ports for Project Registry."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from agent_office.domain import (
    Project,
    ProjectId,
    RepositoryIdentity,
)


@dataclass(frozen=True, slots=True)
class RepositoryInspection:
    """Read-only metadata detected from a local Git repository."""

    repository_path: Path
    repository_identity: RepositoryIdentity
    default_branch: str


class RepositoryInspector(Protocol):
    def inspect(self, path: Path) -> RepositoryInspection:
        """Inspect a repository without modifying it."""
        ...


class ProjectRepository(Protocol):
    def add(self, project: Project) -> None:
        """Persist a new Project."""
        ...

    def get(self, project_id: ProjectId) -> Project | None:
        """Return a Project by ID."""
        ...

    def find_by_repository_identity(
        self,
        identity: RepositoryIdentity,
    ) -> Project | None:
        """Find an already registered repository."""
        ...

    def list_all(self) -> tuple[Project, ...]:
        """Return all Projects, including archived Projects."""
        ...

    def save(self, project: Project) -> None:
        """Persist mutable Project state without changing repository identity."""
        ...
