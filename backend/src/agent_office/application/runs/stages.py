"""Stage runtime state service.

Stage state is durable so the Operations UI can render workflow progression
without inferring it from AgentRun counts.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from datetime import datetime

from agent_office.application.runs.ports import RunStageRepository
from agent_office.domain import (
    RunId,
    RunStageState,
    RunStageStatus,
    StageKey,
    StageReasonCode,
    ensure_run_stage_transition_allowed,
    utc_now,
)

Clock = Callable[[], datetime]

_TERMINAL_STAGE_STATUSES = frozenset(
    {
        RunStageStatus.COMPLETED,
        RunStageStatus.FAILED,
        RunStageStatus.SKIPPED,
        RunStageStatus.CANCELLED,
    }
)


class RunStageService:
    """Coordinates stage runtime state persistence and transitions."""

    def __init__(
        self,
        repository: RunStageRepository,
        *,
        clock: Clock = utc_now,
    ) -> None:
        self._repository = repository
        self._clock = clock

    def add_many(self, stages: tuple[RunStageState, ...]) -> None:
        """Persist the initial stage runtime state of a Run."""

        self._repository.add_many(stages)

    def transition(
        self,
        stage: RunStageState,
        target: RunStageStatus,
        *,
        reason_code: StageReasonCode | None = None,
        reason_summary: str | None = None,
    ) -> RunStageState:
        """Apply a validated stage transition and persist the result."""

        ensure_run_stage_transition_allowed(stage.status, target)

        if stage.status is target:
            return stage

        now = utc_now(self._clock)

        updated = replace(
            stage,
            status=target,
            reason_code=reason_code,
            reason_summary=reason_summary,
            updated_at=now,
            started_at=(
                now
                if target is RunStageStatus.RUNNING and stage.started_at is None
                else stage.started_at
            ),
            completed_at=now if target in _TERMINAL_STAGE_STATUSES else stage.completed_at,
        )

        self._repository.update(updated)
        return updated

    def get(self, run_id: RunId, stage_key: StageKey) -> RunStageState | None:
        """Return one stage of a Run."""

        return self._repository.get(run_id, stage_key)

    def list_for_run(self, run_id: RunId) -> tuple[RunStageState, ...]:
        """Return every stage of a Run in declared order."""

        return self._repository.list_by_run(run_id)
