"""SQLite persistence foundation for Agent Office.

Provides a small, restart-safe SQLite abstraction with explicit schema
versioning and deterministic local control-plane persistence.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path

BUSY_TIMEOUT_MS = 5000
LATEST_SCHEMA_VERSION: int = 6

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


def _migration_v3(connection: sqlite3.Connection) -> None:
    """Create Task and Run persistence."""

    connection.execute(
        """
        CREATE TABLE tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id),
            title TEXT NOT NULL,
            objective TEXT NOT NULL,
            constraints TEXT,
            requested_workflow_id TEXT,
            requested_executor_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE (project_id, id)
        )
        """
    )

    connection.execute(
        """
        CREATE TABLE runs (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id),
            task_id TEXT NOT NULL,
            status TEXT NOT NULL
                CHECK (status IN (
                    'CREATED', 'PLANNING', 'READY', 'RUNNING',
                    'REVIEWING', 'REMEDIATING', 'VERIFYING',
                    'COMPLETED', 'BLOCKED', 'FAILED', 'CANCELLED'
                )),
            requested_executor_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (project_id, task_id)
                REFERENCES tasks(project_id, id)
        )
        """
    )


def _migration_v4(connection: sqlite3.Connection) -> None:
    """Create workflow, stage, AgentRun, and Event persistence."""

    # Composite foreign keys below need a unique parent key on runs.
    connection.execute(
        """
        CREATE UNIQUE INDEX runs_id_project_unique
        ON runs (id, project_id)
        """
    )

    connection.execute(
        """
        CREATE TABLE workflow_definitions (
            id TEXT PRIMARY KEY,
            key TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            latest_version INTEGER NOT NULL CHECK (latest_version >= 1),
            status TEXT NOT NULL
                CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )

    # Workflow definition versions are append-only. Once a version has been
    # frozen into a Run snapshot it is never updated or deleted, so historical
    # Run meaning cannot drift when the reusable definition is edited.
    connection.execute(
        """
        CREATE TABLE workflow_definition_versions (
            workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id),
            version INTEGER NOT NULL CHECK (version >= 1),
            schema_version INTEGER NOT NULL,
            definition_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (workflow_id, version)
        )
        """
    )

    connection.execute(
        """
        CREATE TABLE workflow_snapshots (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            source_workflow_id TEXT REFERENCES workflow_definitions(id),
            source_workflow_key TEXT NOT NULL,
            source_workflow_version INTEGER NOT NULL
                CHECK (source_workflow_version >= 1),
            schema_version INTEGER NOT NULL,
            definition_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE (run_id),
            FOREIGN KEY (run_id, project_id) REFERENCES runs(id, project_id)
        )
        """
    )

    # Phase 3 lifecycle columns. Added columns are nullable so existing Phase 2
    # Run rows remain valid.
    connection.execute(
        """
        ALTER TABLE runs
        ADD COLUMN workflow_snapshot_id TEXT REFERENCES workflow_snapshots(id)
        """
    )

    for column in (
        "resolved_executor_id TEXT",
        "changed_areas_json TEXT",
        "failure_code TEXT",
        "failure_summary TEXT",
        "started_at TEXT",
        "completed_at TEXT",
        "cancel_requested_at TEXT",
    ):
        connection.execute(f"ALTER TABLE runs ADD COLUMN {column}")

    connection.execute(
        """
        CREATE TABLE run_stages (
            run_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            stage_key TEXT NOT NULL,
            status TEXT NOT NULL
                CHECK (status IN (
                    'PENDING', 'READY', 'RUNNING', 'WAITING',
                    'COMPLETED', 'FAILED', 'BLOCKED', 'SKIPPED', 'CANCELLED'
                )),
            required INTEGER NOT NULL CHECK (required IN (0, 1)),
            order_hint INTEGER NOT NULL CHECK (order_hint >= 0),
            execution_mode TEXT NOT NULL
                CHECK (execution_mode IN ('SEQUENTIAL', 'PARALLEL_ALLOWED')),
            condition TEXT NOT NULL,
            reason_code TEXT,
            reason_summary TEXT,
            started_at TEXT,
            completed_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (run_id, stage_key),
            FOREIGN KEY (run_id, project_id) REFERENCES runs(id, project_id)
        )
        """
    )

    connection.execute(
        """
        CREATE TABLE agent_runs (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            stage_key TEXT NOT NULL,
            agent_profile_id TEXT NOT NULL,
            agent_profile_key TEXT NOT NULL,
            agent_profile_version INTEGER NOT NULL
                CHECK (agent_profile_version >= 1),
            executor_id TEXT NOT NULL,
            access_mode TEXT NOT NULL
                CHECK (access_mode IN ('READ_ONLY', 'BOUNDED_WRITE', 'WRITE')),
            status TEXT NOT NULL
                CHECK (status IN (
                    'PENDING', 'STARTING', 'RUNNING', 'WAITING',
                    'COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'
                )),
            attempt INTEGER NOT NULL CHECK (attempt >= 1),
            executor_session_ref_json TEXT,
            capability_snapshot_json TEXT,
            result_outcome TEXT,
            result_summary TEXT,
            reason_code TEXT,
            reason_summary TEXT,
            started_at TEXT,
            completed_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (run_id, stage_key)
                REFERENCES run_stages(run_id, stage_key),
            FOREIGN KEY (run_id, project_id) REFERENCES runs(id, project_id)
        )
        """
    )

    connection.execute(
        """
        CREATE TABLE events (
            id TEXT PRIMARY KEY,
            schema_version INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            project_id TEXT NOT NULL,
            run_id TEXT NOT NULL,
            agent_run_id TEXT REFERENCES agent_runs(id),
            source TEXT NOT NULL,
            source_ref TEXT,
            occurred_at TEXT NOT NULL,
            recorded_at TEXT NOT NULL,
            sequence INTEGER,
            correlation_id TEXT,
            causation_id TEXT,
            payload_json TEXT NOT NULL,
            redacted_keys_json TEXT NOT NULL,
            external_event_id TEXT,
            executor_id TEXT,
            dedupe_key TEXT UNIQUE,
            created_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (run_id, project_id) REFERENCES runs(id, project_id)
        )
        """
    )

    connection.execute(
        """
        CREATE INDEX events_run_recorded_idx
        ON events (run_id, recorded_at, id)
        """
    )
    connection.execute(
        """
        CREATE INDEX events_agent_run_recorded_idx
        ON events (agent_run_id, recorded_at, id)
        """
    )
    connection.execute(
        """
        CREATE INDEX events_project_recorded_idx
        ON events (project_id, recorded_at, id)
        """
    )
    connection.execute(
        """
        CREATE INDEX events_event_type_idx
        ON events (event_type)
        """
    )
    connection.execute(
        """
        CREATE INDEX run_stages_run_idx
        ON run_stages (run_id, order_hint)
        """
    )
    connection.execute(
        """
        CREATE INDEX agent_runs_run_idx
        ON agent_runs (run_id, created_at)
        """
    )
    connection.execute(
        """
        CREATE INDEX agent_runs_stage_idx
        ON agent_runs (run_id, stage_key)
        """
    )
    connection.execute(
        """
        CREATE INDEX workflow_definition_versions_idx
        ON workflow_definition_versions (workflow_id, version)
        """
    )


