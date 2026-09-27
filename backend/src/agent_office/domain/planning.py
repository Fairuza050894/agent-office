"""Structured planning artifacts and separate planning-event truth."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.identifiers import (
    ComposerThreadId,
    PlanningArtifactId,
    PlanningEventId,
    ProjectId,
)
from agent_office.domain.timestamps import to_utc

PlanningValue = str | int | bool | None
PlanningContent = tuple[tuple[str, PlanningValue], ...]

MAX_PLANNING_CONTENT_ENTRIES = 32
MAX_PLANNING_CONTENT_BYTES = 16_384
MAX_PLANNING_VALUE_LENGTH = 4_000
_SECRET_KEY_FRAGMENTS = (
    "apikey",
    "api_key",
    "authorization",
    "cookie",
    "credential",
    "password",
    "private_key",
    "secret",
    "token",
)


class PlanningArtifactType(StrEnum):
    BRIEF = "BRIEF"
    NOTE = "NOTE"
    DECISION = "DECISION"
    QUESTION = "QUESTION"
    RISK = "RISK"
    ACTION = "ACTION"


class PlanningArtifactStatus(StrEnum):
    DRAFT = "DRAFT"
    OPEN = "OPEN"
    RESOLVED = "RESOLVED"
    ARCHIVED = "ARCHIVED"


class PlanningEventType(StrEnum):
    THREAD_CREATED = "composer.thread.created"
    MESSAGE_RECEIVED = "composer.message.received"
    INTENT_RESOLVED = "intent.resolved"
    TEAM_PROPOSED = "team.proposed"
    TEAM_ACCEPTED = "team.accepted"
    TEAM_REJECTED = "team.rejected"
    PLANNING_STARTED = "planning.started"
    CONTRIBUTION_RECORDED = "planning.contribution.recorded"
    ARTIFACT_CREATED = "planning.artifact.created"
    REQUIREMENT_PROPOSED = "requirement.proposed"
    REQUIREMENT_APPROVED = "requirement.approved"
    REQUIREMENT_REJECTED = "requirement.rejected"
    REQUIREMENT_DEFERRED = "requirement.deferred"
    PLANNING_COMPLETED = "planning.completed"


def build_planning_content(
    pairs: tuple[tuple[str, PlanningValue], ...],
) -> PlanningContent:
    if len(pairs) > MAX_PLANNING_CONTENT_ENTRIES:
        raise DomainInvariantError("Planning content declares too many entries")

    retained: list[tuple[str, PlanningValue]] = []
    seen: set[str] = set()

    for raw_key, value in pairs:
        key = raw_key.strip()
        lowered = key.lower()

        if not key:
            raise DomainInvariantError("Planning content key must not be empty")
        if lowered in seen:
            raise DomainInvariantError("Planning content keys must be unique")
        if any(fragment in lowered for fragment in _SECRET_KEY_FRAGMENTS):
            raise DomainInvariantError("Planning content must not contain secret-bearing keys")
        if isinstance(value, str) and len(value) > MAX_PLANNING_VALUE_LENGTH:
            raise DomainInvariantError("Planning content value exceeds the bounded length")

        seen.add(lowered)
        retained.append((key, value))

    if len(json.dumps(dict(retained), sort_keys=True).encode()) > MAX_PLANNING_CONTENT_BYTES:
        raise DomainInvariantError("Planning content exceeds the bounded size")

    return tuple(retained)


@dataclass(frozen=True, slots=True)
class PlanningArtifact:
    id: PlanningArtifactId
    thread_id: ComposerThreadId
    artifact_type: PlanningArtifactType
    title: str
    content: PlanningContent
    status: PlanningArtifactStatus
    created_at: datetime
    updated_at: datetime
    author_role_key: str | None = None

    def __post_init__(self) -> None:
        title = self.title.strip()
        author = None if self.author_role_key is None else self.author_role_key.strip()

        if not title or len(title) > 240:
            raise DomainInvariantError("Planning artifact title must be bounded and non-empty")
        if self.content != build_planning_content(self.content):
            raise DomainInvariantError("Planning artifact content is not normalized")

        created_at = to_utc(self.created_at)
        updated_at = to_utc(self.updated_at)
        if updated_at < created_at:
            raise DomainInvariantError("Planning artifact updated_at must not precede created_at")

        object.__setattr__(self, "title", title)
        object.__setattr__(self, "author_role_key", author)
        object.__setattr__(self, "created_at", created_at)
        object.__setattr__(self, "updated_at", updated_at)


@dataclass(frozen=True, slots=True)
class PlanningEvent:
    id: PlanningEventId
    thread_id: ComposerThreadId
    project_id: ProjectId | None
    event_type: PlanningEventType
    occurred_at: datetime
    recorded_at: datetime
    sequence: int
    payload: PlanningContent
    role_key: str | None = None

    def __post_init__(self) -> None:
        if self.sequence < 0:
            raise DomainInvariantError("Planning event sequence must not be negative")
        if self.payload != build_planning_content(self.payload):
            raise DomainInvariantError("Planning event payload is not normalized")

        role_key = None if self.role_key is None else self.role_key.strip()
        occurred_at = to_utc(self.occurred_at)
        recorded_at = to_utc(self.recorded_at)

        object.__setattr__(self, "role_key", role_key)
        object.__setattr__(self, "occurred_at", occurred_at)
        object.__setattr__(self, "recorded_at", recorded_at)
