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
    ExecutionOutcome,
    ExecutorId,
    ExecutorSessionRef,
    Run,
    RunId,
    StageKey,
    ensure_agent_run_transition_allowed,
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
    ) -> AgentRun:
        """Create a durable AgentRun in PENDING state.

        Profile identity and version are supplied by the caller from the frozen
        WorkflowSnapshot, never re-resolved from the live AgentProfile catalog.
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
            attempt=1,
            created_at=now,
            updated_at=now,
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
            reason_code=reason_code,
            reason_summary=reason_summary,
        )

        self._repository.update(updated)
        return updated

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
