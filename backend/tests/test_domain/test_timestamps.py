"""Tests for Agent Office timestamp primitives."""

from datetime import UTC, datetime, timedelta, timezone

import pytest

from agent_office.domain import DomainInvariantError, to_utc, utc_now


def test_utc_now_returns_aware_utc_datetime() -> None:
    value = utc_now()

    assert value.tzinfo is UTC
    assert value.utcoffset() == timedelta(0)


def test_utc_now_supports_deterministic_clock() -> None:
    fixed = datetime(2026, 9, 14, 17, 0, tzinfo=UTC)

    value = utc_now(lambda: fixed)

    assert value == fixed


def test_aware_timestamp_is_normalized_to_utc() -> None:
    jakarta = timezone(timedelta(hours=7))
    local = datetime(2026, 9, 15, 0, 0, tzinfo=jakarta)

    normalized = to_utc(local)

    assert normalized == datetime(2026, 9, 14, 17, 0, tzinfo=UTC)


def test_naive_timestamp_is_rejected() -> None:
    naive = datetime(2026, 9, 15, 0, 0)

    with pytest.raises(
        DomainInvariantError,
        match="timezone-aware",
    ):
        to_utc(naive)
