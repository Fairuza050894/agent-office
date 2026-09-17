"""Event application package."""

from agent_office.application.events.errors import (
    EventCursorError,
    EventError,
    EventNotFoundError,
    EventPersistenceError,
    EventSchemaError,
    EventScopeError,
    EventTypeError,
)
from agent_office.application.events.ports import (
    DEFAULT_EVENT_PAGE_SIZE,
    MAX_EVENT_PAGE_SIZE,
    EventCursor,
    EventProcessingResult,
    EventRepository,
)
from agent_office.application.events.service import EventService

__all__ = [
    "DEFAULT_EVENT_PAGE_SIZE",
    "MAX_EVENT_PAGE_SIZE",
    "EventCursor",
    "EventCursorError",
    "EventError",
    "EventNotFoundError",
    "EventPersistenceError",
    "EventProcessingResult",
    "EventRepository",
    "EventSchemaError",
    "EventScopeError",
    "EventService",
    "EventTypeError",
]
