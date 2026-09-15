"""Project Registry application service."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from agent_office.application.projects.errors import (
    DuplicateProjectError,
    ProjectNotFoundError,
)
from agent_office.application.projects.ports import (
    ProjectRepository,
    RepositoryInspector,
)
from agent_office.domain import (
    ExecutorId,
    Project,
    ProjectId,
    ProjectStatus,
    WorkflowDefinitionId,
    utc_now,
)

ProjectIdFactory = Callable[[], ProjectId]
Clock = Callable[[], datetime]


class ProjectService:
    """Coordinates Project registration and lifecycle operations."""

    def __init__(
        self,
        repository: ProjectRepository,
        inspector: RepositoryInspector,
        *,
        project_id_factory: ProjectIdFactory = ProjectId.new,
        clock: Clock = utc_now,
    ) -> None:
        self._repository = repository
        self._inspector = inspector
        self._project_id_factory = project_id_factory
        self._clock = clock

    def register_project(
        self,
        *,
        name: str,
        repository_path: str | Path,
        preferred_executor_id: ExecutorId | None = None,
        default_workflow_id: WorkflowDefinitionId | None = None,
    ) -> Project:
        inspection = self._inspector.inspect(Path(repository_path))

        existing = self._repository.find_by_repository_identity(inspection.repository_identity)

        if existing is not None:
            raise DuplicateProjectError("Repository is already registered")

        now = utc_now(self._clock)

        project = Project(
            id=self._project_id_factory(),
            name=name,
            repository_path=inspection.repository_path,
            repository_identity=inspection.repository_identity,
            default_branch=inspection.default_branch,
            preferred_executor_id=preferred_executor_id,
            default_workflow_id=default_workflow_id,
            status=ProjectStatus.ACTIVE,
            created_at=now,
            updated_at=now,
        )

        self._repository.add(project)
        return project

    def get_project(self, project_id: ProjectId) -> Project:
        project = self._repository.get(project_id)

        if project is None:
            raise ProjectNotFoundError(f"Project {project_id} was not found")

        return project

    def list_projects(self) -> tuple[Project, ...]:
        return self._repository.list_all()

    def archive_project(self, project_id: ProjectId) -> Project:
        project = self.get_project(project_id)

        if project.status is ProjectStatus.ARCHIVED:
            return project

        archived = project.archive(self._clock())
        self._repository.save(archived)

        return archived
