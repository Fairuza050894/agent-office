"""Explicit SQLite migration coverage for the Phase 3 schema.

These tests exercise the real migration path rather than asserting a version
number: an existing schema-v3 database must upgrade to the current schema with
Phase 2 data intact, and initializing again must be a no-op.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from agent_office.persistence import SQLiteDatabase
from agent_office.persistence.sqlite import (
    LATEST_SCHEMA_VERSION,
    MIGRATIONS,
    _write_schema_version,
)


def _build_v3_database(path: Path) -> SQLiteDatabase:
    """Create a database at exactly schema version 3 with Phase 2 data."""

    database = SQLiteDatabase(path)

    with database.transaction() as connection:
        for version in (1, 2, 3):
            MIGRATIONS[version](connection)
            _write_schema_version(connection, version)

    with database.transaction() as connection:
        connection.execute(
            """
            INSERT INTO projects (
                id, name, repository_path, canonical_path, git_common_dir,
                default_branch, status, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
            """,
            (
                "project-1",
                "Legacy Project",
                "/tmp/legacy",
                "/tmp/legacy",
                "/tmp/legacy/.git",
                "main",
                "2026-01-01T00:00:00+00:00",
                "2026-01-01T00:00:00+00:00",
            ),
        )
        connection.execute(
            """
            INSERT INTO tasks (id, project_id, title, objective, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                "task-1",
                "project-1",
                "Legacy Task",
                "Legacy objective",
                "2026-01-01T00:00:00+00:00",
                "2026-01-01T00:00:00+00:00",
            ),
        )
        connection.execute(
            """
            INSERT INTO runs (
                id, project_id, task_id, status, created_at, updated_at
            )
            VALUES (?, ?, ?, 'CREATED', ?, ?)
            """,
            (
                "run-1",
                "project-1",
                "task-1",
                "2026-01-01T00:00:00+00:00",
                "2026-01-01T00:00:00+00:00",
            ),
        )

    return database


def test_schema_v3_database_upgrades_to_the_current_version(tmp_path: Path) -> None:
    database = _build_v3_database(tmp_path / "legacy-v3.sqlite")
    assert database.current_schema_version() == 3

    database.initialize()

    assert database.current_schema_version() == LATEST_SCHEMA_VERSION
    assert LATEST_SCHEMA_VERSION >= 4


def test_phase_two_data_survives_the_migration(tmp_path: Path) -> None:
    database = _build_v3_database(tmp_path / "legacy-data.sqlite")
    database.initialize()

    with database.connection() as connection:
        project = connection.execute(
            "SELECT id, name, status FROM projects WHERE id = 'project-1'"
        ).fetchone()
        task = connection.execute(
            "SELECT id, project_id, title FROM tasks WHERE id = 'task-1'"
        ).fetchone()
        run = connection.execute(
            """
            SELECT id, project_id, task_id, status, workflow_snapshot_id
            FROM runs
            WHERE id = 'run-1'
            """
        ).fetchone()

    assert dict(project) == {"id": "project-1", "name": "Legacy Project", "status": "ACTIVE"}
    assert dict(task) == {
        "id": "task-1",
        "project_id": "project-1",
        "title": "Legacy Task",
    }
    assert run["status"] == "CREATED"
    assert run["project_id"] == "project-1"
    assert run["task_id"] == "task-1"

    # Phase 3 columns exist and are null for pre-existing rows.
    assert run["workflow_snapshot_id"] is None


def test_migration_creates_the_phase_three_tables(tmp_path: Path) -> None:
    database = _build_v3_database(tmp_path / "legacy-tables.sqlite")
    database.initialize()

    with database.connection() as connection:
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }

    assert {
        "workflow_definitions",
        "workflow_definition_versions",
        "workflow_snapshots",
        "run_stages",
        "agent_runs",
        "events",
    } <= tables


def test_reinitialize_is_idempotent(tmp_path: Path) -> None:
    database = SQLiteDatabase(tmp_path / "idempotent.sqlite")

    database.initialize()
    with database.connection() as connection:
        before = sorted(
            (row["type"], row["name"], row["sql"])
            for row in connection.execute(
                "SELECT type, name, sql FROM sqlite_master ORDER BY name"
            ).fetchall()
        )

    database.initialize()
    database.initialize()

    assert database.current_schema_version() == LATEST_SCHEMA_VERSION

    with database.connection() as connection:
        after = sorted(
            (row["type"], row["name"], row["sql"])
            for row in connection.execute(
                "SELECT type, name, sql FROM sqlite_master ORDER BY name"
            ).fetchall()
        )

    assert after == before


