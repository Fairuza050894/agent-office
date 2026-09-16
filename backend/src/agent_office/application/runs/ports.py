"""Application ports for Run management."""

from __future__ import annotations

from typing import Protocol

from agent_office.domain import Run, RunId, TaskId


class RunRepository(Protocol):
    def add(self, run: Run) -> None:
        """Persist a new Run."""
        ...

    def get(self, run_id: RunId) -> Run | None:
        """Return a Run by ID."""
        ...

    def list_by_task(self, task_id: TaskId) -> tuple[Run, ...]:
        """Return all Runs for a Task, ordered by creation time."""
        ...
