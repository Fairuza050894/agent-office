"""SQLite adapter for append-only AuditRecord persistence."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime

from agent_office.application.audit.errors import AuditPersistenceError
from agent_office.domain import (
    AuditAction,
    AuditActorType,
    AuditRecord,
    AuditRecordId,
    AuditTargetType,
    ProjectId,
    RunId,
    to_utc,
)
from agent_office.persistence import SQLiteDatabase

_COLUMNS = """
    id,
    project_id,
    run_id,
    actor_type,
    action,
    target_type,
    target_id,
    occurred_at,
    safe_metadata_json
"""

_COLUMN_COUNT = 9


class SQLiteAuditRecordRepository:
    """Persist AuditRecords without exposing SQLite to the application layer.

    Only insert and read are implemented. The Phase 3 schema additionally
    rejects UPDATE and DELETE at the storage layer, so audit history cannot be
    rewritten even through a direct SQL caller.
    """

    def __init__(self, database: SQLiteDatabase) -> None:
        self._database = database

    def append(self, record: AuditRecord) -> None:
        try:
            with self._database.transaction() as connection:
                connection.execute(
                    f"""
                    INSERT INTO audit_records ({_COLUMNS})
                    VALUES ({", ".join("?" * _COLUMN_COUNT)})
                    """,
                    self._parameters(record),
                )
        except sqlite3.IntegrityError as exc:
            raise AuditPersistenceError(
                "AuditRecord could not be persisted because a persistence invariant was violated"
            ) from exc

    def list_by_run(self, run_id: RunId) -> tuple[AuditRecord, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM audit_records
                WHERE run_id = ?
                ORDER BY occurred_at ASC, rowid ASC
                """,
                (str(run_id),),
            ).fetchall()

        return tuple(_hydrate(row) for row in rows)

    def _parameters(self, record: AuditRecord) -> tuple[object, ...]:
        return (
            str(record.id),
            None if record.project_id is None else str(record.project_id),
            None if record.run_id is None else str(record.run_id),
            record.actor_type.value,
            record.action.value,
            record.target_type.value,
            record.target_id,
            _serialize_datetime(record.occurred_at),
            json.dumps(dict(record.safe_metadata), sort_keys=True),
        )


def _serialize_datetime(value: datetime) -> str:
    return to_utc(value).isoformat()


def _hydrate(row: sqlite3.Row) -> AuditRecord:
    raw_project_id = row["project_id"]
    raw_run_id = row["run_id"]
    raw_target_id = row["target_id"]

    return AuditRecord(
        id=AuditRecordId.parse(row["id"]),
        project_id=None if raw_project_id is None else ProjectId.parse(raw_project_id),
        run_id=None if raw_run_id is None else RunId.parse(raw_run_id),
        actor_type=AuditActorType(row["actor_type"]),
        action=AuditAction(row["action"]),
        target_type=AuditTargetType(row["target_type"]),
        target_id=raw_target_id,
        occurred_at=datetime.fromisoformat(row["occurred_at"]),
        safe_metadata=tuple(
            (str(key), str(value)) for key, value in json.loads(row["safe_metadata_json"]).items()
        ),
    )
