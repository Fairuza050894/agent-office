"""Safe HTTP DTOs for normalized Events."""

from __future__ import annotations

from datetime import datetime
from typing import Self

from pydantic import BaseModel

from agent_office.domain import Event, EventSource, EventType


class EventResponse(BaseModel):
    """Public Event representation.

    Raw provider payloads never reach this model: persisted payloads are already
    normalized and secret-redacted. Executor internal session references and the
    deduplication key are intentionally not exposed.
    """

    id: str
    schema_version: int
    event_type: EventType
    project_id: str
    run_id: str
    agent_run_id: str | None
    source: EventSource
    occurred_at: datetime
    recorded_at: datetime
    sequence: int | None
    correlation_id: str | None
    causation_id: str | None
    payload: dict[str, str | int | bool | None]
    redacted_keys: list[str]
    created_at: datetime

    @classmethod
    def from_domain(cls, event: Event) -> Self:
        return cls(
            id=str(event.id),
            schema_version=event.schema_version,
            event_type=event.event_type,
            project_id=str(event.project_id),
            run_id=str(event.run_id),
            agent_run_id=None if event.agent_run_id is None else str(event.agent_run_id),
            source=event.source,
            occurred_at=event.occurred_at,
            recorded_at=event.recorded_at,
            sequence=event.sequence,
            correlation_id=event.correlation_id,
            causation_id=event.causation_id,
            payload=dict(event.payload),
            redacted_keys=list(event.redacted_keys),
            created_at=event.created_at,
        )


class EventPageResponse(BaseModel):
    """One page of durable Event history."""

    events: list[EventResponse]
    next_cursor: str | None
