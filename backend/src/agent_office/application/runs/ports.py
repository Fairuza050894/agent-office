"""Application ports for Run and stage management."""

from __future__ import annotations

from typing import Protocol

from agent_office.domain import Run, RunId, RunStageState, StageKey, TaskId


class RunRepository(Protocol):
    def add(self, run: Run) -> None:
        """Persist a new Run."""
        ...

    def update(self, run: Run) -> None:
        """Persist the current lifecycle state of an existing Run."""
        ...

    def get(self, run_id: RunId) -> Run | None:
        """Return a Run by ID."""
        ...

    def list_by_task(self, task_id: TaskId) -> tuple[Run, ...]:
        """Return all Runs for a Task, ordered by creation time."""
        ...

    def list_non_terminal(self) -> tuple[Run, ...]:
        """Return every Run that has not reached a terminal status."""
        ...


class RunStageRepository(Protocol):
    """Persistence boundary for stage runtime state."""

    def add_many(self, stages: tuple[RunStageState, ...]) -> None:
        """Persist the initial stage runtime state for a Run."""
        ...

    def update(self, stage: RunStageState) -> None:
        """Persist the current state of one Run stage."""
        ...

    def get(self, run_id: RunId, stage_key: StageKey) -> RunStageState | None:
        """Return one Run stage."""
        ...

    def list_by_run(self, run_id: RunId) -> tuple[RunStageState, ...]:
        """Return all stages of a Run ordered by declared order hint."""
        ...
