"""Run lifecycle primitives."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.identifiers import (
    ExecutorId,
    ProjectId,
    RunId,
    TaskId,
    WorkflowSnapshotId,
)
from agent_office.domain.timestamps import to_utc
from agent_office.domain.workflow import ChangeArea


class RunStatus(StrEnum):
    CREATED = "CREATED"
    PLANNING = "PLANNING"
    READY = "READY"
    RUNNING = "RUNNING"
    REVIEWING = "REVIEWING"
    REMEDIATING = "REMEDIATING"
    VERIFYING = "VERIFYING"
    COMPLETED = "COMPLETED"
    BLOCKED = "BLOCKED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


TERMINAL_RUN_STATUSES: frozenset[RunStatus] = frozenset(
    {
        RunStatus.COMPLETED,
        RunStatus.FAILED,
        RunStatus.CANCELLED,
    }
)


class RunReasonCode(StrEnum):
    """Machine-readable reasons for blocked or failed Run transitions."""

    EXECUTOR_UNAVAILABLE = "EXECUTOR_UNAVAILABLE"
    CONDITION_UNKNOWN = "CONDITION_UNKNOWN"
    DEPENDENCY_NOT_COMPLETE = "DEPENDENCY_NOT_COMPLETE"
    UNKNOWN_EXECUTION_STATE = "UNKNOWN_EXECUTION_STATE"
    CANCELLATION_REQUESTED = "CANCELLATION_REQUESTED"
    CANCELLATION_UNKNOWN = "CANCELLATION_UNKNOWN"
    REQUIRED_STAGE_FAILED = "REQUIRED_STAGE_FAILED"
    PROJECT_ARCHIVED = "PROJECT_ARCHIVED"
    ORCHESTRATION_STEP_LIMIT = "ORCHESTRATION_STEP_LIMIT"
    WORKFLOW_UNAVAILABLE = "WORKFLOW_UNAVAILABLE"


# A Run may move freely between the non-terminal workflow phases because the
# phase is a projection of which stages are currently active. Any non-terminal
# Run may also reach a terminal state. The important enforced rules are: a Run
# must be planned before it can execute or complete, and a terminal Run never
# becomes active again.
_PHASE_STATUSES: frozenset[RunStatus] = frozenset(
    {
        RunStatus.PLANNING,
        RunStatus.READY,
        RunStatus.RUNNING,
        RunStatus.REVIEWING,
        RunStatus.REMEDIATING,
        RunStatus.VERIFYING,
    }
)

_ACTIVE_RUN_TARGETS: frozenset[RunStatus] = (
    _PHASE_STATUSES | TERMINAL_RUN_STATUSES | {RunStatus.BLOCKED}
)

_ALLOWED_RUN_TRANSITIONS: dict[RunStatus, frozenset[RunStatus]] = {
    RunStatus.CREATED: frozenset(
        {
            RunStatus.PLANNING,
            RunStatus.BLOCKED,
            RunStatus.FAILED,
            RunStatus.CANCELLED,
        }
    ),
    **{status: _ACTIVE_RUN_TARGETS for status in _PHASE_STATUSES},
    RunStatus.BLOCKED: _ACTIVE_RUN_TARGETS,
    **{status: frozenset() for status in TERMINAL_RUN_STATUSES},
}


def is_terminal_run_status(status: RunStatus) -> bool:
    """Return whether a Run status is terminal."""

    return status in TERMINAL_RUN_STATUSES


def run_transition_allowed(
    current: RunStatus,
    target: RunStatus,
) -> bool:
    """Return whether a Run transition is permitted."""

    if current is target:
        return True

    return target in _ALLOWED_RUN_TRANSITIONS[current]


def ensure_run_transition_allowed(
    current: RunStatus,
    target: RunStatus,
) -> None:
    """Validate a Run transition.

    A terminal Run can never become a different status. Non-terminal Runs move
    between workflow phases freely, but must be planned before they execute.
    """

    if is_terminal_run_status(current) and current is not target:
        raise DomainInvariantError(
            f"Terminal Run status cannot transition to a different state: {current} -> {target}"
        )

    if not run_transition_allowed(current, target):
        raise DomainInvariantError(f"Invalid Run transition: {current} -> {target}")


@dataclass(frozen=True, slots=True)
class Run:
    """One execution attempt of a Task.

    Invariants:
    1. Every Run belongs to exactly one Task.
    2. ``project_id`` must equal the owning Task's Project — enforced by the
       application service, not the dataclass, because the Task is a separate
       aggregate.
    3. A terminal Run cannot be reactivated (enforced via
       ``ensure_run_transition_allowed``).
    4. ``workflow_snapshot_id`` is immutable once set.
    """

    id: RunId
    project_id: ProjectId
    task_id: TaskId
    status: RunStatus
    requested_executor_id: ExecutorId | None
    created_at: datetime
    updated_at: datetime
    workflow_snapshot_id: WorkflowSnapshotId | None = None
    resolved_executor_id: ExecutorId | None = None
    changed_areas: tuple[ChangeArea, ...] | None = None
    failure_code: RunReasonCode | None = None
    failure_summary: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    cancel_requested_at: datetime | None = None

    def __post_init__(self) -> None:
        created_at = to_utc(self.created_at)
        updated_at = to_utc(self.updated_at)

        if updated_at < created_at:
            raise DomainInvariantError("Run updated_at must not precede created_at")

        object.__setattr__(self, "created_at", created_at)
        object.__setattr__(self, "updated_at", updated_at)

        for field in ("started_at", "completed_at", "cancel_requested_at"):
            value = getattr(self, field)

            if value is not None:
                object.__setattr__(self, field, to_utc(value))

        if self.changed_areas is not None:
            if len(set(self.changed_areas)) != len(self.changed_areas):
                raise DomainInvariantError("Run changed areas must be unique")
