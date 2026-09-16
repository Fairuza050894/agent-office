"""Safe HTTP DTOs for Run management."""

from __future__ import annotations

from datetime import datetime
from typing import Self

from pydantic import BaseModel

from agent_office.domain import Run, RunStatus


class CreateRunRequest(BaseModel):
    """Request to create a new Run from a Task."""

    requested_executor_id: str | None = None


class RunResponse(BaseModel):
    """Public Run representation — no filesystem or internal details."""

    id: str
    project_id: str
    task_id: str
    status: RunStatus
    requested_executor_id: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_domain(cls, run: Run) -> Self:
        return cls(
            id=str(run.id),
            project_id=str(run.project_id),
            task_id=str(run.task_id),
            status=run.status,
            requested_executor_id=(
                None if run.requested_executor_id is None else str(run.requested_executor_id)
            ),
            created_at=run.created_at,
            updated_at=run.updated_at,
        )
