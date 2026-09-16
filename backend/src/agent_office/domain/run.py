"""Run lifecycle primitives."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.identifiers import ExecutorId, ProjectId, RunId, TaskId
from agent_office.domain.timestamps import to_utc


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


def is_terminal_run_status(status: RunStatus) -> bool:
    """Return whether a Run status is terminal."""

    return status in TERMINAL_RUN_STATUSES


def ensure_run_transition_allowed(
    current: RunStatus,
    target: RunStatus,
) -> None:
    """Enforce the currently specified Run terminality invariant.

    The specification does not yet define a complete transition graph, so this
    primitive deliberately enforces only the explicit rule that a terminal Run
    cannot become active again.
    """

    if is_terminal_run_status(current) and current is not target:
        raise DomainInvariantError(
            f"Terminal Run status cannot transition to a different state: {current} -> {target}"
        )


@dataclass(frozen=True, slots=True)
class Run:
    """One execution attempt of a Task.

    A Run is durable control-plane state only at creation time.
    Workflow orchestration, AgentRuns, and Events are out of scope for Phase 2.

    Invariants:
    1. Every Run belongs to exactly one Task.
    2. ``project_id`` must equal the owning Task's Project — enforced by the
       application service, not the dataclass, because the Task is a separate
       aggregate.
    3. A terminal Run cannot be reactivated (enforced via
       ``ensure_run_transition_allowed``).
    """

    id: RunId
    project_id: ProjectId
    task_id: TaskId
    status: RunStatus
    requested_executor_id: ExecutorId | None
    created_at: datetime
    updated_at: datetime

    def __post_init__(self) -> None:
        created_at = to_utc(self.created_at)
        updated_at = to_utc(self.updated_at)

        if updated_at < created_at:
            raise DomainInvariantError("Run updated_at must not precede created_at")

        object.__setattr__(self, "created_at", created_at)
        object.__setattr__(self, "updated_at", updated_at)
