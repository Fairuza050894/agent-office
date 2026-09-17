"""Tests for normalized Event primitives."""

from datetime import UTC, datetime, timedelta, timezone

import pytest

from agent_office.domain import (
    EVENT_SCHEMA_VERSION,
    DomainInvariantError,
    Event,
    EventId,
    EventSource,
    EventType,
    ExecutorId,
    ProjectId,
    RunId,
    build_payload,
)


def _event(**overrides: object) -> Event:
    now = datetime(2026, 9, 16, 12, 0, tzinfo=UTC)
    values: dict[str, object] = {
        "id": EventId.new(),
        "schema_version": EVENT_SCHEMA_VERSION,
        "event_type": EventType.RUN_CREATED,
        "project_id": ProjectId.new(),
        "run_id": RunId.new(),
        "source": EventSource.ORCHESTRATOR,
        "occurred_at": now,
        "recorded_at": now,
        "payload": (),
        "created_at": now,
    }
    values.update(overrides)

    return Event(**values)  # type: ignore[arg-type]


def test_event_types_are_provider_neutral() -> None:
    # Canonical event domains from EVENT_CONTRACT §17.
    canonical_domains = {
        "run",
        "workflow",
        "stage",
        "agent",
        "executor",
        "remediation",
        "verification",
        "workspace",
    }
    provider_names = ("codex", "antigravity", "openclaw", "deepseek", "hermes")

    for event_type in EventType:
        assert event_type.value.split(".")[0] in canonical_domains
        assert not any(name in event_type.value for name in provider_names)


def test_canonical_taxonomy_rejects_invented_event_types() -> None:
    """The taxonomy is closed: reconciliation is an executor-session fact."""

    values = {event_type.value for event_type in EventType}

    # EVENT_CONTRACT §36 lists exactly one reconciliation event.
    assert "executor.session.reconciled" in values

    # EVENT_CONTRACT §30 lists the canonical run events. A Run is never the
    # subject of its own reconciliation event.
    assert "run.reconciled" not in values
    assert {"run.blocked", "run.resumed", "run.cancelled"} <= values


def test_unsupported_schema_version_is_rejected() -> None:
    with pytest.raises(DomainInvariantError, match="schema version"):
        _event(schema_version=99)


def test_payload_drops_secret_bearing_keys() -> None:
    payload, redacted = build_payload(
        (
            ("stage_key", "REVIEW"),
            ("api_token", "super-secret-value"),
            ("authorization", "Bearer abc"),
        )
    )

    assert dict(payload) == {"stage_key": "REVIEW"}
    assert redacted == ("api_token", "authorization")
    assert "super-secret-value" not in str(payload)


def test_payload_rejects_duplicate_keys() -> None:
    with pytest.raises(DomainInvariantError, match="unique"):
        build_payload((("stage_key", "REVIEW"), ("stage_key", "DISCOVERY")))


def test_payload_rejects_oversized_values() -> None:
    with pytest.raises(DomainInvariantError, match="bounded length"):
        build_payload((("summary", "x" * 5000),))


def test_dedupe_key_requires_executor_session_and_external_identity() -> None:
    executor_id = ExecutorId.new()

    without_identity = _event()
    assert without_identity.dedupe_key is None

    partially_identified = _event(executor_id=executor_id)
    assert partially_identified.dedupe_key is None

    identified = _event(
        executor_id=executor_id,
        source_ref="reference-session-000001",
        external_event_id="provider-event-1",
    )
    assert identified.dedupe_key == (f"{executor_id}|reference-session-000001|provider-event-1")


def test_naive_event_timestamps_are_rejected() -> None:
    naive = datetime(2026, 9, 16, 12, 0)

    with pytest.raises(DomainInvariantError, match="timezone-aware"):
        _event(occurred_at=naive)


def test_event_timestamps_are_normalized_to_utc() -> None:
    offset = timezone(timedelta(hours=2))
    event = _event(occurred_at=datetime(2026, 9, 16, 12, 0, tzinfo=offset))

    assert event.occurred_at == datetime(2026, 9, 16, 10, 0, tzinfo=UTC)
    assert event.occurred_at.utcoffset() == timedelta(0)
