"""Task domain model and invariants."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.identifiers import (
    ExecutorId,
    ProjectId,
    TaskId,
    WorkflowDefinitionId,
)
from agent_office.domain.timestamps import to_utc


@dataclass(frozen=True, slots=True)
class Task:
    """User intent for one unit of work within a Project.

    A Task is stable and may have multiple Runs.  Its text is not overwritten
    by Run execution results.
    """

    id: TaskId
    project_id: ProjectId
    title: str
    objective: str
    constraints: str | None
    requested_workflow_id: WorkflowDefinitionId | None
    requested_executor_id: ExecutorId | None
    created_at: datetime
    updated_at: datetime

    def __post_init__(self) -> None:
        title = self.title.strip()
        objective = self.objective.strip()

        if not title:
            raise DomainInvariantError("Task title must not be empty")

        if not objective:
            raise DomainInvariantError("Task objective must not be empty")

        created_at = to_utc(self.created_at)
        updated_at = to_utc(self.updated_at)

        if updated_at < created_at:
            raise DomainInvariantError("Task updated_at must not precede created_at")

        # Normalise whitespace-only constraints to None
        constraints = self.constraints
        if constraints is not None:
            constraints = constraints.strip() or None

        object.__setattr__(self, "title", title)
        object.__setattr__(self, "objective", objective)
        object.__setattr__(self, "constraints", constraints)
        object.__setattr__(self, "created_at", created_at)
        object.__setattr__(self, "updated_at", updated_at)
