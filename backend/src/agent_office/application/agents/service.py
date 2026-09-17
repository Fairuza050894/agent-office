"""AgentRun application service.

Owns durable AgentRun creation and guarded lifecycle transitions. A completed
AgentRun never implies a completed Run; that decision belongs to the
orchestrator's completion gates.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from datetime import datetime

from agent_office.application.agents.errors import AgentRunNotFoundError
from agent_office.application.agents.ports import AgentRunRepository
from agent_office.domain import (
    AgentAccessMode,
    AgentProfileId,
    AgentRun,
    AgentRunId,
    AgentRunReasonCode,
    AgentRunStatus,
    CapabilityReport,
    DomainInvariantError,
    ExecutionOutcome,
    ExecutorId,
    ExecutorSessionRef,
    ReviewVerdict,
    Run,
    RunId,
    StageKey,
    WorkspaceId,
    ensure_agent_run_transition_allowed,
    is_terminal_agent_run_status,
    utc_now,
)

Clock = Callable[[], datetime]

AgentRunIdFactory = Callable[[], AgentRunId]

_TERMINAL_STATUSES = frozenset(
    {
        AgentRunStatus.COMPLETED,
        AgentRunStatus.FAILED,
        AgentRunStatus.CANCELLED,
    }
)


class AgentRunService:
    """Coordinates AgentRun persistence and lifecycle transitions."""

    def __init__(
        self,
        repository: AgentRunRepository,
        *,
        clock: Clock = utc_now,
        agent_run_id_factory: AgentRunIdFactory = AgentRunId.new,
    ) -> None:
        self._repository = repository
        self._clock = clock
        self._agent_run_id_factory = agent_run_id_factory

    def create(
        self,
        *,
        run: Run,
        stage_key: StageKey,
        agent_profile_id: AgentProfileId,
        agent_profile_key: str,
        agent_profile_version: int,
        executor_id: ExecutorId,
        access_mode: AgentAccessMode,
        attempt: int = 1,
        retry_of_agent_run_id: AgentRunId | None = None,
        remediation_cycle: int = 0,
    ) -> AgentRun:
        """Create a durable AgentRun in PENDING state.

        Profile identity and version are supplied by the caller from the frozen
        WorkflowSnapshot, never re-resolved from the live AgentProfile catalog.

        A retry creates a NEW AgentRun that references the previous attempt, so
        failed attempt history is preserved rather than overwritten.
        """

        now = utc_now(self._clock)

        agent_run = AgentRun(
            id=self._agent_run_id_factory(),
            run_id=run.id,
            project_id=run.project_id,
            stage_key=stage_key,
            agent_profile_id=agent_profile_id,
            agent_profile_key=agent_profile_key,
            agent_profile_version=agent_profile_version,
            executor_id=executor_id,
            access_mode=access_mode,
            status=AgentRunStatus.PENDING,
            attempt=attempt,
            created_at=now,
            updated_at=now,
            retry_of_agent_run_id=retry_of_agent_run_id,
            remediation_cycle=remediation_cycle,
        )

        self._repository.add(agent_run)
        return agent_run

    def transition(
        self,
        agent_run: AgentRun,
        target: AgentRunStatus,
        *,
        reason_code: AgentRunReasonCode | None = None,
        reason_summary: str | None = None,
        session_ref: ExecutorSessionRef | None = None,
        capability_snapshot: CapabilityReport | None = None,
        result_outcome: ExecutionOutcome | None = None,
        result_summary: str | None = None,
        review_verdict: ReviewVerdict | None = None,
        failure_retryable: bool | None = None,
        workspace_id: WorkspaceId | None = None,
    ) -> AgentRun:
        """Apply a validated lifecycle transition and persist the result."""

        ensure_agent_run_transition_allowed(agent_run.status, target)

        if agent_run.status is target:
            return agent_run

        now = utc_now(self._clock)

        updated = replace(
            agent_run,
            status=target,
            updated_at=now,
            started_at=(
                now
                if target is AgentRunStatus.RUNNING and agent_run.started_at is None
                else agent_run.started_at
            ),
            completed_at=now if target in _TERMINAL_STATUSES else agent_run.completed_at,
            executor_session_ref=(
                agent_run.executor_session_ref if session_ref is None else session_ref
            ),
            capability_snapshot=(
                agent_run.capability_snapshot
                if capability_snapshot is None
                else capability_snapshot
            ),
            result_outcome=agent_run.result_outcome if result_outcome is None else result_outcome,
            result_summary=agent_run.result_summary if result_summary is None else result_summary,
            review_verdict=agent_run.review_verdict if review_verdict is None else review_verdict,
            failure_retryable=(
                agent_run.failure_retryable if failure_retryable is None else failure_retryable
            ),
            workspace_id=agent_run.workspace_id if workspace_id is None else workspace_id,
            reason_code=reason_code,
            reason_summary=reason_summary,
        )

        self._repository.update(updated)
        return updated

    def attach_workspace(self, agent_run: AgentRun, workspace_id: WorkspaceId) -> AgentRun:
        """Record the Workspace an AgentRun executes in.

        This is not a lifecycle transition: the AgentRun keeps its status, but a
        write-capable assignment must durably reference the isolated Worktree it
        was granted before any executor call.
        """

        if agent_run.workspace_id == workspace_id:
            return agent_run

        if is_terminal_agent_run_status(agent_run.status):
            raise DomainInvariantError("A terminal AgentRun cannot change its Workspace")

        updated = replace(
            agent_run,
            workspace_id=workspace_id,
            updated_at=utc_now(self._clock),
        )

        self._repository.update(updated)
        return updated

    def record_unresolved_cancellation(
        self,
        agent_run: AgentRun,
        *,
        reason_code: AgentRunReasonCode,
        reason_summary: str,
        capability_snapshot: CapabilityReport | None = None,
    ) -> AgentRun:
        """Record an unproven cancellation attempt without changing execution status.

        A control plane that cannot cancel an assignment has not proven that an
        already-started external execution stopped or became blocked, so the last
        authoritative status (and the executor session reference) is preserved.
        Only the attempted-cancellation facts are recorded, and the AgentRun stays
        non-terminal so reconciliation can still resolve it.
        """

        if is_terminal_agent_run_status(agent_run.status):
            return agent_run

        recorded = replace(
            agent_run,
            updated_at=utc_now(self._clock),
            reason_code=reason_code,
            reason_summary=reason_summary,
            capability_snapshot=(
                agent_run.capability_snapshot
                if capability_snapshot is None
                else capability_snapshot
            ),
        )

        self._repository.update(recorded)
        return recorded

    def get(self, agent_run_id: AgentRunId) -> AgentRun:
        """Return an AgentRun by ID."""

        agent_run = self._repository.get(agent_run_id)

        if agent_run is None:
            raise AgentRunNotFoundError(f"AgentRun {agent_run_id} was not found")

        return agent_run

    def list_for_run(self, run_id: RunId) -> tuple[AgentRun, ...]:
        """Return every AgentRun of a Run."""

        return self._repository.list_by_run(run_id)

    def list_for_stage(self, run_id: RunId, stage_key: StageKey) -> tuple[AgentRun, ...]:
        """Return every AgentRun of one Run stage."""

        return self._repository.list_by_stage(run_id, stage_key)
