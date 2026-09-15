"""SQLite persistence foundation for Agent Office.

Provides a small, restart-safe SQLite abstraction with explicit schema
versioning. This module creates no business tables -- only infrastructure
metadata required for schema versioning.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path

BUSY_TIMEOUT_MS = 5000
LATEST_SCHEMA_VERSION: int = 2

SCHEMA_VERSION_KEY = "schema_version"


class DatabaseVersionError(RuntimeError):
    """Raised when database schema metadata cannot be safely interpreted."""


def _migration_v1(connection: sqlite3.Connection) -> None:
    """Create the foundation metadata schema.

    The migration deliberately does not write a version number. The migration
    runner records the exact target version after the migration succeeds.
    """

    connection.execute(
        """
        CREATE TABLE schema_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )


def _migration_v2(connection: sqlite3.Connection) -> None:
    """Create Project Registry persistence."""

    connection.execute(
        """
        CREATE TABLE projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            repository_path TEXT NOT NULL,
            canonical_path TEXT NOT NULL UNIQUE,
            git_common_dir TEXT NOT NULL UNIQUE,
            default_branch TEXT NOT NULL,
            preferred_executor_id TEXT,
            default_workflow_id TEXT,
            status TEXT NOT NULL
                CHECK (status IN ('ACTIVE', 'ARCHIVED')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            archived_at TEXT,
            CHECK (
                (status = 'ACTIVE' AND archived_at IS NULL)
                OR
                (status = 'ARCHIVED' AND archived_at IS NOT NULL)
            )
        )
        """
    )


MIGRATIONS: dict[int, Callable[[sqlite3.Connection], None]] = {
    1: _migration_v1,
    2: _migration_v2,
}


class SQLiteDatabase:
    """Minimal SQLite persistence abstraction for Agent Office.

    Connections are owned by this abstraction and always close when their
    context exits. Transactions explicitly begin, commit, or roll back.
    """

    LATEST_SCHEMA_VERSION: int = LATEST_SCHEMA_VERSION

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def _open(self) -> sqlite3.Connection:
        """Open and configure a SQLite connection."""

        self.path.parent.mkdir(parents=True, exist_ok=True)

        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row

        # Agent Office owns transaction boundaries explicitly.
        connection.isolation_level = None

        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute(f"PRAGMA busy_timeout = {BUSY_TIMEOUT_MS}")

        return connection

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        """Yield a configured connection and always close it."""

        connection = self._open()

        try:
            yield connection
        finally:
            connection.close()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """Yield a connection inside an explicit transaction.

        The transaction commits on success and rolls back on any exceptional
        exit. The underlying connection is always closed.
        """

        with self.connection() as connection:
            try:
                connection.execute("BEGIN")
                yield connection
                connection.execute("COMMIT")
            except BaseException:
                if connection.in_transaction:
                    connection.execute("ROLLBACK")
                raise

    def current_schema_version(self) -> int:
        """Return the current schema version.

        A database without schema_metadata is considered uninitialized and
        therefore version 0. Once schema_metadata exists, malformed or missing
        schema-version metadata fails closed.
        """

        with self.connection() as connection:
            if not _metadata_table_exists(connection):
                return 0

            return _read_schema_version(connection)

    def initialize(self) -> None:
        """Idempotently migrate the database to the latest supported schema."""

        current_version = self.current_schema_version()

        if current_version > self.LATEST_SCHEMA_VERSION:
            raise DatabaseVersionError(
                "Database schema is newer than this Agent Office version: "
                f"{current_version} > {self.LATEST_SCHEMA_VERSION}"
            )

        if current_version == self.LATEST_SCHEMA_VERSION:
            return

        self._run_migrations(current_version)

    def _run_migrations(self, starting_version: int) -> None:
        """Apply every required migration sequentially."""

        for version in range(
            starting_version + 1,
            self.LATEST_SCHEMA_VERSION + 1,
        ):
            migration = MIGRATIONS.get(version)

            if migration is None:
                raise DatabaseVersionError(
                    "Database migration sequence is incomplete: "
                    f"missing migration for schema version {version}"
                )

            with self.transaction() as connection:
                migration(connection)
                _write_schema_version(connection, version)


def _metadata_table_exists(connection: sqlite3.Connection) -> bool:
    row = connection.execute(
        """
        SELECT 1
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'schema_metadata'
        """
    ).fetchone()

    return row is not None


def _read_schema_version(connection: sqlite3.Connection) -> int:
    try:
        row = connection.execute(
            """
            SELECT value
            FROM schema_metadata
            WHERE key = ?
            """,
            (SCHEMA_VERSION_KEY,),
        ).fetchone()
    except sqlite3.DatabaseError as exc:
        raise DatabaseVersionError("Database schema metadata is malformed") from exc

    if row is None:
        raise DatabaseVersionError("Database schema metadata exists but schema_version is missing")

    raw_value = row["value"]

    try:
        version = int(raw_value)
    except (TypeError, ValueError) as exc:
        raise DatabaseVersionError("Stored database schema version is invalid") from exc

    if version < 0:
        raise DatabaseVersionError("Stored database schema version must not be negative")

    return version


def _write_schema_version(
    connection: sqlite3.Connection,
    version: int,
) -> None:
    connection.execute(
        """
        INSERT INTO schema_metadata (key, value)
        VALUES (?, ?)
        ON CONFLICT(key)
        DO UPDATE SET value = excluded.value
        """,
        (SCHEMA_VERSION_KEY, str(version)),
    )
