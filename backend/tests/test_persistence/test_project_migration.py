"""Regression tests for Project Registry schema migration."""

from pathlib import Path

from agent_office.persistence import (
    LATEST_SCHEMA_VERSION,
    SQLiteDatabase,
)


def _table_exists(
    database: SQLiteDatabase,
    table_name: str,
) -> bool:
    with database.connection() as connection:
        row = connection.execute(
            """
            SELECT 1
            FROM sqlite_master
            WHERE type = 'table'
              AND name = ?
            """,
            (table_name,),
        ).fetchone()

    return row is not None


def test_database_upgrades_from_v1_to_latest_schema(
    tmp_path: Path,
    monkeypatch,
) -> None:
    database = SQLiteDatabase(tmp_path / "upgrade.sqlite")

    monkeypatch.setattr(
        SQLiteDatabase,
        "LATEST_SCHEMA_VERSION",
        1,
    )
    database.initialize()

    assert database.current_schema_version() == 1
    assert not _table_exists(database, "projects")

    monkeypatch.setattr(
        SQLiteDatabase,
        "LATEST_SCHEMA_VERSION",
        LATEST_SCHEMA_VERSION,
    )
    database.initialize()

    assert database.current_schema_version() == LATEST_SCHEMA_VERSION
    assert _table_exists(database, "projects")

    with database.connection() as connection:
        columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(projects)").fetchall()
        }

    assert {
        "id",
        "name",
        "repository_path",
        "canonical_path",
        "git_common_dir",
        "default_branch",
        "preferred_executor_id",
        "default_workflow_id",
        "status",
        "created_at",
        "updated_at",
        "archived_at",
    } <= columns


def test_latest_schema_reinitialization_is_idempotent(
    tmp_path: Path,
) -> None:
    database = SQLiteDatabase(tmp_path / "idempotent.sqlite")

    database.initialize()
    database.initialize()

    assert database.current_schema_version() == LATEST_SCHEMA_VERSION
    assert _table_exists(database, "projects")
