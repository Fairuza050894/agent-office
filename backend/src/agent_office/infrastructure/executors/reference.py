"""Deterministic local ReferenceExecutor.

The ReferenceExecutor exists to exercise Agent Office executor semantics
without an external AI provider, network access, or provider credentials.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from agent_office.domain import (
    CancelExecutionResult,
    CancellationOutcome,
    CapabilityRecord,
    CapabilityReport,
    CapabilitySupport,
    DomainInvariantError,
    ExecutionOutcome,
    ExecutionResult,
    ExecutionStatus,
    ExecutorCapability,
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
    to_utc,
    utc_now,
)

Clock = Callable[[], datetime]

_REFERENCE_EXECUTOR_ID = ExecutorId.parse("00000000-0000-4000-8000-000000000001")


class ReferenceScenario(StrEnum):
    """Executor-level deterministic scenarios.

    Workflow-only and event-only scenarios are intentionally deferred until
    their canonical workflow/event contracts exist.
    """

    SUCCESS = "SUCCESS"
    START_FAILURE = "START_FAILURE"
    START_UNKNOWN = "START_UNKNOWN"
    RUN_FAILURE = "RUN_FAILURE"
    WAITING = "WAITING"
    CANCEL_REQUESTED = "CANCEL_REQUESTED"
    CANCEL_CONFIRMED = "CANCEL_CONFIRMED"
    CANCEL_UNKNOWN = "CANCEL_UNKNOWN"
    UNKNOWN_RESULT = "UNKNOWN_RESULT"


@dataclass(slots=True)
class _ReferenceSession:
    reference: ExecutorSessionRef
    scenario: ReferenceScenario
    status: ExecutionStatus


class ReferenceExecutor:
    """Local, deterministic implementation of the Executor adapter contract."""

    def __init__(
        self,
        *,
        scenario: ReferenceScenario = ReferenceScenario.SUCCESS,
        executor_id: ExecutorId = _REFERENCE_EXECUTOR_ID,
        clock: Clock = utc_now,
    ) -> None:
        self._scenario = scenario
        self._executor_id = executor_id
        self._clock = clock
        self._next_session_number = 1
        self._sessions: dict[str, _ReferenceSession] = {}

    async def describe(self) -> ExecutorDescriptor:
        return ExecutorDescriptor(
            id=self._executor_id,
            kind=ExecutorKind.REFERENCE,
            name="Reference Executor",
            status=ExecutorStatus.AVAILABLE,
            runtime_version="1",
        )

    async def capabilities(self) -> CapabilityReport:
        now = self._now()

        supported = {
            ExecutorCapability.START_EXECUTION,
            ExecutorCapability.STATUS_QUERY,
            ExecutorCapability.CANCELLATION,
        }

        records = tuple(
            CapabilityRecord(
                capability=capability,
                support=(
                    CapabilitySupport.SUPPORTED
                    if capability in supported
                    else CapabilitySupport.UNSUPPORTED
                ),
                source="reference-executor",
                checked_at=now,
            )
            for capability in ExecutorCapability
        )

        return CapabilityReport(
            executor_id=self._executor_id,
            capabilities=records,
        )

    async def health(self) -> ExecutorHealth:
        return ExecutorHealth(
            status=ExecutorStatus.AVAILABLE,
            checked_at=self._now(),
            safe_summary="Deterministic local executor is available.",
        )

    async def start(
        self,
        request: StartExecutionRequest,
    ) -> StartExecutionResult:
        del request

        if self._scenario is ReferenceScenario.START_FAILURE:
            return StartExecutionResult(
                outcome=StartExecutionOutcome.FAILED,
                safe_summary="Reference start failure.",
                retryable=False,
            )

        if self._scenario is ReferenceScenario.START_UNKNOWN:
            return StartExecutionResult(
                outcome=StartExecutionOutcome.UNKNOWN,
                safe_summary="Reference start outcome is unknown.",
                retryable=False,
            )

        session = self._create_session(self._scenario)

        return StartExecutionResult(
            outcome=StartExecutionOutcome.STARTED,
            session_ref=session.reference,
            safe_summary="Reference execution started.",
            retryable=False,
        )

    async def get_status(
        self,
        session: ExecutorSessionRef,
    ) -> ExecutionStatus:
        stored = self._find_session(session)

        if stored is None:
            return ExecutionStatus.UNKNOWN

        return stored.status

    async def cancel(
        self,
        session: ExecutorSessionRef,
    ) -> CancelExecutionResult:
        stored = self._find_session(session)

        if stored is None:
            return CancelExecutionResult(
                outcome=CancellationOutcome.UNKNOWN,
                safe_summary="Reference session state is unknown.",
            )

        if stored.status in {
            ExecutionStatus.COMPLETED,
            ExecutionStatus.FAILED,
            ExecutionStatus.CANCELLED,
        }:
            return CancelExecutionResult(
                outcome=CancellationOutcome.ALREADY_TERMINAL,
                safe_summary="Reference session is already terminal.",
            )

        if stored.scenario is ReferenceScenario.CANCEL_REQUESTED:
            return CancelExecutionResult(
                outcome=CancellationOutcome.REQUESTED,
                safe_summary="Cancellation was requested but not confirmed.",
            )

        if stored.scenario is ReferenceScenario.CANCEL_UNKNOWN:
            stored.status = ExecutionStatus.UNKNOWN
            return CancelExecutionResult(
                outcome=CancellationOutcome.UNKNOWN,
                safe_summary="Cancellation outcome is unknown.",
            )

        stored.status = ExecutionStatus.CANCELLED

        return CancelExecutionResult(
            outcome=CancellationOutcome.CONFIRMED_CANCELLED,
            safe_summary="Cancellation was confirmed.",
        )

    async def reconcile(
        self,
        session: ExecutorSessionRef,
    ) -> ReconciliationResult:
        stored = self._find_session(session)

        if stored is None:
            return ReconciliationResult(
                status=ExecutionStatus.UNKNOWN,
                safe_summary="Reference session state is unknown.",
            )

        return ReconciliationResult(
            status=stored.status,
            safe_summary="Reference session reconciled.",
        )

    async def fetch_result(
        self,
        session: ExecutorSessionRef,
    ) -> ExecutionResult:
        stored = self._find_session(session)

        if stored is None:
            return ExecutionResult(
                outcome=ExecutionOutcome.UNKNOWN,
                summary="Reference session result is unknown.",
            )

        if stored.status is ExecutionStatus.CANCELLED:
            return ExecutionResult(
                outcome=ExecutionOutcome.CANCELLED,
                summary="Reference execution was cancelled.",
            )

        if stored.scenario is ReferenceScenario.SUCCESS:
            return ExecutionResult(
                outcome=ExecutionOutcome.SUCCESS,
                summary="Reference execution completed successfully.",
            )

        if stored.scenario is ReferenceScenario.RUN_FAILURE:
            return ExecutionResult(
                outcome=ExecutionOutcome.FAILURE,
                summary="Reference execution failed.",
            )

        return ExecutionResult(
            outcome=ExecutionOutcome.UNKNOWN,
            summary="Reference execution result is unknown.",
        )

    def _create_session(
        self,
        scenario: ReferenceScenario,
    ) -> _ReferenceSession:
        session_id = f"reference-session-{self._next_session_number:06d}"
        self._next_session_number += 1

        reference = ExecutorSessionRef(
            executor_id=self._executor_id,
            opaque_session_id=session_id,
            created_at=self._now(),
            safe_metadata=(("executor_kind", ExecutorKind.REFERENCE.value),),
        )

        stored = _ReferenceSession(
            reference=reference,
            scenario=scenario,
            status=_initial_status_for(scenario),
        )
        self._sessions[session_id] = stored

        return stored

    def _find_session(
        self,
        session: ExecutorSessionRef,
    ) -> _ReferenceSession | None:
        if session.executor_id != self._executor_id:
            raise DomainInvariantError("Executor session belongs to a different Executor")

        return self._sessions.get(session.opaque_session_id)

    def _now(self) -> datetime:
        return to_utc(self._clock())


def _initial_status_for(
    scenario: ReferenceScenario,
) -> ExecutionStatus:
    if scenario is ReferenceScenario.SUCCESS:
        return ExecutionStatus.COMPLETED

    if scenario is ReferenceScenario.RUN_FAILURE:
        return ExecutionStatus.FAILED

    if scenario is ReferenceScenario.WAITING:
        return ExecutionStatus.WAITING

    if scenario is ReferenceScenario.UNKNOWN_RESULT:
        return ExecutionStatus.COMPLETED

    return ExecutionStatus.RUNNING
