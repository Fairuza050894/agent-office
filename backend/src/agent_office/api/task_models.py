"""Safe HTTP DTOs for Task management."""

from __future__ import annotations

from datetime import datetime
from typing import Self

from pydantic import BaseModel, Field

from agent_office.domain import Task


class CreateTaskRequest(BaseModel):
    """Request to create a new Task under a Project."""

    title: str = Field(min_length=1, max_length=500)
    objective: str = Field(min_length=1)
    constraints: str | None = None
    requested_workflow_id: str | None = None
    requested_executor_id: str | None = None


class TaskResponse(BaseModel):
    """Public Task representation — no filesystem or internal details."""

    id: str
    project_id: str
    title: str
    objective: str
    constraints: str | None
    requested_workflow_id: str | None
    requested_executor_id: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_domain(cls, task: Task) -> Self:
        return cls(
            id=str(task.id),
            project_id=str(task.project_id),
            title=task.title,
            objective=task.objective,
            constraints=task.constraints,
            requested_workflow_id=(
                None if task.requested_workflow_id is None else str(task.requested_workflow_id)
            ),
            requested_executor_id=(
                None if task.requested_executor_id is None else str(task.requested_executor_id)
            ),
            created_at=task.created_at,
            updated_at=task.updated_at,
        )
