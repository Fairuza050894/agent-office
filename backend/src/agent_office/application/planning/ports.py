"""Application ports for durable planning truth."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from agent_office.domain import (
    ComposerMessage,
    ComposerMessageId,
    ComposerThread,
    ComposerThreadId,
    PlanningArtifact,
    PlanningEvent,
    PlanningEventId,
    ProjectId,
    RequirementCandidate,
    RequirementCandidateId,
    TeamProposal,
    TeamProposalId,
    TeamProposalMember,
    to_utc,
)

DEFAULT_PLANNING_EVENT_PAGE_SIZE = 50
MAX_PLANNING_EVENT_PAGE_SIZE = 200


@dataclass(frozen=True, slots=True)
class PlanningEventCursor:
    recorded_at: datetime
    event_id: PlanningEventId

    def __post_init__(self) -> None:
        object.__setattr__(self, "recorded_at", to_utc(self.recorded_at))

    def encode(self) -> str:
        return f"{self.recorded_at.isoformat()}|{self.event_id}"

    @classmethod
    def decode(cls, value: str) -> PlanningEventCursor:
        raw_time, separator, raw_id = value.partition("|")
        if not separator:
            raise ValueError("Planning event cursor is malformed")

        try:
            return cls(
                recorded_at=datetime.fromisoformat(raw_time),
                event_id=PlanningEventId.parse(raw_id),
            )
        except (ValueError, TypeError) as exc:
            raise ValueError("Planning event cursor is malformed") from exc


class ComposerThreadRepository(Protocol):
    def add(self, thread: ComposerThread) -> None: ...
    def get(self, thread_id: ComposerThreadId) -> ComposerThread | None: ...
    def save(self, thread: ComposerThread) -> None: ...
    def list_by_project(self, project_id: ProjectId) -> tuple[ComposerThread, ...]: ...


class ComposerMessageRepository(Protocol):
    def append(self, message: ComposerMessage) -> None: ...
    def get(self, message_id: ComposerMessageId) -> ComposerMessage | None: ...
    def list_by_thread(self, thread_id: ComposerThreadId) -> tuple[ComposerMessage, ...]: ...


class TeamProposalRepository(Protocol):
    def add(
        self,
        proposal: TeamProposal,
        members: tuple[TeamProposalMember, ...],
    ) -> None: ...
    def get(self, proposal_id: TeamProposalId) -> TeamProposal | None: ...
    def save(self, proposal: TeamProposal) -> None: ...
    def list_by_thread(
        self,
        thread_id: ComposerThreadId,
    ) -> tuple[tuple[TeamProposal, tuple[TeamProposalMember, ...]], ...]: ...


class PlanningArtifactRepository(Protocol):
    def add(self, artifact: PlanningArtifact) -> None: ...
    def list_by_thread(self, thread_id: ComposerThreadId) -> tuple[PlanningArtifact, ...]: ...


class RequirementCandidateRepository(Protocol):
    def add(self, requirement: RequirementCandidate) -> None: ...
    def get(
        self,
        requirement_id: RequirementCandidateId,
    ) -> RequirementCandidate | None: ...
    def save(self, requirement: RequirementCandidate) -> None: ...
    def list_by_thread(
        self,
        thread_id: ComposerThreadId,
    ) -> tuple[RequirementCandidate, ...]: ...


class PlanningEventRepository(Protocol):
    def append(self, event: PlanningEvent) -> None: ...
    def get(self, event_id: PlanningEventId) -> PlanningEvent | None: ...
    def next_sequence(self, thread_id: ComposerThreadId) -> int: ...
    def list_by_thread(
        self,
        thread_id: ComposerThreadId,
        *,
        limit: int,
        after: PlanningEventCursor | None = None,
    ) -> tuple[PlanningEvent, ...]: ...
