"""Explicit migration coverage for the Phase 3C schema (v5 -> v6).

The migration is additive: Phase 2 data, Phase 3A workflow history, and Phase 3B
execution history must all survive it unchanged, and the new append-only
guarantee must be enforced by the schema rather than by convention.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from agent_office.persistence import LATEST_SCHEMA_VERSION, MIGRATIONS, SQLiteDatabase


def _version(database: SQLiteDatabase) -> int:
    with database.connection() as connection:
        row = connection.execute(
            "SELECT value FROM schema_metadata WHERE key = 'schema_version'"
        ).fetchone()

    return int(row["value"])


def _tables(database: SQLiteDatabase) -> set[str]:
    with database.connection() as connection:
        rows = connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()

    return {row["name"] for row in rows}


def test_latest_schema_version_is_at_least_six() -> None:
    """Phase 3C introduced version 6; later phases must only add to it."""

    assert LATEST_SCHEMA_VERSION >= 6


def test_empty_database_migrates_to_the_latest_version(tmp_path: Path) -> None:
    database = SQLiteDatabase(tmp_path / "empty.sqlite")
    database.initialize()

    assert _version(database) == LATEST_SCHEMA_VERSION
    assert "audit_records" in _tables(database)


def _seed_at_version(path: Path, version: int) -> None:
    """Build a genuine database at an earlier schema version."""

    connection = sqlite3.connect(path)
    connection.isolation_level = None

    try:
        for step in range(1, version + 1):
            MIGRATIONS[step](connection)

        connection.execute(
            "INSERT INTO schema_metadata (key, value) VALUES ('schema_version', ?)",
            (str(version),),
        )
    finally:
        connection.close()


def test_phase_three_b_database_migrates_forward_in_place(tmp_path: Path) -> None:
    """A real v5 database gains the audit table and keeps every earlier object."""

    path = tmp_path / "phase3b.sqlite"
    _seed_at_version(path, 5)

    before = SQLiteDatabase(path)
    tables_before = _tables(before)

    database = SQLiteDatabase(path)
    database.initialize()

    assert _version(database) >= 6
    assert tables_before <= _tables(database)
    assert "audit_records" in _tables(database)

    with database.connection() as conn:
        row = conn.execute("SELECT remediation_cycles_used FROM runs LIMIT 1").fetchone()

    # A new column added by a later migration defaults cleanly on an empty table.
    assert row is None


def test_migrated_database_accepts_an_audit_record(tmp_path: Path) -> None:
    """The new table is usable immediately after migration."""

    from agent_office.domain import (
        AuditAction,
        AuditActorType,
        AuditRecord,
        AuditRecordId,
        AuditTargetType,
        ExecutorId,
        utc_now,
    )
    from agent_office.infrastructure.persistence import SQLiteAuditRecordRepository

    database = SQLiteDatabase(tmp_path / "writable.sqlite")
    database.initialize()

    repository = SQLiteAuditRecordRepository(database)
    repository.append(
        AuditRecord(
            id=AuditRecordId.new(),
            actor_type=AuditActorType.USER,
            action=AuditAction.RUN_CANCELLATION_REQUESTED,
            target_type=AuditTargetType.EXECUTOR,
            target_id=str(ExecutorId.new()),
            occurred_at=utc_now(),
            safe_metadata=(("status", "BLOCKED"),),
        )
    )

    with database.connection() as connection:
        rows = connection.execute("SELECT * FROM audit_records").fetchall()

    assert len(rows) == 1
    assert rows[0]["action"] == "RUN_CANCELLATION_REQUESTED"


def test_audit_table_is_append_only_by_schema(tmp_path: Path) -> None:
    """The triggers are part of the schema, not an application convention."""

    database = SQLiteDatabase(tmp_path / "triggers.sqlite")
    database.initialize()

    with database.connection() as connection:
        triggers = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'trigger'"
            ).fetchall()
        }

    assert triggers == {
        "audit_records_append_only_update",
        "audit_records_append_only_delete",
    }


def test_migration_is_idempotent(tmp_path: Path) -> None:
    """Re-running initialize on a current database changes nothing."""

    database = SQLiteDatabase(tmp_path / "idempotent.sqlite")
    database.initialize()
    before = _tables(database)

    database.initialize()

    assert _version(database) == LATEST_SCHEMA_VERSION
    assert _tables(database) == before


def test_newer_schema_is_rejected_not_downgraded(tmp_path: Path) -> None:
    """A database from a future version is never silently rewritten."""

    from agent_office.persistence import DatabaseVersionError

    path = tmp_path / "future.sqlite"

    connection = sqlite3.connect(path)
    connection.execute("CREATE TABLE schema_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    connection.execute("INSERT INTO schema_metadata (key, value) VALUES ('schema_version', '99')")
    connection.commit()
    connection.close()

    database = SQLiteDatabase(path)

    try:
        database.initialize()
    except DatabaseVersionError:
        return

    raise AssertionError("A newer schema version must not be accepted")
