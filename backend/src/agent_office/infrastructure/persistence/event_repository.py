"""SQLite adapter for normalized Event persistence."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime

from agent_office.application.events.errors import EventPersistenceError
from agent_office.application.events.ports import EventCursor
from agent_office.domain import (
    AgentRunId,
    Event,
    EventId,
    EventPayload,
    EventPayloadValue,
    EventSource,
    EventType,
    ExecutorId,
    ProjectId,
    RunId,
    to_utc,
)
from agent_office.persistence import SQLiteDatabase

_COLUMNS = """
    id,
    schema_version,
    event_type,
    project_id,
    run_id,
    agent_run_id,
    source,
    source_ref,
    occurred_at,
    recorded_at,
    sequence,
    correlation_id,
    causation_id,
    payload_json,
    redacted_keys_json,
    external_event_id,
    executor_id,
    dedupe_key,
    created_at
"""

_COLUMN_COUNT = 19


class SQLiteEventRepository:
    """Persist normalized Events in durable order without exposing SQLite."""

    def __init__(self, database: SQLiteDatabase) -> None:
        self._database = database

    def append(self, event: Event) -> bool:
        """Persist an Event.

        Returns False when an Event with the same external deduplication key is
        already durable, so duplicate delivery never creates a duplicate record.
        """

        try:
            with self._database.transaction() as connection:
                connection.execute(
                    f"""
                    INSERT INTO events ({_COLUMNS})
                    VALUES ({", ".join("?" * _COLUMN_COUNT)})
                    """,
                    self._parameters(event),
                )
        except sqlite3.IntegrityError as exc:
            if event.dedupe_key is not None and self._dedupe_key_exists(event.dedupe_key):
                return False

            raise EventPersistenceError(
                "Event could not be persisted because a persistence invariant was violated"
            ) from exc

        return True

    def _dedupe_key_exists(self, dedupe_key: str) -> bool:
        with self._database.connection() as connection:
            row = connection.execute(
                """
                SELECT 1
                FROM events
                WHERE dedupe_key = ?
                """,
                (dedupe_key,),
            ).fetchone()

        return row is not None

    def get(self, event_id: EventId) -> Event | None:
        with self._database.connection() as connection:
            row = connection.execute(
                """
                SELECT *
                FROM events
                WHERE id = ?
                """,
                (str(event_id),),
            ).fetchone()

        return None if row is None else _hydrate(row)

    def list_by_run(
        self,
        run_id: RunId,
        *,
        limit: int,
        after: EventCursor | None = None,
    ) -> tuple[Event, ...]:
        parameters: tuple[object, ...]

        if after is None:
            statement = """
                SELECT *
                FROM events
                WHERE run_id = ?
                ORDER BY recorded_at ASC, id ASC
                LIMIT ?
            """
            parameters = (str(run_id), limit)
        else:
            statement = """
                SELECT *
                FROM events
                WHERE run_id = ?
                  AND (recorded_at, id) > (?, ?)
                ORDER BY recorded_at ASC, id ASC
                LIMIT ?
            """
            parameters = (
                str(run_id),
                _serialize_datetime(after.recorded_at),
                str(after.event_id),
                limit,
            )

        with self._database.connection() as connection:
            rows = connection.execute(statement, parameters).fetchall()

        return tuple(_hydrate(row) for row in rows)

    def list_by_agent_run(
        self,
        agent_run_id: AgentRunId,
        *,
        limit: int,
    ) -> tuple[Event, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM events
                WHERE agent_run_id = ?
                ORDER BY recorded_at ASC, id ASC
                LIMIT ?
                """,
                (str(agent_run_id), limit),
            ).fetchall()

        return tuple(_hydrate(row) for row in rows)

    def _parameters(self, event: Event) -> tuple[object, ...]:
        return (
            str(event.id),
            event.schema_version,
            event.event_type.value,
            str(event.project_id),
            str(event.run_id),
            None if event.agent_run_id is None else str(event.agent_run_id),
            event.source.value,
            event.source_ref,
            _serialize_datetime(event.occurred_at),
            _serialize_datetime(event.recorded_at),
            event.sequence,
            event.correlation_id,
            event.causation_id,
            json.dumps(dict(event.payload)),
            json.dumps(list(event.redacted_keys)),
            event.external_event_id,
            None if event.executor_id is None else str(event.executor_id),
            event.dedupe_key,
            _serialize_datetime(event.created_at),
        )


def _hydrate(row: sqlite3.Row) -> Event:
    raw_agent_run_id = row["agent_run_id"]
    raw_executor_id = row["executor_id"]

    return Event(
        id=EventId.parse(row["id"]),
        schema_version=int(row["schema_version"]),
        event_type=EventType(row["event_type"]),
        project_id=ProjectId.parse(row["project_id"]),
        run_id=RunId.parse(row["run_id"]),
        agent_run_id=None if raw_agent_run_id is None else AgentRunId.parse(raw_agent_run_id),
        source=EventSource(row["source"]),
        source_ref=row["source_ref"],
        occurred_at=_parse_datetime(row["occurred_at"]),
        recorded_at=_parse_datetime(row["recorded_at"]),
        sequence=None if row["sequence"] is None else int(row["sequence"]),
        correlation_id=row["correlation_id"],
        causation_id=row["causation_id"],
        payload=_parse_payload(row["payload_json"]),
        redacted_keys=tuple(json.loads(row["redacted_keys_json"])),
        external_event_id=row["external_event_id"],
        executor_id=None if raw_executor_id is None else ExecutorId.parse(raw_executor_id),
        created_at=_parse_datetime(row["created_at"]),
    )


def _parse_payload(value: str) -> EventPayload:
    document = json.loads(value)
    pairs: list[tuple[str, EventPayloadValue]] = []

    for key, raw_value in document.items():
        if raw_value is None or isinstance(raw_value, str | int | bool):
            pairs.append((str(key), raw_value))

    return tuple(pairs)


def _serialize_datetime(value: datetime) -> str:
    return to_utc(value).isoformat()


def _parse_datetime(value: str) -> datetime:
    return to_utc(datetime.fromisoformat(value))
