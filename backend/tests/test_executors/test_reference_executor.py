"""Tests for the deterministic ReferenceExecutor."""

import asyncio
from datetime import UTC, datetime
from uuid import UUID

import pytest

from agent_office.application.executors import ExecutorAdapter
from agent_office.domain import (
    AgentRunId,
    CancellationOutcome,
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
from agent_office.infrastructure.executors import (
    ReferenceExecutor,
    ReferenceScenario,
)


def _request() -> StartExecutionRequest:
    return StartExecutionRequest(
        agent_run_id=AgentRunId(UUID("11111111-1111-4111-8111-111111111111")),
        instruction="Perform bounded reference work.",
    )


async def _start_session(
    executor: ReferenceExecutor,
) -> ExecutorSessionRef:
    result = await executor.start(_request())

    assert result.session_ref is not None
    return result.session_ref


def _accepts_executor(
    executor: ExecutorAdapter,
) -> ExecutorAdapter:
    return executor


def test_reference_executor_satisfies_executor_port() -> None:
    executor = _accepts_executor(ReferenceExecutor())

    descriptor = asyncio.run(executor.describe())

    assert descriptor.kind is ExecutorKind.REFERENCE


def test_reference_executor_descriptor_is_deterministic() -> None:
    executor = ReferenceExecutor()

    first = asyncio.run(executor.describe())
    second = asyncio.run(executor.describe())

    assert first == second
    assert first.status is ExecutorStatus.AVAILABLE
    assert first.name == "Reference Executor"


def test_reference_executor_health_is_available() -> None:
    fixed = datetime(2026, 9, 15, 7, 0, tzinfo=UTC)
    executor = ReferenceExecutor(clock=lambda: fixed)

    health = asyncio.run(executor.health())

    assert health.status is ExecutorStatus.AVAILABLE
    assert health.checked_at == fixed


def test_reference_executor_reports_capabilities_honestly() -> None:
    fixed = datetime(2026, 9, 15, 7, 0, tzinfo=UTC)
    executor = ReferenceExecutor(clock=lambda: fixed)

    report = asyncio.run(executor.capabilities())

    assert report.support_for(ExecutorCapability.START_EXECUTION) is CapabilitySupport.SUPPORTED
    assert report.support_for(ExecutorCapability.STATUS_QUERY) is CapabilitySupport.SUPPORTED
    assert report.support_for(ExecutorCapability.CANCELLATION) is CapabilitySupport.SUPPORTED

    assert report.support_for(ExecutorCapability.TOKEN_USAGE) is CapabilitySupport.UNSUPPORTED
    assert report.support_for(ExecutorCapability.EVENT_STREAM) is CapabilitySupport.UNSUPPORTED
    assert report.support_for(ExecutorCapability.FILE_WRITE) is CapabilitySupport.UNSUPPORTED


def test_success_scenario_completes_successfully() -> None:
    executor = ReferenceExecutor(scenario=ReferenceScenario.SUCCESS)

    async def exercise() -> None:
        started = await executor.start(_request())

        assert started.outcome is StartExecutionOutcome.STARTED
        assert started.session_ref is not None

        status = await executor.get_status(started.session_ref)
        result = await executor.fetch_result(started.session_ref)

        assert status is ExecutionStatus.COMPLETED
        assert result.outcome is ExecutionOutcome.SUCCESS

    asyncio.run(exercise())


def test_session_ids_are_deterministic_and_unique() -> None:
    executor = ReferenceExecutor()

    async def exercise() -> None:
        first = await _start_session(executor)
        second = await _start_session(executor)

        assert first.opaque_session_id == "reference-session-000001"
        assert second.opaque_session_id == "reference-session-000002"

    asyncio.run(exercise())


def test_start_failure_has_no_session() -> None:
    executor = ReferenceExecutor(scenario=ReferenceScenario.START_FAILURE)

    result = asyncio.run(executor.start(_request()))

    assert result.outcome is StartExecutionOutcome.FAILED
    assert result.session_ref is None
    assert result.retryable is False


def test_unknown_start_has_no_session_and_is_not_retryable() -> None:
    executor = ReferenceExecutor(scenario=ReferenceScenario.START_UNKNOWN)

    result = asyncio.run(executor.start(_request()))

    assert result.outcome is StartExecutionOutcome.UNKNOWN
    assert result.session_ref is None
    assert result.retryable is False


def test_run_failure_is_distinct_from_start_failure() -> None:
    executor = ReferenceExecutor(scenario=ReferenceScenario.RUN_FAILURE)

    async def exercise() -> None:
        session = await _start_session(executor)

        assert await executor.get_status(session) is ExecutionStatus.FAILED

        result = await executor.fetch_result(session)

        assert result.outcome is ExecutionOutcome.FAILURE

    asyncio.run(exercise())


def test_waiting_scenario_remains_nonterminal() -> None:
    executor = ReferenceExecutor(scenario=ReferenceScenario.WAITING)

    async def exercise() -> None:
        session = await _start_session(executor)

        assert await executor.get_status(session) is ExecutionStatus.WAITING

        result = await executor.fetch_result(session)

        assert result.outcome is ExecutionOutcome.UNKNOWN

    asyncio.run(exercise())


def test_cancel_requested_does_not_claim_cancelled() -> None:
    executor = ReferenceExecutor(scenario=ReferenceScenario.CANCEL_REQUESTED)

    async def exercise() -> None:
        session = await _start_session(executor)

        cancellation = await executor.cancel(session)
        status = await executor.get_status(session)

        assert cancellation.outcome is CancellationOutcome.REQUESTED
        assert status is ExecutionStatus.RUNNING

    asyncio.run(exercise())


def test_cancel_confirmed_marks_session_cancelled() -> None:
    executor = ReferenceExecutor(scenario=ReferenceScenario.CANCEL_CONFIRMED)

    async def exercise() -> None:
        session = await _start_session(executor)

        cancellation = await executor.cancel(session)
        status = await executor.get_status(session)
        result = await executor.fetch_result(session)

        assert cancellation.outcome is CancellationOutcome.CONFIRMED_CANCELLED
        assert status is ExecutionStatus.CANCELLED
        assert result.outcome is ExecutionOutcome.CANCELLED

    asyncio.run(exercise())


def test_cancel_unknown_does_not_claim_cancelled() -> None:
    executor = ReferenceExecutor(scenario=ReferenceScenario.CANCEL_UNKNOWN)

    async def exercise() -> None:
        session = await _start_session(executor)

        cancellation = await executor.cancel(session)
        status = await executor.get_status(session)
        reconciliation = await executor.reconcile(session)

        assert cancellation.outcome is CancellationOutcome.UNKNOWN
        assert status is ExecutionStatus.UNKNOWN
        assert reconciliation.status is ExecutionStatus.UNKNOWN

    asyncio.run(exercise())


def test_unknown_result_preserves_completed_execution_status() -> None:
    executor = ReferenceExecutor(scenario=ReferenceScenario.UNKNOWN_RESULT)

    async def exercise() -> None:
        session = await _start_session(executor)

        status = await executor.get_status(session)
        result = await executor.fetch_result(session)

        assert status is ExecutionStatus.COMPLETED
        assert result.outcome is ExecutionOutcome.UNKNOWN

    asyncio.run(exercise())


def test_unknown_session_remains_unknown() -> None:
    executor = ReferenceExecutor()

    unknown_session = ExecutorSessionRef(
        executor_id=ExecutorId.parse("00000000-0000-4000-8000-000000000001"),
        opaque_session_id="reference-session-999999",
        created_at=datetime.now(UTC),
    )

    async def exercise() -> None:
        assert await executor.get_status(unknown_session) is ExecutionStatus.UNKNOWN

        reconciliation = await executor.reconcile(unknown_session)
        cancellation = await executor.cancel(unknown_session)
        result = await executor.fetch_result(unknown_session)

        assert reconciliation.status is ExecutionStatus.UNKNOWN
        assert cancellation.outcome is CancellationOutcome.UNKNOWN
        assert result.outcome is ExecutionOutcome.UNKNOWN

    asyncio.run(exercise())


def test_cross_executor_session_is_rejected() -> None:
    executor = ReferenceExecutor()

    foreign_session = ExecutorSessionRef(
        executor_id=ExecutorId.parse("99999999-9999-4999-8999-999999999999"),
        opaque_session_id="foreign-session",
        created_at=datetime.now(UTC),
    )

    with pytest.raises(
        DomainInvariantError,
        match="different Executor",
    ):
        asyncio.run(executor.get_status(foreign_session))


def test_repeated_cancel_after_confirmation_is_terminal() -> None:
    executor = ReferenceExecutor(scenario=ReferenceScenario.CANCEL_CONFIRMED)

    async def exercise() -> None:
        session = await _start_session(executor)

        first = await executor.cancel(session)
        second = await executor.cancel(session)

        assert first.outcome is CancellationOutcome.CONFIRMED_CANCELLED
        assert second.outcome is CancellationOutcome.ALREADY_TERMINAL

    asyncio.run(exercise())
