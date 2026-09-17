"""Application ports for AgentRun management."""

from __future__ import annotations

from typing import Protocol

from agent_office.domain import AgentRun, AgentRunId, RunId, StageKey


class AgentRunRepository(Protocol):
    """Persistence boundary for AgentRuns."""

    def add(self, agent_run: AgentRun) -> None:
        """Persist a new AgentRun."""
        ...

    def update(self, agent_run: AgentRun) -> None:
        """Persist the current state of an existing AgentRun."""
        ...

    def get(self, agent_run_id: AgentRunId) -> AgentRun | None:
        """Return an AgentRun by ID."""
        ...

    def list_by_run(self, run_id: RunId) -> tuple[AgentRun, ...]:
        """Return all AgentRuns for a Run ordered by creation time."""
        ...

    def list_by_stage(self, run_id: RunId, stage_key: StageKey) -> tuple[AgentRun, ...]:
        """Return all AgentRuns for one Run stage ordered by creation time."""
        ...
