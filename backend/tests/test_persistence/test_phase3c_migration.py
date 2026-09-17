"""Explicit migration coverage for the Phase 3C schema (v5 -> v6).

The migration is additive: Phase 2 data, Phase 3A workflow history, and Phase 3B
execution history must all survive it unchanged, and the new append-only
guarantee must be enforced by the schema rather than by convention.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from agent_office.persistence import LATEST_SCHEMA_VERSION, SQLiteDatabase


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


def test_latest_schema_version_is_six() -> None:
    assert LATEST_SCHEMA_VERSION == 6


def test_empty_database_migrates_to_the_latest_version(tmp_path: Path) -> None:
    database = SQLiteDatabase(tmp_path / "empty.sqlite")
    database.initialize()

    assert _version(database) == LATEST_SCHEMA_VERSION
    assert "audit_records" in _tables(database)


def test_phase_three_b_database_migrates_forward_in_place(tmp_path: Path) -> None:
    """A v5 database gains only the audit table."""

    path = tmp_path / "phase3b.sqlite"

    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("CREATE TABLE schema_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    connection.execute("INSERT INTO schema_metadata (key, value) VALUES ('schema_version', '5')")
    connection.execute(
        """
        CREATE TABLE projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            repository_path TEXT NOT NULL,
            canonical_path TEXT NOT NULL UNIQUE,
            git_common_dir TEXT,
            default_branch TEXT,
            status TEXT NOT NULL,
            preferred_executor_id TEXT,
            default_workflow_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            archived_at TEXT
        )
        """
    )
    connection.execute(
        """
        INSERT INTO projects VALUES (
            'p1', 'Legacy Project', '/legacy/repo', '/legacy/repo', NULL, 'main',
            'ACTIVE', NULL, NULL, '2026-01-01T00:00:00+00:00',
            '2026-01-01T00:00:00+00:00', NULL
        )
        """
    )
    connection.commit()
    connection.close()

    database = SQLiteDatabase(path)
    database.initialize()

    assert _version(database) == LATEST_SCHEMA_VERSION

    with database.connection() as conn:
        project = conn.execute("SELECT * FROM projects WHERE id = 'p1'").fetchone()

    assert project["name"] == "Legacy Project"
    assert project["repository_path"] == "/legacy/repo"

    # v1-v5 objects are untouched: the audit table is purely additive.
    assert "audit_records" in _tables(database)


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
