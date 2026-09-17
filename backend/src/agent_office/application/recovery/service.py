"""Recovery discovery for non-terminal Runs.

Recovery discovery answers one question: which durable Runs may still need an
operator? It is a pure read of canonical state. It performs no external I/O, so
it can never start, cancel, or reconcile an executor session, and it never
mutates a Run or an AgentRun.

Reconciliation stays a separate, explicit, bounded action. Starting an
application process is not evidence that investigating external sessions is
side-effect-free, so discovery deliberately stops at identification.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from agent_office.application.agents.service import AgentRunService
from agent_office.application.orchestration.service import (
    NON_AUTONOMOUS_BLOCK_REASONS,
    RESUMABLE_BLOCK_REASONS,
)
from agent_office.application.runs.service import RunService
from agent_office.domain import (
    AgentRun,
    AgentRunStatus,
    ProjectId,
    Run,
    RunId,
    RunReasonCode,
    RunStatus,
    is_terminal_agent_run_status,
)


class RecoveryClassification(StrEnum):
    """What an operator most likely needs to do about a non-terminal Run.

    The classification is derived from durable state only. It advises the next
    safe action; it is not a claim that the action will succeed.
    """

    #: A started assignment exists whose external state has not been proven.
    #: Reconciliation must run before any state may be treated as known.
    RECONCILIATION_REQUIRED = "RECONCILIATION_REQUIRED"

    #: The Run is blocked by a reason that an explicit resume can clear.
    RESUMABLE_BLOCK = "RESUMABLE_BLOCK"

    #: The Run is blocked by policy. Resume will refuse it, so a human decision
    #: is required and Phase 3 offers no action that clears it.
    BLOCKED_POLICY = "BLOCKED_POLICY"

    #: A required assignment is waiting on its executor. Nothing is wrong; it may
    #: simply still be waiting.
    WAITING = "WAITING"

    #: Non-terminal, but nothing requires an operator. Orchestration is either
    #: still progressing normally or has reached a state that needs no action.
    NO_ACTION = "NO_ACTION"


@dataclass(frozen=True, slots=True)
class RecoveryCandidate:
    """One non-terminal Run and the safe facts needed to triage it.

    The candidate carries no repository path, no executor session reference, and
    no workspace detail: recovery discovery is not a filesystem or provider
    inspection surface.
    """

    run_id: RunId
    project_id: ProjectId
    status: RunStatus
    reason_code: RunReasonCode | None
    classification: RecoveryClassification
    unresolved_agent_run_count: int
    reconciliation_required: bool


def _unresolved(agent_runs: tuple[AgentRun, ...]) -> tuple[AgentRun, ...]:
    return tuple(
        agent_run for agent_run in agent_runs if not is_terminal_agent_run_status(agent_run.status)
    )


def _classify(
    run: Run,
    unresolved: tuple[AgentRun, ...],
    *,
    reconciliation_required: bool,
) -> RecoveryClassification:
    """Classify a non-terminal Run from durable facts only.

    Order matters. Unproven external execution outranks every other condition,
    because no other conclusion is trustworthy until it is resolved. A policy
    block then outranks a resumable block, since resume cannot clear it.
    """

    if reconciliation_required:
        return RecoveryClassification.RECONCILIATION_REQUIRED

    if run.status is RunStatus.BLOCKED:
        if run.failure_code in NON_AUTONOMOUS_BLOCK_REASONS:
            return RecoveryClassification.BLOCKED_POLICY

        if run.failure_code is None or run.failure_code in RESUMABLE_BLOCK_REASONS:
            return RecoveryClassification.RESUMABLE_BLOCK

        return RecoveryClassification.BLOCKED_POLICY

    if any(agent_run.status is AgentRunStatus.WAITING for agent_run in unresolved):
        return RecoveryClassification.WAITING

    return RecoveryClassification.NO_ACTION


class RecoveryService:
    """Identify durable non-terminal Runs that may require reconciliation."""

    def __init__(
        self,
        run_service: RunService,
        agent_run_service: AgentRunService,
    ) -> None:
        self._runs = run_service
        self._agent_runs = agent_run_service

    def list_candidates(self) -> tuple[RecoveryCandidate, ...]:
        """Return every non-terminal Run and its recovery classification.

        This method performs no external I/O and writes nothing. An AgentRun is
        treated as requiring reconciliation when it has started — that is, when
        it holds an executor session reference — and has not reached a terminal
        status. A pre-start AgentRun holds no external execution to prove, so it
        does not by itself require reconciliation.
        """

        candidates: list[RecoveryCandidate] = []

        for run in self._runs.list_non_terminal_runs():
            agent_runs = self._agent_runs.list_for_run(run.id)
            unresolved = _unresolved(agent_runs)
            reconciliation_required = any(
                agent_run.executor_session_ref is not None for agent_run in unresolved
            )

            candidates.append(
                RecoveryCandidate(
                    run_id=run.id,
                    project_id=run.project_id,
                    status=run.status,
                    reason_code=run.failure_code,
                    classification=_classify(
                        run,
                        unresolved,
                        reconciliation_required=reconciliation_required,
                    ),
                    unresolved_agent_run_count=len(unresolved),
                    reconciliation_required=reconciliation_required,
                )
            )

        return tuple(candidates)

    def find(self, run_id: RunId) -> RecoveryCandidate | None:
        """Return the recovery candidate for one Run, if it is non-terminal."""

        for candidate in self.list_candidates():
            if candidate.run_id == run_id:
                return candidate

        return None
