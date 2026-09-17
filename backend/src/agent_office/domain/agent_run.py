"""AgentRun primitives.

An AgentRun is one concrete execution of one AgentProfile within one stage of
one Run. Agent responsibility (AgentProfile) and execution technology
(Executor) remain separate concepts.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.executor import (
    CapabilityReport,
    ExecutionOutcome,
    ExecutorSessionRef,
)
from agent_office.domain.identifiers import (
    AgentProfileId,
    AgentRunId,
    ExecutorId,
    ProjectId,
    RunId,
    WorkspaceId,
)
from agent_office.domain.review import ReviewVerdict
from agent_office.domain.timestamps import to_utc
from agent_office.domain.workflow import AgentAccessMode, StageKey


class AgentRunStatus(StrEnum):
    """Canonical AgentRun lifecycle states."""

    PENDING = "PENDING"
    STARTING = "STARTING"
    RUNNING = "RUNNING"
    WAITING = "WAITING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    BLOCKED = "BLOCKED"
    CANCELLED = "CANCELLED"


AGENT_RUN_TERMINAL_STATUSES: frozenset[AgentRunStatus] = frozenset(
    {
        AgentRunStatus.COMPLETED,
        AgentRunStatus.FAILED,
        AgentRunStatus.CANCELLED,
    }
)


class AgentRunReasonCode(StrEnum):
    """Controlled AgentRun reason codes for failures and unresolved states."""

    EXECUTOR_START_FAILED = "EXECUTOR_START_FAILED"
    EXECUTOR_START_UNKNOWN = "EXECUTOR_START_UNKNOWN"
    EXECUTION_FAILED = "EXECUTION_FAILED"
    EXECUTION_RESULT_UNKNOWN = "EXECUTION_RESULT_UNKNOWN"
    EXECUTION_STATUS_UNKNOWN = "EXECUTION_STATUS_UNKNOWN"
    EXECUTOR_WAITING = "EXECUTOR_WAITING"
    REQUIRED_CAPABILITY_UNSUPPORTED = "REQUIRED_CAPABILITY_UNSUPPORTED"
    CANCELLATION_REQUESTED_UNCONFIRMED = "CANCELLATION_REQUESTED_UNCONFIRMED"
    CANCELLATION_CONFIRMED = "CANCELLATION_CONFIRMED"
    CANCELLATION_UNKNOWN = "CANCELLATION_UNKNOWN"
    CANCELLATION_UNSUPPORTED = "CANCELLATION_UNSUPPORTED"
    WORKSPACE_UNAVAILABLE = "WORKSPACE_UNAVAILABLE"


class FailureRetryability(StrEnum):
    """Provider-neutral classification of an operational failure.

    ``UNKNOWN`` never authorises an automatic retry: an outcome that cannot be
    classified safely must not be retried, because a retry could duplicate an
    external side effect whose status is unproven.
    """

    RETRYABLE = "RETRYABLE"
    NOT_RETRYABLE = "NOT_RETRYABLE"
    UNKNOWN = "UNKNOWN"


# Only pre-start operational failures can be retried automatically. A failure
# after work began may already have produced side effects, and an UNKNOWN
# outcome is never treated as safe to repeat (WORKFLOW_CONTRACT §46).
_RETRYABLE_REASON_CODES: frozenset[AgentRunReasonCode] = frozenset(
    {AgentRunReasonCode.EXECUTOR_START_FAILED}
)

_UNKNOWN_OUTCOME_REASON_CODES: frozenset[AgentRunReasonCode] = frozenset(
    {
        AgentRunReasonCode.EXECUTOR_START_UNKNOWN,
        AgentRunReasonCode.EXECUTION_STATUS_UNKNOWN,
        AgentRunReasonCode.EXECUTION_RESULT_UNKNOWN,
        AgentRunReasonCode.CANCELLATION_UNKNOWN,
        AgentRunReasonCode.CANCELLATION_UNSUPPORTED,
        AgentRunReasonCode.CANCELLATION_REQUESTED_UNCONFIRMED,
    }
)


def classify_failure_retryability(
    reason_code: AgentRunReasonCode | None,
    *,
    executor_retryable: bool | None = None,
) -> FailureRetryability:
    """Classify whether an operational failure may be retried automatically.

    The classifier is deliberately conservative and provider-neutral:

    * an UNKNOWN outcome is never retryable, whatever the executor claims;
    * a failure after execution began is never retried automatically;
    * a pre-start failure is retryable only when the Executor explicitly
      reported ``retryable=True``.
    """

    if reason_code is None:
        return FailureRetryability.UNKNOWN

    if reason_code in _UNKNOWN_OUTCOME_REASON_CODES:
        return FailureRetryability.UNKNOWN

    if reason_code not in _RETRYABLE_REASON_CODES:
        return FailureRetryability.NOT_RETRYABLE

    if executor_retryable is True:
        return FailureRetryability.RETRYABLE

    return FailureRetryability.NOT_RETRYABLE


_ALLOWED_AGENT_RUN_TRANSITIONS: dict[AgentRunStatus, frozenset[AgentRunStatus]] = {
    AgentRunStatus.PENDING: frozenset(
        {
            AgentRunStatus.STARTING,
            AgentRunStatus.BLOCKED,
            AgentRunStatus.CANCELLED,
        }
    ),
    AgentRunStatus.STARTING: frozenset(
        {
            AgentRunStatus.RUNNING,
            AgentRunStatus.WAITING,
            AgentRunStatus.FAILED,
            AgentRunStatus.BLOCKED,
            AgentRunStatus.CANCELLED,
        }
    ),
    AgentRunStatus.RUNNING: frozenset(
        {
            AgentRunStatus.WAITING,
            AgentRunStatus.COMPLETED,
            AgentRunStatus.FAILED,
            AgentRunStatus.BLOCKED,
            AgentRunStatus.CANCELLED,
        }
    ),
    AgentRunStatus.WAITING: frozenset(
        {
            AgentRunStatus.RUNNING,
            AgentRunStatus.COMPLETED,
            AgentRunStatus.FAILED,
            AgentRunStatus.BLOCKED,
            AgentRunStatus.CANCELLED,
        }
    ),
    # BLOCKED stays non-terminal so unresolved execution can be reconciled.
    AgentRunStatus.BLOCKED: frozenset(
        {
            AgentRunStatus.RUNNING,
            AgentRunStatus.WAITING,
            AgentRunStatus.COMPLETED,
            AgentRunStatus.FAILED,
            AgentRunStatus.CANCELLED,
        }
    ),
    AgentRunStatus.COMPLETED: frozenset(),
    AgentRunStatus.FAILED: frozenset(),
    AgentRunStatus.CANCELLED: frozenset(),
}


def is_terminal_agent_run_status(status: AgentRunStatus) -> bool:
    """Return whether an AgentRun status is terminal."""

    return status in AGENT_RUN_TERMINAL_STATUSES


def agent_run_transition_allowed(
    current: AgentRunStatus,
    target: AgentRunStatus,
) -> bool:
    """Return whether an AgentRun transition is permitted."""

    if current is target:
        return True

    return target in _ALLOWED_AGENT_RUN_TRANSITIONS[current]


def ensure_agent_run_transition_allowed(
    current: AgentRunStatus,
    target: AgentRunStatus,
) -> None:
    """Validate an AgentRun transition, failing safely when invalid."""

    if current is target:
        return

    if is_terminal_agent_run_status(current):
        raise DomainInvariantError(
            "Terminal AgentRun status cannot transition to a different state: "
            f"{current} -> {target}"
        )

    if not agent_run_transition_allowed(current, target):
        raise DomainInvariantError(f"Invalid AgentRun transition: {current} -> {target}")


@dataclass(frozen=True, slots=True)
class AgentRun:
    """One concrete execution instance of one AgentProfile within one Run."""

    id: AgentRunId
    run_id: RunId
    project_id: ProjectId
    stage_key: StageKey
    agent_profile_id: AgentProfileId
    agent_profile_key: str
    agent_profile_version: int
    executor_id: ExecutorId
    access_mode: AgentAccessMode
    status: AgentRunStatus
    attempt: int
    created_at: datetime
    updated_at: datetime
    executor_session_ref: ExecutorSessionRef | None = None
    capability_snapshot: CapabilityReport | None = None
    result_outcome: ExecutionOutcome | None = None
    result_summary: str | None = None
    reason_code: AgentRunReasonCode | None = None
    reason_summary: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    retry_of_agent_run_id: AgentRunId | None = None
    workspace_id: WorkspaceId | None = None
    remediation_cycle: int = 0
    review_verdict: ReviewVerdict | None = None
    # The Executor's explicit retryability claim, recorded verbatim. A missing
    # claim is not treated as retryable.
    failure_retryable: bool | None = None

    def __post_init__(self) -> None:
        if self.attempt < 1:
            raise DomainInvariantError("AgentRun attempt must be at least 1")

        if self.remediation_cycle < 0:
            raise DomainInvariantError("AgentRun remediation cycle must not be negative")

        if self.retry_of_agent_run_id is not None:
            if self.attempt < 2:
                raise DomainInvariantError("Only a retry attempt may reference a previous AgentRun")

            if self.retry_of_agent_run_id == self.id:
                raise DomainInvariantError("An AgentRun must not retry itself")

        if not self.agent_profile_key.strip():
            raise DomainInvariantError("AgentRun must reference an AgentProfile key")

        if self.agent_profile_version < 1:
            raise DomainInvariantError("AgentRun AgentProfile version must be at least 1")

        if self.executor_session_ref is not None:
            if self.executor_session_ref.executor_id != self.executor_id:
                raise DomainInvariantError(
                    "AgentRun executor session must belong to the AgentRun executor"
                )

        created_at = to_utc(self.created_at)
        updated_at = to_utc(self.updated_at)

        if updated_at < created_at:
            raise DomainInvariantError("AgentRun updated_at must not precede created_at")

        object.__setattr__(self, "created_at", created_at)
        object.__setattr__(self, "updated_at", updated_at)

        if self.started_at is not None:
            object.__setattr__(self, "started_at", to_utc(self.started_at))

        if self.completed_at is not None:
            object.__setattr__(self, "completed_at", to_utc(self.completed_at))
