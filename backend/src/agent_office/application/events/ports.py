"""Application ports and value objects for normalized Events."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from agent_office.application.events.errors import EventCursorError
from agent_office.domain import AgentRunId, Event, EventId, RunId, to_utc

MAX_EVENT_PAGE_SIZE = 200

DEFAULT_EVENT_PAGE_SIZE = 50


@dataclass(frozen=True, slots=True)
class EventCursor:
    """Opaque, stable keyset cursor over the durable event history.

    ``recorded_at`` and event ID form a total order, so a cursor never skips or
    repeats an event even when timestamps collide.
    """

    recorded_at: datetime
    event_id: EventId

    def __post_init__(self) -> None:
        object.__setattr__(self, "recorded_at", to_utc(self.recorded_at))

    def encode(self) -> str:
        """Encode the cursor into a transport-safe opaque string."""

        return f"{self.recorded_at.isoformat()}|{self.event_id}"

    @classmethod
    def decode(cls, value: str) -> EventCursor:
        """Decode an opaque cursor, failing safely when malformed."""

        separator = "|"

        if separator not in value:
            raise EventCursorError("Event cursor is malformed")

        raw_recorded_at, _, raw_event_id = value.partition(separator)

        try:
            recorded_at = datetime.fromisoformat(raw_recorded_at)
            event_id = EventId.parse(raw_event_id)
        except (ValueError, TypeError) as exc:
            raise EventCursorError("Event cursor is malformed") from exc

        return cls(recorded_at=recorded_at, event_id=event_id)


@dataclass(frozen=True, slots=True)
class EventProcessingResult:
    """Outcome of processing one inbound normalized Event.

    Event persistence and state transition are deliberately separate: a
    historical event may be valid even when it no longer changes current state.
    """

    persisted: bool
    duplicate: bool
    state_changed: bool
    ignored_for_state_reason: str | None = None
    diagnostics: tuple[str, ...] = ()


class EventRepository(Protocol):
    """Persistence boundary for normalized Events."""

    def append(self, event: Event) -> bool:
        """Persist an Event, returning False when it is a known duplicate."""
        ...

    def get(self, event_id: EventId) -> Event | None:
        """Return an Event by ID."""
        ...

    def list_by_run(
        self,
        run_id: RunId,
        *,
        limit: int,
        after: EventCursor | None = None,
    ) -> tuple[Event, ...]:
        """Return Events for a Run in durable order, after a cursor."""
        ...

    def list_by_agent_run(
        self,
        agent_run_id: AgentRunId,
        *,
        limit: int,
    ) -> tuple[Event, ...]:
        """Return Events for one AgentRun in durable order."""
        ...
