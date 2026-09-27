"""Dynamic-team proposal primitives for planning truth."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.identifiers import ComposerThreadId, TeamProposalId
from agent_office.domain.timestamps import to_utc

MAX_TEAM_REASON_LENGTH = 2_000
MAX_TEAM_SUMMARY_LENGTH = 4_000


class TeamPhase(StrEnum):
    PLANNING = "PLANNING"
    IMPLEMENTATION = "IMPLEMENTATION"
    REVIEW = "REVIEW"
    DOCUMENTATION = "DOCUMENTATION"


class TeamProposalStatus(StrEnum):
    PROPOSED = "PROPOSED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    SUPERSEDED = "SUPERSEDED"


class TeamMemberDisposition(StrEnum):
    INCLUDED = "INCLUDED"
    DEFERRED = "DEFERRED"
    EXCLUDED = "EXCLUDED"


@dataclass(frozen=True, slots=True)
class TeamProposal:
    id: TeamProposalId
    thread_id: ComposerThreadId
    phase: TeamPhase
    status: TeamProposalStatus
    rationale_summary: str
    created_at: datetime
    decided_at: datetime | None = None

    def __post_init__(self) -> None:
        rationale = self.rationale_summary.strip()
        if not rationale or len(rationale) > MAX_TEAM_SUMMARY_LENGTH:
            raise DomainInvariantError("Team proposal rationale must be bounded and non-empty")

        created_at = to_utc(self.created_at)
        decided_at = None if self.decided_at is None else to_utc(self.decided_at)

        if self.status is TeamProposalStatus.PROPOSED and decided_at is not None:
            raise DomainInvariantError("Proposed team must not have decided_at")

        if self.status is not TeamProposalStatus.PROPOSED and decided_at is None:
            raise DomainInvariantError("Decided team proposal must have decided_at")

        if decided_at is not None and decided_at < created_at:
            raise DomainInvariantError("Team proposal decided_at must not precede created_at")

        object.__setattr__(self, "rationale_summary", rationale)
        object.__setattr__(self, "created_at", created_at)
        object.__setattr__(self, "decided_at", decided_at)


@dataclass(frozen=True, slots=True)
class TeamProposalMember:
    proposal_id: TeamProposalId
    role_key: str
    disposition: TeamMemberDisposition
    reason: str
    order_hint: int

    def __post_init__(self) -> None:
        role_key = self.role_key.strip()
        reason = self.reason.strip()

        if not role_key:
            raise DomainInvariantError("Team proposal role_key must not be empty")
        if not reason or len(reason) > MAX_TEAM_REASON_LENGTH:
            raise DomainInvariantError("Team proposal member reason must be bounded and non-empty")
        if self.order_hint < 0:
            raise DomainInvariantError("Team proposal order_hint must not be negative")

        object.__setattr__(self, "role_key", role_key)
        object.__setattr__(self, "reason", reason)
