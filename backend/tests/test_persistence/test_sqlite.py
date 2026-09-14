"""Tests for the SQLite persistence foundation."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import agent_office.persistence.sqlite as sqlite_module
from agent_office.config import Settings, get_settings
from agent_office.main import create_app
from agent_office.persistence import DatabaseVersionError, SQLiteDatabase

PROBE_TABLE = "probe_records"
PROBE_DDL = "CREATE TABLE probe_records (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)"


def _db(tmp_path: Path) -> SQLiteDatabase:
    return SQLiteDatabase(tmp_path / "office.sqlite")


def _create_probe_table(connection: sqlite3.Connection) -> None:
    connection.execute(PROBE_DDL)


def _create_metadata_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE schema_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )


# Configuration


def test_default_database_path_points_to_data_dir() -> None:
    settings = get_settings()

    assert settings.database_path == Path("data/agent-office.sqlite")


def test_default_database_path_is_relative() -> None:
    settings = get_settings()

    assert not settings.database_path.is_absolute()


def test_constructing_settings_does_not_create_database(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "subdir" / "office.sqlite"

    Settings(database_path=db_path)

    assert not db_path.exists()
    assert not db_path.parent.exists()


def test_health_endpoint_does_not_create_database(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db_path = tmp_path / "does-not-exist" / "office.sqlite"

    monkeypatch.setattr(
        "agent_office.config.get_settings",
        lambda: Settings(database_path=db_path),
    )
    monkeypatch.setattr(
        "agent_office.main.get_settings",
        lambda: Settings(database_path=db_path),
    )

    client = TestClient(create_app())
    response = client.get("/health")

    assert response.status_code == 200
    assert not db_path.exists()
    assert not db_path.parent.exists()


# New database


def test_new_database_reports_schema_version_zero(
    tmp_path: Path,
) -> None:
    database = _db(tmp_path)

    assert database.current_schema_version() == 0


def test_new_database_has_no_schema_metadata_table(
    tmp_path: Path,
) -> None:
    database = _db(tmp_path)

    with database.connection() as connection:
        rows = connection.execute(
            """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
              AND name = 'schema_metadata'
            """
        ).fetchall()

    assert rows == []


# Initialization / schema versioning


def test_initialize_reaches_latest_schema_version(
    tmp_path: Path,
) -> None:
    database = _db(tmp_path)

    database.initialize()

    assert database.current_schema_version() == SQLiteDatabase.LATEST_SCHEMA_VERSION


def test_initialize_creates_schema_metadata_table(
    tmp_path: Path,
) -> None:
    database = _db(tmp_path)

    database.initialize()

    with database.connection() as connection:
        row = connection.execute(
            """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
              AND name = 'schema_metadata'
            """
        ).fetchone()

    assert row is not None


def test_initialize_is_idempotent(tmp_path: Path) -> None:
    database = _db(tmp_path)

    database.initialize()
    first_version = database.current_schema_version()

    database.initialize()
    second_version = database.current_schema_version()

    assert first_version == second_version == SQLiteDatabase.LATEST_SCHEMA_VERSION


def test_migration_v1_records_version_one_before_future_v2(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Future latest-version changes must not alter migration-v1 semantics."""

    database = _db(tmp_path)
    observed_versions: list[str] = []

    def migration_v2(connection: sqlite3.Connection) -> None:
        row = connection.execute(
            """
            SELECT value
            FROM schema_metadata
            WHERE key = 'schema_version'
            """
        ).fetchone()

        assert row is not None
        observed_versions.append(row["value"])

    monkeypatch.setitem(
        sqlite_module.MIGRATIONS,
        2,
        migration_v2,
    )
    monkeypatch.setattr(
        SQLiteDatabase,
        "LATEST_SCHEMA_VERSION",
        2,
    )

    database.initialize()

    assert observed_versions == ["1"]
    assert database.current_schema_version() == 2


