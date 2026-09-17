"""Runtime stage state primitives.

``RunStageState`` is the durable runtime state of one stage inside one Run.
Its identity is the (Run, StageKey) pair, so no competing identifier type is
introduced and the WorkflowSnapshot stays the immutable workflow authority.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.identifiers import ProjectId, RunId
from agent_office.domain.timestamps import to_utc
from agent_office.domain.workflow import StageCondition, StageExecutionMode, StageKey


class RunStageStatus(StrEnum):
    """Canonical stage runtime states."""

    PENDING = "PENDING"
    READY = "READY"
    RUNNING = "RUNNING"
    WAITING = "WAITING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    BLOCKED = "BLOCKED"
    SKIPPED = "SKIPPED"
    CANCELLED = "CANCELLED"


RUN_STAGE_TERMINAL_STATUSES: frozenset[RunStageStatus] = frozenset(
    {
        RunStageStatus.COMPLETED,
        RunStageStatus.FAILED,
        RunStageStatus.SKIPPED,
        RunStageStatus.CANCELLED,
    }
)


class StageReasonCode(StrEnum):
    """Machine-readable reason codes for blocked or skipped stage transitions."""

    DEPENDENCY_NOT_COMPLETE = "DEPENDENCY_NOT_COMPLETE"
    CONDITION_FALSE = "CONDITION_FALSE"
    CONDITION_UNKNOWN = "CONDITION_UNKNOWN"
    REQUIRED_AGENT_FAILED = "REQUIRED_AGENT_FAILED"
    OPTIONAL_AGENT_FAILED = "OPTIONAL_AGENT_FAILED"
    UNKNOWN_EXECUTION_STATE = "UNKNOWN_EXECUTION_STATE"
    EXECUTOR_WAITING = "EXECUTOR_WAITING"
    RUN_CANCELLED = "RUN_CANCELLED"
    NOT_APPLICABLE = "NOT_APPLICABLE"
    AWAITING_REMEDIATION = "AWAITING_REMEDIATION"
    AWAITING_REVIEW = "AWAITING_REVIEW"
    REMEDIATION_FAILED = "REMEDIATION_FAILED"
    REMEDIATION_BOUND_EXCEEDED = "REMEDIATION_BOUND_EXCEEDED"
    VERIFICATION_FAILED = "VERIFICATION_FAILED"


_ALLOWED_STAGE_TRANSITIONS: dict[RunStageStatus, frozenset[RunStageStatus]] = {
    RunStageStatus.PENDING: frozenset(
        {
            RunStageStatus.READY,
            RunStageStatus.SKIPPED,
            RunStageStatus.BLOCKED,
            RunStageStatus.CANCELLED,
            RunStageStatus.FAILED,
        }
    ),
    RunStageStatus.READY: frozenset(
        {
            RunStageStatus.RUNNING,
            RunStageStatus.SKIPPED,
            RunStageStatus.BLOCKED,
            RunStageStatus.CANCELLED,
            RunStageStatus.FAILED,
        }
    ),
    RunStageStatus.RUNNING: frozenset(
        {
            RunStageStatus.WAITING,
            RunStageStatus.COMPLETED,
            RunStageStatus.FAILED,
            RunStageStatus.BLOCKED,
            RunStageStatus.CANCELLED,
        }
    ),
    RunStageStatus.WAITING: frozenset(
        {
            # A stage waiting on review/remediation re-enters execution when the
            # other half of the loop finishes, so READY is reachable again.
            RunStageStatus.READY,
            RunStageStatus.RUNNING,
            RunStageStatus.COMPLETED,
            RunStageStatus.FAILED,
            RunStageStatus.BLOCKED,
            RunStageStatus.CANCELLED,
        }
    ),
    # BLOCKED stays non-terminal so a Run may continue after the blocking
    # condition is addressed.
    RunStageStatus.BLOCKED: frozenset(
        {
            RunStageStatus.READY,
            RunStageStatus.RUNNING,
            RunStageStatus.WAITING,
            RunStageStatus.COMPLETED,
            RunStageStatus.FAILED,
            RunStageStatus.SKIPPED,
            RunStageStatus.CANCELLED,
        }
    ),
    RunStageStatus.COMPLETED: frozenset(),
    RunStageStatus.FAILED: frozenset(),
    RunStageStatus.SKIPPED: frozenset(),
    RunStageStatus.CANCELLED: frozenset(),
}


def is_terminal_run_stage_status(status: RunStageStatus) -> bool:
    """Return whether a stage runtime status is terminal."""

    return status in RUN_STAGE_TERMINAL_STATUSES


def run_stage_transition_allowed(
    current: RunStageStatus,
    target: RunStageStatus,
) -> bool:
    """Return whether a stage transition is permitted."""

    if current is target:
        return True

    return target in _ALLOWED_STAGE_TRANSITIONS[current]


def ensure_run_stage_transition_allowed(
    current: RunStageStatus,
    target: RunStageStatus,
) -> None:
    """Validate a stage transition, failing safely when invalid."""

    if current is target:
        return

    if not run_stage_transition_allowed(current, target):
        raise DomainInvariantError(f"Invalid stage transition: {current} -> {target}")


@dataclass(frozen=True, slots=True)
class RunStageState:
    """Durable runtime state of one workflow stage inside one Run."""

    run_id: RunId
    project_id: ProjectId
    stage_key: StageKey
    status: RunStageStatus
    required: bool
    order_hint: int
    execution_mode: StageExecutionMode
    condition: StageCondition
    created_at: datetime
    updated_at: datetime
    reason_code: StageReasonCode | None = None
    reason_summary: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None

    def __post_init__(self) -> None:
        if self.order_hint < 0:
            raise DomainInvariantError("Stage order hint must not be negative")

        created_at = to_utc(self.created_at)
        updated_at = to_utc(self.updated_at)

        if updated_at < created_at:
            raise DomainInvariantError("RunStageState updated_at must not precede created_at")

        object.__setattr__(self, "created_at", created_at)
        object.__setattr__(self, "updated_at", updated_at)

        if self.started_at is not None:
            object.__setattr__(self, "started_at", to_utc(self.started_at))

        if self.completed_at is not None:
            object.__setattr__(self, "completed_at", to_utc(self.completed_at))
