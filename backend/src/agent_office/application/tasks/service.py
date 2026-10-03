"""Task application service."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from datetime import datetime

from agent_office.application.projects.errors import ProjectNotFoundError
from agent_office.application.projects.ports import ProjectRepository
from agent_office.application.tasks.errors import TaskNotFoundError
from agent_office.application.tasks.ports import TaskRepository
from agent_office.domain import (
    DomainInvariantError,
    ExecutorId,
    ProjectId,
    RunId,
    Task,
    TaskId,
    WorkflowDefinitionId,
    utc_now,
)

TaskIdFactory = Callable[[], TaskId]
Clock = Callable[[], datetime]

MAX_HUMAN_REVIEW_FEEDBACK_LENGTH = 2000
MAX_TASK_CONSTRAINTS_LENGTH = 12000


class TaskService:
    """Coordinates Task creation, explicit intent amendments, and queries."""

    def __init__(
        self,
        task_repository: TaskRepository,
        project_repository: ProjectRepository,
        *,
        task_id_factory: TaskIdFactory = TaskId.new,
        clock: Clock = utc_now,
    ) -> None:
        self._task_repository = task_repository
        self._project_repository = project_repository
        self._task_id_factory = task_id_factory
        self._clock = clock

    def create_task(
        self,
        *,
        project_id: ProjectId,
        title: str,
        objective: str,
        constraints: str | None = None,
        requested_workflow_id: WorkflowDefinitionId | None = None,
        requested_executor_id: ExecutorId | None = None,
    ) -> Task:
        """Create and persist a new Task for the given Project.

        Raises:
            ProjectNotFoundError: if the Project does not exist.
        """
        project = self._project_repository.get(project_id)

        if project is None:
            raise ProjectNotFoundError(f"Project {project_id} was not found")

        now = utc_now(self._clock)

        task = Task(
            id=self._task_id_factory(),
            project_id=project_id,
            title=title,
            objective=objective,
            constraints=constraints,
            requested_workflow_id=requested_workflow_id,
            requested_executor_id=requested_executor_id,
            created_at=now,
            updated_at=now,
        )

        self._task_repository.add(task)
        return task

    def get_task(self, task_id: TaskId) -> Task:
        """Return a Task by ID.

        Raises:
            TaskNotFoundError: if the Task does not exist.
        """
        task = self._task_repository.get(task_id)

        if task is None:
            raise TaskNotFoundError(f"Task {task_id} was not found")

        return task

    def list_tasks(self, project_id: ProjectId) -> tuple[Task, ...]:
        """Return all Tasks for a Project."""
        return self._task_repository.list_by_project(project_id)

    def append_result_review_feedback(
        self,
        task_id: TaskId,
        *,
        source_run_id: RunId,
        feedback: str,
    ) -> Task:
        """Append explicit human review feedback as a bounded Task constraint.

        The Task objective is never rewritten. Human feedback is appended with a
        source-Run marker so the next Run receives it through the existing Task
        context, while the append-only AuditRecord remains the authoritative
        history of who requested the change and why.
        """

        normalized = " ".join(feedback.split()).strip()
        if not normalized:
            raise DomainInvariantError("Result review feedback must not be empty")
        if len(normalized) > MAX_HUMAN_REVIEW_FEEDBACK_LENGTH:
            raise DomainInvariantError("Result review feedback is too long")

        task = self.get_task(task_id)
        marker = f"[Human review after Run {source_run_id}]"
        amendment = f"{marker} {normalized}"
        current = task.constraints or ""

        # An idempotent repeated request must not duplicate the same amendment.
        if marker in current:
            return task

        combined = amendment if not current else f"{current}\n{amendment}"
        if len(combined) > MAX_TASK_CONSTRAINTS_LENGTH:
            raise DomainInvariantError("Task constraints are too large after review feedback")

        updated = replace(
            task,
            constraints=combined,
            updated_at=utc_now(self._clock),
        )
        self._task_repository.update(updated)
        return updated
