"""UTC timestamp primitives for Agent Office domain objects."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime

from agent_office.domain.errors import DomainInvariantError

Clock = Callable[[], datetime]


def to_utc(value: datetime) -> datetime:
    """Validate an aware datetime and normalize it to UTC."""

    if value.tzinfo is None or value.utcoffset() is None:
        raise DomainInvariantError("Domain timestamps must be timezone-aware")

    return value.astimezone(UTC)


def utc_now(clock: Clock | None = None) -> datetime:
    """Return the current UTC time through a testable clock boundary."""

    value = datetime.now(UTC) if clock is None else clock()
    return to_utc(value)
