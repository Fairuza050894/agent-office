"""Run application service."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from datetime import datetime

from agent_office.application.events.service import EventService
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
    ChangeArea,
    EventSource,
    EventType,
    ExecutorId,
    ProjectId,
    ProjectStatus,
    Run,
    RunId,
    RunReasonCode,
    RunStatus,
    TaskId,
    WorkflowSnapshotId,
    ensure_run_transition_allowed,
    is_terminal_run_status,
    utc_now,
)

RunIdFactory = Callable[[], RunId]
Clock = Callable[[], datetime]


class RunService:
    """Coordinates Run creation, lifecycle transitions, and query operations.

    Ownership invariants enforced here:

    * A Run may only be created when the Project is ACTIVE.
    * ``Run.project_id`` must equal the owning Task's ``project_id``.
    * ``workflow_snapshot_id`` is written once and never changes afterwards.
    """

    def __init__(
        self,
        run_repository: RunRepository,
        task_repository: TaskRepository,
        project_repository: ProjectRepository,
        event_service: EventService,
        *,
        run_id_factory: RunIdFactory = RunId.new,
        clock: Clock = utc_now,
    ) -> None:
        self._run_repository = run_repository
        self._task_repository = task_repository
        self._project_repository = project_repository
        self._event_service = event_service
        self._run_id_factory = run_id_factory
        self._clock = clock

    def create_run(
        self,
        *,
        task_id: TaskId,
        requested_executor_id: ExecutorId | None = None,
    ) -> Run:
        """Create and persist a new Run for the given Task.

        Creating a Run records an execution attempt only. It never starts
        workflow orchestration or an AI executor.

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

        self._event_service.emit(
            run,
            EventType.RUN_CREATED,
            source=EventSource.USER,
            payload=(("task_id", str(run.task_id)),),
        )

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

    def transition(
        self,
        run: Run,
        target: RunStatus,
        *,
        reason_code: RunReasonCode | None = None,
        reason_summary: str | None = None,
    ) -> Run:
        """Apply a validated Run transition and persist the result."""

        ensure_run_transition_allowed(run.status, target)

        if run.status is target:
            return run

        now = utc_now(self._clock)

        updated = replace(
            run,
            status=target,
            failure_code=reason_code,
            failure_summary=reason_summary,
            updated_at=now,
            completed_at=now if is_terminal_run_status(target) else run.completed_at,
        )

        self._run_repository.update(updated)
        return updated

    def attach_execution(
        self,
        run: Run,
        *,
        snapshot_id: WorkflowSnapshotId,
        resolved_executor_id: ExecutorId | None,
        changed_areas: tuple[ChangeArea, ...] | None,
    ) -> Run:
        """Record the frozen workflow and resolved Executor on a Run.

        The workflow snapshot reference is immutable: once written it is never
        replaced, so a later WorkflowDefinition edit cannot alter this Run.
        """

        now = utc_now(self._clock)

        updated = replace(
            run,
            workflow_snapshot_id=(
                run.workflow_snapshot_id if run.workflow_snapshot_id is not None else snapshot_id
            ),
            resolved_executor_id=resolved_executor_id,
            changed_areas=changed_areas,
            started_at=run.started_at if run.started_at is not None else now,
            updated_at=now,
        )

        self._run_repository.update(updated)
        return updated

    def record_cancel_request(self, run: Run) -> Run:
        """Record that cancellation was requested, without claiming it happened."""

        if run.cancel_requested_at is not None:
            return run

        now = utc_now(self._clock)

        updated = replace(
            run,
            cancel_requested_at=now,
            updated_at=now,
        )

        self._run_repository.update(updated)
        return updated
