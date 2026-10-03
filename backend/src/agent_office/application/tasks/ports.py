"""Application ports for Task management."""

from __future__ import annotations

from typing import Protocol

from agent_office.domain import ProjectId, Task, TaskId


class TaskRepository(Protocol):
    def add(self, task: Task) -> None:
        """Persist a new Task."""
        ...

    def update(self, task: Task) -> None:
        """Persist an explicit human amendment to an existing Task."""
        ...

    def get(self, task_id: TaskId) -> Task | None:
        """Return a Task by ID."""
        ...

    def list_by_project(self, project_id: ProjectId) -> tuple[Task, ...]:
        """Return all Tasks for a Project, ordered by creation time."""
        ...
