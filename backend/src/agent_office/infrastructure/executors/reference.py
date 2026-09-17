"""Deterministic local ReferenceExecutor.

The ReferenceExecutor exists to exercise Agent Office executor semantics
without an external AI provider, network access, or provider credentials.

Phase 3B scenarios are stage-aware: the same deterministic executor can report
a blocking review verdict, succeed or fail remediation, and fail verification,
because each session records the stage and remediation cycle it belongs to. The
executor never fabricates evidence or findings — it reports only a bounded
review verdict through the normalized result's safe metadata.
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
    ReviewVerdict,
    SafeMetadata,
    StageKey,
    StartExecutionOutcome,
    StartExecutionRequest,
    StartExecutionResult,
    review_verdict_metadata,
    to_utc,
    utc_now,
)

Clock = Callable[[], datetime]

REFERENCE_EXECUTOR_ID = ExecutorId.parse("00000000-0000-4000-8000-000000000001")

_REFERENCE_EXECUTOR_ID = REFERENCE_EXECUTOR_ID

REFERENCE_EXECUTOR_NAME = "Reference Executor"

STAGE_CONTEXT_KEY = "stage_key"

REMEDIATION_CYCLE_CONTEXT_KEY = "remediation_cycle"


class ReferenceScenario(StrEnum):
    """Executor-level deterministic scenarios."""

    SUCCESS = "SUCCESS"
    START_FAILURE = "START_FAILURE"
    START_UNKNOWN = "START_UNKNOWN"
    RETRYABLE_START_FAILURE = "RETRYABLE_START_FAILURE"
    RUN_FAILURE = "RUN_FAILURE"
    WAITING = "WAITING"
    CANCEL_REQUESTED = "CANCEL_REQUESTED"
    CANCEL_CONFIRMED = "CANCEL_CONFIRMED"
    CANCEL_UNKNOWN = "CANCEL_UNKNOWN"
    UNKNOWN_RESULT = "UNKNOWN_RESULT"
    REVIEW_BLOCKER = "REVIEW_BLOCKER"
    REMEDIATION_SUCCESS = "REMEDIATION_SUCCESS"
    REMEDIATION_FAILURE = "REMEDIATION_FAILURE"
    VERIFICATION_FAILURE = "VERIFICATION_FAILURE"


@dataclass(frozen=True, slots=True)
class _SessionPlan:
    """Deterministic outcome planned for one reference session."""

    status: ExecutionStatus
    outcome: ExecutionOutcome
    summary: str
    review_verdict: ReviewVerdict | None = None


@dataclass(slots=True)
class _ReferenceSession:
    reference: ExecutorSessionRef
    scenario: ReferenceScenario
    stage_key: StageKey | None
    remediation_cycle: int
    plan: _SessionPlan
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
        self._start_calls = 0

    @property
    def start_calls(self) -> int:
        """Return how many start attempts this executor has been asked to make."""

        return self._start_calls

    def descriptor(self) -> ExecutorDescriptor:
        """Return the safe descriptor without awaiting the adapter."""

        return ExecutorDescriptor(
            id=self._executor_id,
            kind=ExecutorKind.REFERENCE,
            name=REFERENCE_EXECUTOR_NAME,
            status=ExecutorStatus.AVAILABLE,
            runtime_version="1",
        )

    async def describe(self) -> ExecutorDescriptor:
        return self.descriptor()

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
        self._start_calls += 1

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

        if self._scenario is ReferenceScenario.RETRYABLE_START_FAILURE and self._start_calls == 1:
            return StartExecutionResult(
                outcome=StartExecutionOutcome.FAILED,
                safe_summary="Transient reference startup failure before work began.",
                retryable=True,
            )

        context = dict(request.safe_context)
        stage_key = _parse_stage_key(context.get(STAGE_CONTEXT_KEY))
        remediation_cycle = _parse_cycle(context.get(REMEDIATION_CYCLE_CONTEXT_KEY))

        session = self._create_session(self._scenario, stage_key, remediation_cycle)

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

        return ExecutionResult(
            outcome=stored.plan.outcome,
            summary=stored.plan.summary,
            safe_metadata=_plan_metadata(stored.plan),
        )

    def _create_session(
        self,
        scenario: ReferenceScenario,
        stage_key: StageKey | None,
        remediation_cycle: int,
    ) -> _ReferenceSession:
        session_id = f"reference-session-{self._next_session_number:06d}"
        self._next_session_number += 1

        reference = ExecutorSessionRef(
            executor_id=self._executor_id,
            opaque_session_id=session_id,
            created_at=self._now(),
            safe_metadata=(("executor_kind", ExecutorKind.REFERENCE.value),),
        )

        plan = _plan_for(scenario, stage_key, remediation_cycle)

        stored = _ReferenceSession(
            reference=reference,
            scenario=scenario,
            stage_key=stage_key,
            remediation_cycle=remediation_cycle,
            plan=plan,
            status=plan.status,
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


def _parse_stage_key(value: str | None) -> StageKey | None:
    if value is None:
        return None

    try:
        return StageKey(value.strip().upper())
    except ValueError:
        return None


def _parse_cycle(value: str | None) -> int:
    if value is None:
        return 0

    try:
        cycle = int(value)
    except ValueError:
        return 0

    return max(cycle, 0)


def _plan_metadata(plan: _SessionPlan) -> SafeMetadata:
    if plan.review_verdict is None:
        return ()

    return review_verdict_metadata(plan.review_verdict)


def _plan_for(
    scenario: ReferenceScenario,
    stage_key: StageKey | None,
    remediation_cycle: int,
) -> _SessionPlan:
    """Derive a deterministic session plan from the scenario and its context.

    Stage awareness is what lets one deterministic executor model a review that
    reports a blocker, a remediation that succeeds or fails, and a re-review
    that comes back clear — without inventing findings or evidence.
    """

    if scenario is ReferenceScenario.RUN_FAILURE:
        return _SessionPlan(
            status=ExecutionStatus.FAILED,
            outcome=ExecutionOutcome.FAILURE,
            summary="Reference execution failed.",
        )

    if scenario is ReferenceScenario.WAITING:
        return _SessionPlan(
            status=ExecutionStatus.WAITING,
            outcome=ExecutionOutcome.UNKNOWN,
            summary="Reference execution is waiting.",
        )

    if scenario is ReferenceScenario.UNKNOWN_RESULT:
        return _SessionPlan(
            status=ExecutionStatus.COMPLETED,
            outcome=ExecutionOutcome.UNKNOWN,
            summary="Reference execution result is unknown.",
        )

    if scenario is ReferenceScenario.REVIEW_BLOCKER:
        if stage_key is StageKey.REVIEW:
            return _SessionPlan(
                status=ExecutionStatus.COMPLETED,
                outcome=ExecutionOutcome.SUCCESS,
                summary="Reference review reported a blocking outcome.",
                review_verdict=ReviewVerdict.BLOCKER,
            )

        return _SessionPlan(
            status=ExecutionStatus.COMPLETED,
            outcome=ExecutionOutcome.SUCCESS,
            summary="Reference execution completed successfully.",
        )

    if scenario is ReferenceScenario.REMEDIATION_SUCCESS:
        if stage_key is StageKey.REVIEW:
            return _SessionPlan(
                status=ExecutionStatus.COMPLETED,
                outcome=ExecutionOutcome.SUCCESS,
                summary=(
                    "Reference review reported a blocking outcome."
                    if remediation_cycle == 0
                    else "Reference re-review reported no blocking outcome."
                ),
                review_verdict=(
                    ReviewVerdict.BLOCKER if remediation_cycle == 0 else ReviewVerdict.CLEAR
                ),
            )

        return _SessionPlan(
            status=ExecutionStatus.COMPLETED,
            outcome=ExecutionOutcome.SUCCESS,
            summary="Reference remediation completed successfully.",
        )

    if scenario is ReferenceScenario.REMEDIATION_FAILURE:
        if stage_key is StageKey.REMEDIATION:
            return _SessionPlan(
                status=ExecutionStatus.FAILED,
                outcome=ExecutionOutcome.FAILURE,
                summary="Reference remediation failed.",
            )

        if stage_key is StageKey.REVIEW:
            return _SessionPlan(
                status=ExecutionStatus.COMPLETED,
                outcome=ExecutionOutcome.SUCCESS,
                summary="Reference review reported a blocking outcome.",
                review_verdict=ReviewVerdict.BLOCKER,
            )

        return _SessionPlan(
            status=ExecutionStatus.COMPLETED,
            outcome=ExecutionOutcome.SUCCESS,
            summary="Reference execution completed successfully.",
        )

    if scenario is ReferenceScenario.VERIFICATION_FAILURE:
        if stage_key is StageKey.VERIFICATION:
            return _SessionPlan(
                status=ExecutionStatus.FAILED,
                outcome=ExecutionOutcome.FAILURE,
                summary="Reference verification failed.",
            )

        return _SessionPlan(
            status=ExecutionStatus.COMPLETED,
            outcome=ExecutionOutcome.SUCCESS,
            summary="Reference execution completed successfully.",
        )

    if scenario in {
        ReferenceScenario.CANCEL_REQUESTED,
        ReferenceScenario.CANCEL_CONFIRMED,
        ReferenceScenario.CANCEL_UNKNOWN,
    }:
        return _SessionPlan(
            status=ExecutionStatus.RUNNING,
            outcome=ExecutionOutcome.UNKNOWN,
            summary="Reference execution is still active.",
        )

    return _SessionPlan(
        status=ExecutionStatus.COMPLETED,
        outcome=ExecutionOutcome.SUCCESS,
        summary="Reference execution completed successfully.",
    )