def _migration_v5(connection: sqlite3.Connection) -> None:
    """Add Phase 3B retry, remediation, and review-verdict lifecycle columns.

    Every column is additive with a non-destructive default, so Phase 2 and
    Phase 3A rows remain valid and readable without rewriting them.
    """

    connection.execute(
        """
        ALTER TABLE runs
        ADD COLUMN remediation_cycles_used INTEGER NOT NULL DEFAULT 0
        """
    )

    connection.execute(
        """
        ALTER TABLE agent_runs
        ADD COLUMN retry_of_agent_run_id TEXT REFERENCES agent_runs(id)
        """
    )
    connection.execute(
        """
        ALTER TABLE agent_runs
        ADD COLUMN remediation_cycle INTEGER NOT NULL DEFAULT 0
        """
    )
    connection.execute(
        """
        ALTER TABLE agent_runs
        ADD COLUMN review_verdict TEXT
        """
    )
    connection.execute(
        """
        ALTER TABLE agent_runs
        ADD COLUMN failure_retryable INTEGER
        """
    )

    connection.execute(
        """
        CREATE INDEX agent_runs_retry_idx
        ON agent_runs (retry_of_agent_run_id)
        """
    )
    connection.execute(
        """
        CREATE INDEX agent_runs_attempt_idx
        ON agent_runs (run_id, stage_key, agent_profile_key, attempt)
        """
    )


def _migration_v6(connection: sqlite3.Connection) -> None:
    """Create append-only AuditRecord persistence.

    Append-only is enforced by the storage layer, not only by convention: the
    UPDATE and DELETE triggers abort, so durable audit history cannot be
    rewritten even by a direct SQL caller.
    """

    connection.execute(
        """
        CREATE TABLE audit_records (
            id TEXT PRIMARY KEY,
            project_id TEXT REFERENCES projects(id),
            run_id TEXT REFERENCES runs(id),
            actor_type TEXT NOT NULL,
            action TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT,
            occurred_at TEXT NOT NULL,
            safe_metadata_json TEXT NOT NULL
        )
        """
    )

    connection.execute(
        """
        CREATE INDEX audit_records_run_idx
        ON audit_records (run_id, occurred_at, id)
        """
    )

    connection.execute(
        """
        CREATE TRIGGER audit_records_append_only_update
        BEFORE UPDATE ON audit_records
        BEGIN
            SELECT RAISE(ABORT, 'audit_records is append-only');
        END
        """
    )

    connection.execute(
        """
        CREATE TRIGGER audit_records_append_only_delete
        BEFORE DELETE ON audit_records
        BEGIN
            SELECT RAISE(ABORT, 'audit_records is append-only');
        END
        """
    )


MIGRATIONS: dict[int, Callable[[sqlite3.Connection], None]] = {
    1: _migration_v1,
    2: _migration_v2,
    3: _migration_v3,
    4: _migration_v4,
    5: _migration_v5,
    6: _migration_v6,
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