def test_migrated_database_accepts_phase_three_writes(tmp_path: Path) -> None:
    """A migrated legacy database is fully usable by Phase 3 code paths."""

    database = _build_v3_database(tmp_path / "legacy-writable.sqlite")
    database.initialize()

    with database.transaction() as connection:
        connection.execute(
            """
            INSERT INTO workflow_definitions (
                id, key, name, description, latest_version, status,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "wf-1",
                "legacy-flow",
                "Legacy Flow",
                "",
                1,
                "ACTIVE",
                "2026-01-01T00:00:00+00:00",
                "2026-01-01T00:00:00+00:00",
            ),
        )
        connection.execute(
            """
            INSERT INTO workflow_definition_versions (
                workflow_id, version, schema_version, definition_json, created_at
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            ("wf-1", 1, 1, '{"schema_version": 1, "stages": []}', "2026-01-01T00:00:00+00:00"),
        )

    with database.connection() as connection:
        row = connection.execute(
            """
            SELECT identity.latest_version, version.version
            FROM workflow_definitions AS identity
            JOIN workflow_definition_versions AS version
              ON version.workflow_id = identity.id
            WHERE identity.id = 'wf-1'
            """
        ).fetchone()

    assert row["latest_version"] == 1
    assert row["version"] == 1


def test_newer_database_is_rejected_instead_of_downgraded(tmp_path: Path) -> None:
    database = SQLiteDatabase(tmp_path / "future.sqlite")
    database.initialize()

    with database.transaction() as connection:
        _write_schema_version(connection, LATEST_SCHEMA_VERSION + 1)

    from agent_office.persistence.sqlite import DatabaseVersionError

    with pytest.raises(DatabaseVersionError):
        database.initialize()


def test_workflow_version_history_survives_reopen(tmp_path: Path) -> None:
    path = tmp_path / "version-history.sqlite"

    database = SQLiteDatabase(path)
    database.initialize()

    with database.transaction() as connection:
        connection.execute(
            """
            INSERT INTO workflow_definitions (
                id, key, name, description, latest_version, status,
                created_at, updated_at
            )
            VALUES ('wf-2', 'reopened-flow', 'Reopened Flow', '', 2, 'ACTIVE', ?, ?)
            """,
            ("2026-01-01T00:00:00+00:00", "2026-01-02T00:00:00+00:00"),
        )
        for version, marker in ((1, "first"), (2, "second")):
            connection.execute(
                """
                INSERT INTO workflow_definition_versions (
                    workflow_id, version, schema_version, definition_json, created_at
                )
                VALUES (?, ?, 1, ?, ?)
                """,
                ("wf-2", version, f'{{"marker": "{marker}"}}', "2026-01-01T00:00:00+00:00"),
            )

    reopened = SQLiteDatabase(path)
    reopened.initialize()

    assert reopened.current_schema_version() == LATEST_SCHEMA_VERSION

    with reopened.connection() as connection:
        rows = connection.execute(
            """
            SELECT version, definition_json
            FROM workflow_definition_versions
            WHERE workflow_id = 'wf-2'
            ORDER BY version ASC
            """
        ).fetchall()

    assert [(row["version"], row["definition_json"]) for row in rows] == [
        (1, '{"marker": "first"}'),
        (2, '{"marker": "second"}'),
    ]


def test_migration_records_the_expected_version(tmp_path: Path) -> None:
    database = SQLiteDatabase(tmp_path / "version-metadata.sqlite")
    database.initialize()

    with database.connection() as connection:
        row = connection.execute(
            "SELECT value FROM schema_metadata WHERE key = 'schema_version'"
        ).fetchone()

    assert int(row["value"]) == LATEST_SCHEMA_VERSION

    with sqlite3.connect(tmp_path / "version-metadata.sqlite") as raw:
        stored = raw.execute(
            "SELECT value FROM schema_metadata WHERE key = 'schema_version'"
        ).fetchone()

    assert int(stored[0]) == LATEST_SCHEMA_VERSION
