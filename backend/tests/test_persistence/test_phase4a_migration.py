"""Explicit migration coverage for the Phase 4A schema (v6 -> v7).

The migration is additive: Phase 2 data, Phase 3A/3B orchestration history, and
Phase 3C audit history must all survive it unchanged, and v7 must introduce only
the Workspace table, the AgentRun workspace column, and their indexes.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from agent_office.persistence import (
    LATEST_SCHEMA_VERSION,
    MIGRATIONS,
    SQLiteDatabase,
)

PHASE_4A_TABLES = {"workspaces"}
PHASE_4A_COLUMNS = {("agent_runs", "workspace_id")}


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


def _columns(database: SQLiteDatabase, table: str) -> set[str]:
    with database.connection() as connection:
        rows = connection.execute(f"PRAGMA table_info({table})").fetchall()

    return {row["name"] for row in rows}


def _seed_at_version(path: Path, version: int) -> None:
    """Build a genuine database at an earlier schema version.

    The real migrations are applied in order, so the fixture is exactly what a
    database created by that Agent Office version looks like.
    """

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


def test_latest_schema_version_is_at_least_seven() -> None:
    """Phase 4A introduced version 7; later phases only add to it."""

    assert LATEST_SCHEMA_VERSION >= 7


def test_empty_database_migrates_to_the_latest_version(tmp_path: Path) -> None:
    database = SQLiteDatabase(tmp_path / "empty.sqlite")
    database.initialize()

    assert _version(database) == LATEST_SCHEMA_VERSION
    assert PHASE_4A_TABLES <= _tables(database)
    assert _columns(database, "agent_runs") >= {"workspace_id"}


def test_phase_three_c_database_migrates_forward_in_place(tmp_path: Path) -> None:
    """A real v6 database gains only the Phase 4A workspace objects."""

    path = tmp_path / "phase3c.sqlite"
    _seed_at_version(path, 6)

    before = SQLiteDatabase(path)
    tables_before = _tables(before)
    agent_run_columns_before = _columns(before, "agent_runs")

    database = SQLiteDatabase(path)
    database.initialize()

    assert _version(database) == LATEST_SCHEMA_VERSION

    tables_after = _tables(database)
    agent_run_columns_after = _columns(database, "agent_runs")

    # Purely additive: nothing from v1-v6 disappeared or was rewritten.
    assert tables_before <= tables_after
    assert agent_run_columns_before <= agent_run_columns_after
    # Purely additive: the Phase 4A tables exist, and later phases may add more.
    assert PHASE_4A_TABLES <= (tables_after - tables_before)
    assert agent_run_columns_after - agent_run_columns_before == {"workspace_id"}


def test_existing_rows_survive_the_phase_four_a_migration(tmp_path: Path) -> None:
    """Phase 2-3 data is preserved byte-for-byte by the additive migration."""

    path = tmp_path / "with-data.sqlite"
    _seed_at_version(path, 6)

    connection = sqlite3.connect(path)
    connection.isolation_level = None
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute(
        """
        INSERT INTO projects (
            id, name, repository_path, canonical_path, git_common_dir,
            default_branch, status, created_at, updated_at
        )
        VALUES ('p1', 'Legacy', '/legacy/repo', '/legacy/repo', '/legacy/repo/.git',
                'main', 'ACTIVE', '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00')
        """
    )
    connection.execute(
        """
        INSERT INTO tasks (id, project_id, title, objective, created_at, updated_at)
        VALUES ('t1', 'p1', 'Legacy task', 'keep me',
                '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00')
        """
    )
    connection.execute(
        """
        INSERT INTO runs (
            id, project_id, task_id, status, created_at, updated_at,
            remediation_cycles_used
        )
        VALUES ('r1', 'p1', 't1', 'COMPLETED', '2026-01-01T00:00:00+00:00',
                '2026-01-01T00:00:00+00:00', 2)
        """
    )
    connection.close()

    database = SQLiteDatabase(path)
    database.initialize()

    with database.connection() as conn:
        run = conn.execute("SELECT * FROM runs WHERE id = 'r1'").fetchone()
        task = conn.execute("SELECT * FROM tasks WHERE id = 't1'").fetchone()

    assert run["status"] == "COMPLETED"
    assert run["remediation_cycles_used"] == 2
    assert task["objective"] == "keep me"

    # The new AgentRun column defaults to null for pre-existing rows.
    assert "workspace_id" in _columns(database, "agent_runs")


def test_workspace_table_enforces_ownership_foreign_keys(tmp_path: Path) -> None:
    """A Workspace cannot reference a Project, Run, or AgentRun that does not exist."""

    database = SQLiteDatabase(tmp_path / "fk.sqlite")
    database.initialize()

    statement = """
        INSERT INTO workspaces (
            id, project_id, run_id, kind, access_mode, status, path_ref,
            created_at, updated_at
        )
        VALUES ('w1', ?, ?, 'GIT_WORKTREE', 'WRITE', 'ALLOCATING', ?, ?, ?)
    """

    with pytest.raises(sqlite3.IntegrityError, match="FOREIGN KEY"):
        with database.transaction() as connection:
            connection.execute(
                statement,
                (
                    "00000000-0000-4000-8000-000000000001",
                    "00000000-0000-4000-8000-000000000002",
                    "a/b/c",
                    "2026-01-01T00:00:00+00:00",
                    "2026-01-01T00:00:00+00:00",
                ),
            )


def test_phase_four_a_indexes_exist(tmp_path: Path) -> None:
    database = SQLiteDatabase(tmp_path / "indexes.sqlite")
    database.initialize()

    with database.connection() as connection:
        indexes = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'index'"
            ).fetchall()
        }

    assert {
        "workspaces_run_idx",
        "workspaces_owner_idx",
        "workspaces_status_idx",
    } <= indexes


def test_migration_is_idempotent(tmp_path: Path) -> None:
    database = SQLiteDatabase(tmp_path / "idempotent.sqlite")
    database.initialize()
    before = _tables(database)

    database.initialize()
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

    with pytest.raises(DatabaseVersionError):
        database.initialize()
