"""Task application service."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime

from agent_office.application.projects.errors import ProjectNotFoundError
from agent_office.application.projects.ports import ProjectRepository
from agent_office.application.tasks.errors import TaskNotFoundError
from agent_office.application.tasks.ports import TaskRepository
from agent_office.domain import ExecutorId, ProjectId, Task, TaskId, WorkflowDefinitionId, utc_now

TaskIdFactory = Callable[[], TaskId]
Clock = Callable[[], datetime]


class TaskService:
    """Coordinates Task creation and query operations."""

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
