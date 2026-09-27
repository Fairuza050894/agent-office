"""RequirementCandidate planning-domain primitives."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
from enum import StrEnum

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.identifiers import ComposerThreadId, ProjectId, RequirementCandidateId
from agent_office.domain.timestamps import to_utc

MAX_REQUIREMENT_TEXT_LENGTH = 8_000


class RequirementStatus(StrEnum):
    PROPOSED = "PROPOSED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    DEFERRED = "DEFERRED"


@dataclass(frozen=True, slots=True)
class RequirementCandidate:
    id: RequirementCandidateId
    thread_id: ComposerThreadId
    project_id: ProjectId | None
    title: str
    problem: str
    requirement: str
    rationale: str
    source_roles: tuple[str, ...]
    status: RequirementStatus
    created_at: datetime
    updated_at: datetime
    acceptance_hint: str | None = None
    approved_at: datetime | None = None
    decided_at: datetime | None = None

    def __post_init__(self) -> None:
        title = self.title.strip()
        problem = self.problem.strip()
        requirement = self.requirement.strip()
        rationale = self.rationale.strip()
        hint = None if self.acceptance_hint is None else self.acceptance_hint.strip()
        roles = tuple(role.strip() for role in self.source_roles)

        if not title or len(title) > 240:
            raise DomainInvariantError("Requirement title must be bounded and non-empty")

        for label, value in (
            ("problem", problem),
            ("requirement", requirement),
            ("rationale", rationale),
        ):
            if not value or len(value) > MAX_REQUIREMENT_TEXT_LENGTH:
                raise DomainInvariantError(
                    f"Requirement {label} must be bounded and non-empty"
                )

        if hint == "":
            hint = None
        if hint is not None and len(hint) > MAX_REQUIREMENT_TEXT_LENGTH:
            raise DomainInvariantError("Requirement acceptance_hint exceeds bounded length")
        if any(not role for role in roles):
            raise DomainInvariantError("Requirement source role must not be blank")
        if len(set(roles)) != len(roles):
            raise DomainInvariantError("Requirement source roles must be unique")

        created_at = to_utc(self.created_at)
        updated_at = to_utc(self.updated_at)
        approved_at = None if self.approved_at is None else to_utc(self.approved_at)
        decided_at = None if self.decided_at is None else to_utc(self.decided_at)

        if updated_at < created_at:
            raise DomainInvariantError("Requirement updated_at must not precede created_at")

        if self.status is RequirementStatus.PROPOSED:
            if approved_at is not None or decided_at is not None:
                raise DomainInvariantError("Proposed requirement must not be decided")
        else:
            if decided_at is None:
                raise DomainInvariantError("Decided requirement must have decided_at")
            if decided_at < created_at:
                raise DomainInvariantError("Requirement decided_at must not precede created_at")

        if self.status is RequirementStatus.APPROVED:
            if approved_at is None or approved_at != decided_at:
                raise DomainInvariantError(
                    "Approved requirement must set approved_at equal to decided_at"
                )
        elif approved_at is not None:
            raise DomainInvariantError("Only approved requirement may have approved_at")

        object.__setattr__(self, "title", title)
        object.__setattr__(self, "problem", problem)
        object.__setattr__(self, "requirement", requirement)
        object.__setattr__(self, "rationale", rationale)
        object.__setattr__(self, "acceptance_hint", hint)
        object.__setattr__(self, "source_roles", roles)
        object.__setattr__(self, "created_at", created_at)
        object.__setattr__(self, "updated_at", updated_at)
        object.__setattr__(self, "approved_at", approved_at)
        object.__setattr__(self, "decided_at", decided_at)

    def decide(self, status: RequirementStatus, decided_at: datetime) -> RequirementCandidate:
        if self.status is not RequirementStatus.PROPOSED:
            raise DomainInvariantError("Requirement decision is immutable once recorded")
        if status is RequirementStatus.PROPOSED:
            raise DomainInvariantError("Requirement decision must leave PROPOSED state")

        timestamp = to_utc(decided_at)
        return replace(
            self,
            status=status,
            updated_at=timestamp,
            decided_at=timestamp,
            approved_at=timestamp if status is RequirementStatus.APPROVED else None,
        )