def test_missing_required_migration_fails_closed(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database = _db(tmp_path)

    monkeypatch.delitem(
        sqlite_module.MIGRATIONS,
        1,
    )

    with pytest.raises(
        DatabaseVersionError,
        match="missing migration",
    ):
        database.initialize()


# Connection configuration and ownership


def test_foreign_keys_are_enabled(tmp_path: Path) -> None:
    database = _db(tmp_path)

    with database.connection() as connection:
        row = connection.execute("PRAGMA foreign_keys").fetchone()

    assert row is not None
    assert int(row[0]) == 1


def test_busy_timeout_is_set(tmp_path: Path) -> None:
    database = _db(tmp_path)

    with database.connection() as connection:
        row = connection.execute("PRAGMA busy_timeout").fetchone()

    assert row is not None
    assert int(row[0]) == 5000


def test_row_factory_is_set(tmp_path: Path) -> None:
    database = _db(tmp_path)

    with database.connection() as connection:
        assert connection.row_factory is sqlite3.Row


def test_parent_directory_created_only_when_connection_opens(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "nested" / "deep" / "office.sqlite"
    database = SQLiteDatabase(db_path)

    assert not db_path.parent.exists()

    with database.connection():
        assert db_path.parent.exists()


def test_connection_closes_after_context_exit(
    tmp_path: Path,
) -> None:
    database = _db(tmp_path)

    with database.connection() as connection:
        connection.execute("SELECT 1")

    with pytest.raises(sqlite3.ProgrammingError, match="closed"):
        connection.execute("SELECT 1")


def test_connection_closes_after_context_exception(
    tmp_path: Path,
) -> None:
    database = _db(tmp_path)

    class BoomError(Exception):
        pass

    with pytest.raises(BoomError):
        with database.connection() as connection:
            connection.execute("SELECT 1")
            raise BoomError("simulated failure")

    with pytest.raises(sqlite3.ProgrammingError, match="closed"):
        connection.execute("SELECT 1")


# Transactions


def test_transaction_commits(tmp_path: Path) -> None:
    database = _db(tmp_path)
    database.initialize()

    with database.transaction() as connection:
        _create_probe_table(connection)
        connection.execute(
            "INSERT INTO probe_records (payload) VALUES (?)",
            ("a",),
        )

    with database.connection() as connection:
        row = connection.execute("SELECT payload FROM probe_records WHERE id = 1").fetchone()

    assert row is not None
    assert row["payload"] == "a"


def test_failed_transaction_rolls_back(tmp_path: Path) -> None:
    database = _db(tmp_path)
    database.initialize()

    class BoomError(Exception):
        pass

    with pytest.raises(BoomError):
        with database.transaction() as connection:
            _create_probe_table(connection)
            connection.execute(
                "INSERT INTO probe_records (payload) VALUES (?)",
                ("before-boom",),
            )
            raise BoomError("simulated failure")

    with database.connection() as connection:
        rows = connection.execute(
            """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
              AND name = 'probe_records'
            """
        ).fetchall()

    assert rows == []


def test_failed_transaction_rolls_back_only_its_own_writes(
    tmp_path: Path,
) -> None:
    database = _db(tmp_path)
    database.initialize()

    with database.transaction() as connection:
        _create_probe_table(connection)
        connection.execute(
            "INSERT INTO probe_records (payload) VALUES (?)",
            ("pre",),
        )

    class BoomError(Exception):
        pass

    with pytest.raises(BoomError):
        with database.transaction() as connection:
            connection.execute(
                "INSERT INTO probe_records (payload) VALUES (?)",
                ("within-failed",),
            )
            raise BoomError("simulated failure")

    with database.connection() as connection:
        rows = connection.execute("SELECT payload FROM probe_records ORDER BY id").fetchall()

    assert [row["payload"] for row in rows] == ["pre"]


# Metadata integrity / fail closed


def test_existing_metadata_table_without_schema_version_fails_closed(
    tmp_path: Path,
) -> None:
    database = _db(tmp_path)

    with database.transaction() as connection:
        _create_metadata_table(connection)
        connection.execute(
            """
            INSERT INTO schema_metadata (key, value)
            VALUES (?, ?)
            """,
            ("unrelated_metadata", "value"),
        )

    with pytest.raises(
        DatabaseVersionError,
        match="schema_version is missing",
    ):
        database.current_schema_version()


def test_malformed_schema_version_fails_closed(
    tmp_path: Path,
) -> None:
    database = _db(tmp_path)

    with database.transaction() as connection:
        _create_metadata_table(connection)
        connection.execute(
            """
            INSERT INTO schema_metadata (key, value)
            VALUES (?, ?)
            """,
            ("schema_version", "not-an-integer"),
        )

    with pytest.raises(
        DatabaseVersionError,
        match="schema version is invalid",
    ):
        database.current_schema_version()


def test_negative_schema_version_fails_closed(
    tmp_path: Path,
) -> None:
    database = _db(tmp_path)

    with database.transaction() as connection:
        _create_metadata_table(connection)
        connection.execute(
            """
            INSERT INTO schema_metadata (key, value)
            VALUES (?, ?)
            """,
            ("schema_version", "-1"),
        )

    with pytest.raises(
        DatabaseVersionError,
        match="must not be negative",
    ):
        database.current_schema_version()


def _seed_schema_version(
    database: SQLiteDatabase,
    version: int,
) -> None:
    with database.transaction() as connection:
        _create_metadata_table(connection)
        connection.execute(
            """
            INSERT INTO schema_metadata (key, value)
            VALUES (?, ?)
            """,
            ("schema_version", str(version)),
        )


def test_unsupported_newer_schema_fails_closed(
    tmp_path: Path,
) -> None:
    database = _db(tmp_path)
    _seed_schema_version(database, 999)

    with pytest.raises(DatabaseVersionError, match="newer"):
        database.initialize()


def test_fail_closed_does_not_downgrade_or_modify_database(
    tmp_path: Path,
) -> None:
    database = _db(tmp_path)
    _seed_schema_version(database, 999)

    with pytest.raises(DatabaseVersionError):
        database.initialize()

    assert database.current_schema_version() == 999


# Restart persistence


def test_persisted_data_survives_reopen(tmp_path: Path) -> None:
    db_path = tmp_path / "office.sqlite"

    database = SQLiteDatabase(db_path)
    database.initialize()

    with database.transaction() as connection:
        _create_probe_table(connection)
        connection.execute(
            "INSERT INTO probe_records (payload) VALUES (?)",
            ("persisted",),
        )

    reopened = SQLiteDatabase(db_path)

    assert reopened.current_schema_version() == SQLiteDatabase.LATEST_SCHEMA_VERSION

    with reopened.connection() as connection:
        row = connection.execute("SELECT payload FROM probe_records WHERE id = 1").fetchone()

    assert row is not None
    assert row["payload"] == "persisted"
