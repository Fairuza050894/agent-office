"""Event application errors."""


class EventError(RuntimeError):
    """Base class for event application errors."""


class EventNotFoundError(EventError):
    """Raised when an Event does not exist."""


class EventPersistenceError(EventError):
    """Raised when a normalized Event cannot be persisted safely."""


class EventSchemaError(EventError):
    """Raised when an Event declares an unsupported schema version."""


class EventTypeError(EventError):
    """Raised when an Event declares an unknown canonical event type."""


class EventScopeError(EventError):
    """Raised when an Event contradicts its Project, Run, or AgentRun scope."""


class EventCursorError(EventError):
    """Raised when a pagination cursor cannot be interpreted."""
