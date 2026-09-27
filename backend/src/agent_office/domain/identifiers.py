"""Stable, provider-neutral domain identifiers."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Self
from uuid import UUID, uuid4

from agent_office.domain.errors import DomainInvariantError

UUIDFactory = Callable[[], UUID]


@dataclass(frozen=True, slots=True)
class DomainId:
    """Immutable UUID-backed domain identifier."""

    value: UUID

    def __post_init__(self) -> None:
        if not isinstance(self.value, UUID):
            raise DomainInvariantError(f"{type(self).__name__} must contain a UUID")

    @classmethod
    def new(cls, factory: UUIDFactory = uuid4) -> Self:
        """Create a new identifier using the supplied UUID factory."""

        value = factory()

        if not isinstance(value, UUID):
            raise DomainInvariantError("Domain identifier factory must return UUID")

        return cls(value)

    @classmethod
    def parse(cls, value: str | UUID) -> Self:
        """Parse an existing canonical identifier."""

        if isinstance(value, UUID):
            return cls(value)

        try:
            parsed = UUID(value)
        except (ValueError, AttributeError) as exc:
            raise DomainInvariantError(f"{value!r} is not a valid UUID") from exc

        return cls(parsed)

    def __str__(self) -> str:
        return str(self.value)


class ProjectId(DomainId):
    __slots__ = ()


class TaskId(DomainId):
    __slots__ = ()


class RunId(DomainId):
    __slots__ = ()


class WorkflowDefinitionId(DomainId):
    __slots__ = ()


class WorkflowSnapshotId(DomainId):
    __slots__ = ()


class AgentProfileId(DomainId):
    __slots__ = ()


class AgentRunId(DomainId):
    __slots__ = ()


class ExecutorId(DomainId):
    __slots__ = ()


class WorkspaceId(DomainId):
    __slots__ = ()


class EventId(DomainId):
    __slots__ = ()


class FindingId(DomainId):
    __slots__ = ()


class EvidenceId(DomainId):
    __slots__ = ()


class ArtifactId(DomainId):
    __slots__ = ()


class AuditRecordId(DomainId):
    __slots__ = ()


class ComposerThreadId(DomainId):
    __slots__ = ()


class ComposerMessageId(DomainId):
    __slots__ = ()


class TeamProposalId(DomainId):
    __slots__ = ()


class PlanningArtifactId(DomainId):
    __slots__ = ()


class RequirementCandidateId(DomainId):
    __slots__ = ()


class PlanningEventId(DomainId):
    __slots__ = ()
