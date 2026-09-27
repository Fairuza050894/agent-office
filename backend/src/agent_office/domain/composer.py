"""Universal Composer planning-domain primitives."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.identifiers import (
    ComposerMessageId,
    ComposerThreadId,
    ExecutorId,
    ProjectId,
    WorkflowDefinitionId,
)
from agent_office.domain.timestamps import to_utc

MAX_COMPOSER_MESSAGE_LENGTH = 16_000
MAX_COMPOSER_TITLE_LENGTH = 240
MAX_TIMEZONE_LENGTH = 100


class ComposerIntent(StrEnum):
    AUTO = "AUTO"
    ASK = "ASK"
    PLAN = "PLAN"
    BRAINSTORM = "BRAINSTORM"
    RUN = "RUN"


class ComposerThreadStatus(StrEnum):
    OPEN = "OPEN"
    ACTIVE = "ACTIVE"
    AWAITING_USER = "AWAITING_USER"
    COMPLETED = "COMPLETED"
    ARCHIVED = "ARCHIVED"


class ComposerActorType(StrEnum):
    USER = "USER"
    ROLE = "ROLE"
    SYSTEM = "SYSTEM"


class ComposerMessageKind(StrEnum):
    USER_PROMPT = "USER_PROMPT"
    ROLE_CONTRIBUTION = "ROLE_CONTRIBUTION"
    SYSTEM_SUMMARY = "SYSTEM_SUMMARY"


@dataclass(frozen=True, slots=True)
class ComposerThread:
    id: ComposerThreadId
    project_id: ProjectId | None
    requested_intent: ComposerIntent
    resolved_intent: ComposerIntent | None
    status: ComposerThreadStatus
    timezone: str
    executor_id: ExecutorId | None
    workflow_id: WorkflowDefinitionId | None
    created_at: datetime
    updated_at: datetime
    title: str | None = None
    completed_at: datetime | None = None

    def __post_init__(self) -> None:
        timezone = self.timezone.strip()
        if not timezone or len(timezone) > MAX_TIMEZONE_LENGTH:
            raise DomainInvariantError("Composer timezone must be a bounded non-empty value")

        title = None if self.title is None else self.title.strip()
        if title == "":
            title = None
        if title is not None and len(title) > MAX_COMPOSER_TITLE_LENGTH:
            raise DomainInvariantError("Composer title exceeds the bounded length")

        if self.resolved_intent is ComposerIntent.AUTO:
            raise DomainInvariantError("Resolved Composer intent must not be AUTO")

        created_at = to_utc(self.created_at)
        updated_at = to_utc(self.updated_at)
        completed_at = None if self.completed_at is None else to_utc(self.completed_at)

        if updated_at < created_at:
            raise DomainInvariantError("Composer thread updated_at must not precede created_at")

        if self.status in {ComposerThreadStatus.COMPLETED, ComposerThreadStatus.ARCHIVED}:
            if completed_at is None:
                raise DomainInvariantError("Terminal Composer thread must have completed_at")
        elif completed_at is not None:
            raise DomainInvariantError("Non-terminal Composer thread must not have completed_at")

        object.__setattr__(self, "timezone", timezone)
        object.__setattr__(self, "title", title)
        object.__setattr__(self, "created_at", created_at)
        object.__setattr__(self, "updated_at", updated_at)
        object.__setattr__(self, "completed_at", completed_at)


@dataclass(frozen=True, slots=True)
class ComposerMessage:
    id: ComposerMessageId
    thread_id: ComposerThreadId
    actor_type: ComposerActorType
    message_kind: ComposerMessageKind
    content: str
    created_at: datetime
    role_key: str | None = None

    def __post_init__(self) -> None:
        content = self.content.strip()
        role_key = None if self.role_key is None else self.role_key.strip()

        if not content or len(content) > MAX_COMPOSER_MESSAGE_LENGTH:
            raise DomainInvariantError("Composer message content must be bounded and non-empty")

        if self.actor_type is ComposerActorType.ROLE and not role_key:
            raise DomainInvariantError("ROLE Composer message must identify a role")

        if self.actor_type is not ComposerActorType.ROLE and role_key is not None:
            raise DomainInvariantError("Only ROLE Composer messages may carry role_key")

        object.__setattr__(self, "content", content)
        object.__setattr__(self, "role_key", role_key)
        object.__setattr__(self, "created_at", to_utc(self.created_at))
