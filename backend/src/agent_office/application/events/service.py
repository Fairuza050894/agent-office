"""Event application service.

Owns normalized Event creation, durable persistence, and duplicate-tolerant
ingestion. Duplicate delivery never repeats a workflow effect because the
durable event store rejects repeated external identities and because state
transitions are guarded separately.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime

from agent_office.application.events.errors import EventNotFoundError
from agent_office.application.events.ports import (
    DEFAULT_EVENT_PAGE_SIZE,
    MAX_EVENT_PAGE_SIZE,
    EventCursor,
    EventRepository,
)
from agent_office.domain import (
    EVENT_SCHEMA_VERSION,
    AgentRunId,
    Event,
    EventId,
    EventPayloadValue,
    EventSource,
    EventType,
    ExecutorId,
    Run,
    RunId,
    build_payload,
    utc_now,
)

Clock = Callable[[], datetime]

EventIdFactory = Callable[[], EventId]


class EventService:
    """Coordinates normalized Event persistence and query."""

    def __init__(
        self,
        repository: EventRepository,
        *,
        clock: Clock = utc_now,
        event_id_factory: EventIdFactory = EventId.new,
    ) -> None:
        self._repository = repository
        self._clock = clock
        self._event_id_factory = event_id_factory

    def emit(
        self,
        run: Run,
        event_type: EventType,
        *,
        source: EventSource,
        payload: tuple[tuple[str, EventPayloadValue], ...] = (),
        agent_run_id: AgentRunId | None = None,
        source_ref: str | None = None,
        executor_id: ExecutorId | None = None,
        external_event_id: str | None = None,
        occurred_at: datetime | None = None,
        sequence: int | None = None,
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> Event:
        """Build and durably record one normalized Event for a Run."""

        now = utc_now(self._clock)
        retained, redacted = build_payload(payload)

        event = Event(
            id=self._event_id_factory(),
            schema_version=EVENT_SCHEMA_VERSION,
            event_type=event_type,
            project_id=run.project_id,
            run_id=run.id,
            agent_run_id=agent_run_id,
            source=source,
            source_ref=source_ref,
            occurred_at=now if occurred_at is None else occurred_at,
            recorded_at=now,
            sequence=sequence,
            correlation_id=correlation_id,
            causation_id=causation_id,
            payload=retained,
            redacted_keys=redacted,
            external_event_id=external_event_id,
            executor_id=executor_id,
            created_at=now,
        )

        self.record(event)
        return event

    def record(self, event: Event) -> bool:
        """Durably record an Event, returning False for a known duplicate."""

        return self._repository.append(event)

    def get(self, event_id: EventId) -> Event:
        """Return an Event by ID."""

        event = self._repository.get(event_id)

        if event is None:
            raise EventNotFoundError(f"Event {event_id} was not found")

        return event

    def find(self, event_id: EventId) -> Event | None:
        """Return an Event by ID when it exists."""

        return self._repository.get(event_id)

    def list_for_run(
        self,
        run_id: RunId,
        *,
        limit: int = DEFAULT_EVENT_PAGE_SIZE,
        after: EventCursor | None = None,
    ) -> tuple[Event, ...]:
        """Return durable Events for a Run in recorded order."""

        return self._repository.list_by_run(
            run_id,
            limit=_bounded_limit(limit),
            after=after,
        )

    def list_for_agent_run(
        self,
        agent_run_id: AgentRunId,
        *,
        limit: int = DEFAULT_EVENT_PAGE_SIZE,
    ) -> tuple[Event, ...]:
        """Return durable Events for one AgentRun in recorded order."""

        return self._repository.list_by_agent_run(agent_run_id, limit=_bounded_limit(limit))


def _bounded_limit(limit: int) -> int:
    if limit < 1:
        return DEFAULT_EVENT_PAGE_SIZE

    return min(limit, MAX_EVENT_PAGE_SIZE)
