"""Tests for provider-neutral Executor domain primitives."""

from datetime import UTC, datetime, timedelta, timezone
from uuid import UUID

import pytest

from agent_office.domain import (
    AgentRunId,
    CancellationOutcome,
    CapabilityRecord,
    CapabilityReport,
    CapabilitySupport,
    DomainInvariantError,
    ExecutionOutcome,
    ExecutionStatus,
    ExecutorCapability,
    ExecutorId,
    ExecutorKind,
    ExecutorSessionRef,
    ExecutorStatus,
    StartExecutionOutcome,
    StartExecutionRequest,
)


def _executor_id() -> ExecutorId:
    return ExecutorId(UUID("11111111-1111-4111-8111-111111111111"))


def _agent_run_id() -> AgentRunId:
    return AgentRunId(UUID("22222222-2222-4222-8222-222222222222"))


def test_executor_kind_matches_contract() -> None:
    assert list(ExecutorKind) == [
        ExecutorKind.REFERENCE,
        ExecutorKind.CODEX,
        ExecutorKind.ANTIGRAVITY,
        ExecutorKind.OPENCLAW,
    ]


def test_executor_status_matches_contract() -> None:
    assert list(ExecutorStatus) == [
        ExecutorStatus.AVAILABLE,
        ExecutorStatus.DEGRADED,
        ExecutorStatus.UNAVAILABLE,
        ExecutorStatus.DISABLED,
        ExecutorStatus.UNKNOWN,
    ]


def test_capability_support_matches_contract() -> None:
    assert list(CapabilitySupport) == [
        CapabilitySupport.SUPPORTED,
        CapabilitySupport.UNSUPPORTED,
        CapabilitySupport.UNKNOWN,
    ]


def test_start_outcomes_match_contract() -> None:
    assert list(StartExecutionOutcome) == [
        StartExecutionOutcome.STARTED,
        StartExecutionOutcome.ACCEPTED,
        StartExecutionOutcome.REJECTED,
        StartExecutionOutcome.FAILED,
        StartExecutionOutcome.UNKNOWN,
    ]


def test_execution_statuses_match_contract() -> None:
    assert list(ExecutionStatus) == [
        ExecutionStatus.PENDING,
        ExecutionStatus.STARTING,
        ExecutionStatus.RUNNING,
        ExecutionStatus.WAITING,
        ExecutionStatus.COMPLETED,
        ExecutionStatus.FAILED,
        ExecutionStatus.CANCELLED,
        ExecutionStatus.UNKNOWN,
    ]


def test_execution_outcomes_match_contract() -> None:
    assert list(ExecutionOutcome) == [
        ExecutionOutcome.SUCCESS,
        ExecutionOutcome.FAILURE,
        ExecutionOutcome.CANCELLED,
        ExecutionOutcome.UNKNOWN,
    ]


def test_cancellation_outcomes_match_contract() -> None:
    assert list(CancellationOutcome) == [
        CancellationOutcome.REQUESTED,
        CancellationOutcome.CONFIRMED_CANCELLED,
        CancellationOutcome.ALREADY_TERMINAL,
        CancellationOutcome.UNSUPPORTED,
        CancellationOutcome.FAILED,
        CancellationOutcome.UNKNOWN,
    ]


def test_missing_capability_remains_unknown() -> None:
    report = CapabilityReport(
        executor_id=_executor_id(),
        capabilities=(),
    )

    assert report.support_for(ExecutorCapability.TOKEN_USAGE) is CapabilitySupport.UNKNOWN


def test_capability_report_rejects_duplicates() -> None:
    record = CapabilityRecord(
        capability=ExecutorCapability.CANCELLATION,
        support=CapabilitySupport.SUPPORTED,
    )

    with pytest.raises(
        DomainInvariantError,
        match="duplicate capabilities",
    ):
        CapabilityReport(
            executor_id=_executor_id(),
            capabilities=(record, record),
        )


def test_session_reference_normalizes_timestamp_to_utc() -> None:
    jakarta = timezone(timedelta(hours=7))

    session = ExecutorSessionRef(
        executor_id=_executor_id(),
        opaque_session_id="session-001",
        created_at=datetime(
            2026,
            9,
            15,
            13,
            0,
            tzinfo=jakarta,
        ),
    )

    assert session.created_at.tzinfo is UTC
    assert session.created_at == datetime(
        2026,
        9,
        15,
        6,
        0,
        tzinfo=UTC,
    )


def test_session_reference_rejects_empty_identifier() -> None:
    with pytest.raises(
        DomainInvariantError,
        match="session ID",
    ):
        ExecutorSessionRef(
            executor_id=_executor_id(),
            opaque_session_id="   ",
            created_at=datetime.now(UTC),
        )


@pytest.mark.parametrize(
    "key",
    [
        "token",
        "access_token",
        "authorization",
        "cookie",
        "client_secret",
        "password",
    ],
)
def test_session_metadata_rejects_secret_bearing_keys(
    key: str,
) -> None:
    with pytest.raises(
        DomainInvariantError,
        match="secret-bearing",
    ):
        ExecutorSessionRef(
            executor_id=_executor_id(),
            opaque_session_id="safe-session",
            created_at=datetime.now(UTC),
            safe_metadata=((key, "sensitive"),),
        )


def test_start_request_rejects_blank_instruction() -> None:
    with pytest.raises(
        DomainInvariantError,
        match="instruction",
    ):
        StartExecutionRequest(
            agent_run_id=_agent_run_id(),
            instruction="   ",
        )


def test_start_request_rejects_secret_context() -> None:
    with pytest.raises(
        DomainInvariantError,
        match="secret-bearing",
    ):
        StartExecutionRequest(
            agent_run_id=_agent_run_id(),
            instruction="Review the repository.",
            safe_context=(("authorization_header", "secret"),),
        )
