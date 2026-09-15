"""Safe HTTP DTOs for Project Registry."""

from __future__ import annotations

from datetime import datetime
from typing import Self

from pydantic import BaseModel, Field, field_validator

from agent_office.domain import Project, ProjectStatus


class RegisterProjectRequest(BaseModel):
    """Request to register one local Git repository."""

    name: str = Field(min_length=1, max_length=200)
    repository_path: str = Field(min_length=1)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()

        if not normalized:
            raise ValueError("Project name must not be blank")

        return normalized


class RepositorySummaryResponse(BaseModel):
    """Safe repository information suitable for HTTP responses."""

    name: str


class ProjectResponse(BaseModel):
    """Public Project representation without absolute filesystem details."""

    id: str
    name: str
    repository: RepositorySummaryResponse
    default_branch: str
    preferred_executor_id: str | None
    default_workflow_id: str | None
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None

    @classmethod
    def from_domain(cls, project: Project) -> Self:
        return cls(
            id=str(project.id),
            name=project.name,
            repository=RepositorySummaryResponse(
                name=project.repository_path.name,
            ),
            default_branch=project.default_branch,
            preferred_executor_id=(
                None
                if project.preferred_executor_id is None
                else str(project.preferred_executor_id)
            ),
            default_workflow_id=(
                None if project.default_workflow_id is None else str(project.default_workflow_id)
            ),
            status=project.status,
            created_at=project.created_at,
            updated_at=project.updated_at,
            archived_at=project.archived_at,
        )
