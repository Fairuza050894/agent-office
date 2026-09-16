"""Run application service."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime

from agent_office.application.projects.errors import ProjectNotFoundError
from agent_office.application.projects.ports import ProjectRepository
from agent_office.application.runs.errors import (
    OwnershipError,
    ProjectArchivedError,
    RunNotFoundError,
)
from agent_office.application.runs.ports import RunRepository
from agent_office.application.tasks.errors import TaskNotFoundError
from agent_office.application.tasks.ports import TaskRepository
from agent_office.domain import (
    ExecutorId,
    ProjectId,
    ProjectStatus,
    Run,
    RunId,
    RunStatus,
    TaskId,
    utc_now,
)

RunIdFactory = Callable[[], RunId]
Clock = Callable[[], datetime]


class RunService:
    """Coordinates Run creation and query operations.

    Ownership invariants enforced here:

    * A Run may only be created when the Project is ACTIVE.
    * ``Run.project_id`` must equal the owning Task's ``project_id``.
    * Runs are durable control-plane state only at Phase 2 — no workflow
      orchestration is started.
    """

    def __init__(
        self,
        run_repository: RunRepository,
        task_repository: TaskRepository,
        project_repository: ProjectRepository,
        *,
        run_id_factory: RunIdFactory = RunId.new,
        clock: Clock = utc_now,
    ) -> None:
        self._run_repository = run_repository
        self._task_repository = task_repository
        self._project_repository = project_repository
        self._run_id_factory = run_id_factory
        self._clock = clock

    def create_run(
        self,
        *,
        task_id: TaskId,
        requested_executor_id: ExecutorId | None = None,
    ) -> Run:
        """Create and persist a new Run for the given Task.

        Raises:
            TaskNotFoundError: if the Task does not exist.
            ProjectNotFoundError: if the owning Project does not exist.
            ProjectArchivedError: if the owning Project is archived.
        """
        task = self._task_repository.get(task_id)

        if task is None:
            raise TaskNotFoundError(f"Task {task_id} was not found")

        project = self._project_repository.get(task.project_id)

        if project is None:
            raise ProjectNotFoundError(f"Project {task.project_id} was not found")

        if project.status is ProjectStatus.ARCHIVED:
            raise ProjectArchivedError(
                f"Project {task.project_id} is archived and cannot accept new Runs"
            )

        now = utc_now(self._clock)

        run = Run(
            id=self._run_id_factory(),
            project_id=task.project_id,
            task_id=task_id,
            status=RunStatus.CREATED,
            requested_executor_id=requested_executor_id,
            created_at=now,
            updated_at=now,
        )

        self._run_repository.add(run)
        return run

    def get_run(self, run_id: RunId) -> Run:
        """Return a Run by ID.

        Raises:
            RunNotFoundError: if the Run does not exist.
        """
        run = self._run_repository.get(run_id)

        if run is None:
            raise RunNotFoundError(f"Run {run_id} was not found")

        return run

    def list_runs(self, task_id: TaskId) -> tuple[Run, ...]:
        """Return all Runs for a Task."""
        return self._run_repository.list_by_task(task_id)

    def validate_run_ownership(
        self,
        run_id: RunId,
        expected_project_id: ProjectId,
    ) -> Run:
        """Return the Run only if it belongs to the expected Project.

        Raises:
            RunNotFoundError: if the Run does not exist.
            OwnershipError: if the Run belongs to a different Project.
        """
        run = self.get_run(run_id)

        if run.project_id != expected_project_id:
            raise OwnershipError(f"Run {run_id} does not belong to Project {expected_project_id}")

        return run
