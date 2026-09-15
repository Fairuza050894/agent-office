"""Contract tests for the Executor application port."""

import asyncio
from datetime import UTC, datetime
from uuid import UUID

from agent_office.application.executors import ExecutorAdapter
from agent_office.domain import (
    CancelExecutionResult,
    CancellationOutcome,
    CapabilityReport,
    ExecutionOutcome,
    ExecutionResult,
    ExecutionStatus,
    ExecutorDescriptor,
    ExecutorHealth,
    ExecutorId,
    ExecutorKind,
    ExecutorSessionRef,
    ExecutorStatus,
    ReconciliationResult,
    StartExecutionOutcome,
    StartExecutionRequest,
    StartExecutionResult,
)


class ContractExecutor:
    def __init__(self) -> None:
        self.executor_id = ExecutorId(UUID("33333333-3333-4333-8333-333333333333"))

    async def describe(self) -> ExecutorDescriptor:
        return ExecutorDescriptor(
            id=self.executor_id,
            kind=ExecutorKind.REFERENCE,
            name="Contract Executor",
            status=ExecutorStatus.AVAILABLE,
        )

    async def capabilities(self) -> CapabilityReport:
        return CapabilityReport(
            executor_id=self.executor_id,
            capabilities=(),
        )

    async def health(self) -> ExecutorHealth:
        return ExecutorHealth(
            status=ExecutorStatus.AVAILABLE,
            checked_at=datetime(2026, 9, 15, 6, 0, tzinfo=UTC),
        )

    async def start(
        self,
        request: StartExecutionRequest,
    ) -> StartExecutionResult:
        del request

        return StartExecutionResult(
            outcome=StartExecutionOutcome.STARTED,
        )

    async def get_status(
        self,
        session: ExecutorSessionRef,
    ) -> ExecutionStatus:
        del session
        return ExecutionStatus.COMPLETED

    async def cancel(
        self,
        session: ExecutorSessionRef,
    ) -> CancelExecutionResult:
        del session

        return CancelExecutionResult(
            outcome=CancellationOutcome.ALREADY_TERMINAL,
        )

    async def reconcile(
        self,
        session: ExecutorSessionRef,
    ) -> ReconciliationResult:
        del session

        return ReconciliationResult(
            status=ExecutionStatus.COMPLETED,
        )

    async def fetch_result(
        self,
        session: ExecutorSessionRef,
    ) -> ExecutionResult:
        del session

        return ExecutionResult(
            outcome=ExecutionOutcome.SUCCESS,
            summary="Completed.",
        )


def _accepts_executor(
    executor: ExecutorAdapter,
) -> ExecutorAdapter:
    return executor


def test_executor_port_is_provider_neutral() -> None:
    executor = _accepts_executor(ContractExecutor())

    descriptor = asyncio.run(executor.describe())

    assert descriptor.kind is ExecutorKind.REFERENCE
    assert descriptor.status is ExecutorStatus.AVAILABLE
