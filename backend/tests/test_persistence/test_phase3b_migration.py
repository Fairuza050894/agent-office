"""Explicit migration coverage for the Phase 3B schema (v4 -> v5).

The migration is additive: Phase 2 data, Phase 3A workflow version history, and
Phase 3A execution history must all survive it unchanged.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from agent_office.persistence import SQLiteDatabase
from agent_office.persistence.sqlite import (
    LATEST_SCHEMA_VERSION,
    MIGRATIONS,
    DatabaseVersionError,
    _write_schema_version,
)


def _build_v4_database(path: Path) -> SQLiteDatabase:
    """Create a database at exactly schema version 4 with Phase 3A data."""

    database = SQLiteDatabase(path)

    with database.transaction() as connection:
        for version in (1, 2, 3, 4):
            MIGRATIONS[version](connection)
            _write_schema_version(connection, version)

    with database.transaction() as connection:
        connection.execute(
            """
            INSERT INTO projects (
                id, name, repository_path, canonical_path, git_common_dir,
                default_branch, status, created_at, updated_at
            )
            VALUES ('p1', 'Legacy', '/tmp/legacy', '/tmp/legacy', '/tmp/legacy/.git',
                    'main', 'ACTIVE', ?, ?)
            """,
            ("2026-01-01T00:00:00+00:00", "2026-01-01T00:00:00+00:00"),
        )
        connection.execute(
            """
            INSERT INTO tasks (id, project_id, title, objective, created_at, updated_at)
            VALUES ('t1', 'p1', 'Legacy Task', 'objective', ?, ?)
            """,
            ("2026-01-01T00:00:00+00:00", "2026-01-01T00:00:00+00:00"),
        )
        connection.execute(
            """
            INSERT INTO runs (id, project_id, task_id, status, created_at, updated_at)
            VALUES ('r1', 'p1', 't1', 'CREATED', ?, ?)
            """,
            ("2026-01-01T00:00:00+00:00", "2026-01-01T00:00:00+00:00"),
        )
        connection.execute(
            """
            INSERT INTO workflow_definitions (
                id, key, name, description, latest_version, status, created_at, updated_at
            )
            VALUES ('w1', 'legacy-flow', 'Legacy Flow', '', 2, 'ACTIVE', ?, ?)
            """,
            ("2026-01-01T00:00:00+00:00", "2026-01-02T00:00:00+00:00"),
        )
        for version, marker in ((1, "first"), (2, "second")):
            connection.execute(
                """
                INSERT INTO workflow_definition_versions (
                    workflow_id, version, schema_version, definition_json, created_at
                )
                VALUES ('w1', ?, 1, ?, ?)
                """,
                (version, f'{{"marker": "{marker}"}}', "2026-01-01T00:00:00+00:00"),
            )

    return database


def test_v4_database_upgrades_to_the_current_version(tmp_path: Path) -> None:
    database = _build_v4_database(tmp_path / "legacy-v4.sqlite")
    assert database.current_schema_version() == 4

    database.initialize()

    assert database.current_schema_version() == LATEST_SCHEMA_VERSION
    assert LATEST_SCHEMA_VERSION >= 5


def test_phase_two_and_phase_three_a_data_survive_the_migration(tmp_path: Path) -> None:
    database = _build_v4_database(tmp_path / "legacy-data.sqlite")
    database.initialize()

    with database.connection() as connection:
        project = connection.execute("SELECT id, name FROM projects WHERE id = 'p1'").fetchone()
        task = connection.execute("SELECT id, title FROM tasks WHERE id = 't1'").fetchone()
        run = connection.execute(
            "SELECT id, status, remediation_cycles_used FROM runs WHERE id = 'r1'"
        ).fetchone()
        versions = connection.execute(
            """
            SELECT version, definition_json
            FROM workflow_definition_versions
            WHERE workflow_id = 'w1'
            ORDER BY version ASC
            """
        ).fetchall()

    assert dict(project) == {"id": "p1", "name": "Legacy"}
    assert dict(task) == {"id": "t1", "title": "Legacy Task"}
    assert run["status"] == "CREATED"
    # The new column exists and defaults truthfully for pre-existing rows.
    assert run["remediation_cycles_used"] == 0

    assert [row["version"] for row in versions] == [1, 2]
    assert versions[0]["definition_json"] == '{"marker": "first"}'


def test_migration_adds_the_phase_three_b_columns(tmp_path: Path) -> None:
    database = _build_v4_database(tmp_path / "legacy-columns.sqlite")
    database.initialize()

    with database.connection() as connection:
        run_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(runs)").fetchall()
        }
        agent_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(agent_runs)").fetchall()
        }

    assert "remediation_cycles_used" in run_columns
    assert {
        "retry_of_agent_run_id",
        "remediation_cycle",
        "review_verdict",
        "failure_retryable",
    } <= agent_columns


def test_migration_is_idempotent(tmp_path: Path) -> None:
    database = SQLiteDatabase(tmp_path / "idempotent-v5.sqlite")
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

    with database.connection() as connection:
        after = sorted(
            (row["type"], row["name"], row["sql"])
            for row in connection.execute(
                "SELECT type, name, sql FROM sqlite_master ORDER BY name"
            ).fetchall()
        )

    assert after == before
    assert database.current_schema_version() == LATEST_SCHEMA_VERSION


def test_newer_schema_is_never_silently_downgraded(tmp_path: Path) -> None:
    database = SQLiteDatabase(tmp_path / "future.sqlite")
    database.initialize()

    with database.transaction() as connection:
        _write_schema_version(connection, LATEST_SCHEMA_VERSION + 1)

    with pytest.raises(DatabaseVersionError):
        database.initialize()


def test_migrated_database_accepts_phase_three_b_writes(tmp_path: Path) -> None:
    database = _build_v4_database(tmp_path / "legacy-writable.sqlite")
    database.initialize()

    now = "2026-01-01T00:00:00+00:00"

    with database.transaction() as connection:
        connection.execute(
            """
            INSERT INTO run_stages (
                run_id, project_id, stage_key, status, required, order_hint,
                execution_mode, condition, created_at, updated_at
            )
            VALUES ('r1', 'p1', 'DISCOVERY', 'PENDING', 1, 0, 'SEQUENTIAL', 'ALWAYS', ?, ?)
            """,
            (now, now),
        )
        connection.execute(
            """
            INSERT INTO agent_runs (
                id, run_id, project_id, stage_key, agent_profile_id, agent_profile_key,
                agent_profile_version, executor_id, access_mode, status, attempt,
                remediation_cycle, review_verdict, failure_retryable,
                created_at, updated_at
            )
            VALUES ('a1', 'r1', 'p1', 'DISCOVERY', 'prof', 'explorer', 1, 'exec',
                    'READ_ONLY', 'FAILED', 2, 1, 'BLOCKER', 1, ?, ?)
            """,
            (now, now),
        )

    with database.connection() as connection:
        row = connection.execute(
            "SELECT attempt, remediation_cycle, review_verdict, failure_retryable FROM agent_runs"
        ).fetchone()

    assert row["attempt"] == 2
    assert row["remediation_cycle"] == 1
    assert row["review_verdict"] == "BLOCKER"
    assert row["failure_retryable"] == 1


def test_retry_self_reference_is_persistable(tmp_path: Path) -> None:
    """A retry attempt may reference the previous attempt durably."""

    database = SQLiteDatabase(tmp_path / "retry-reference.sqlite")
    database.initialize()

    now = "2026-01-01T00:00:00+00:00"

    with database.transaction() as connection:
        connection.execute(
            """
            INSERT INTO projects (
                id, name, repository_path, canonical_path, git_common_dir,
                default_branch, status, created_at, updated_at
            )
            VALUES ('p1', 'P', '/tmp/p', '/tmp/p', '/tmp/p/.git', 'main', 'ACTIVE', ?, ?)
            """,
            (now, now),
        )
        connection.execute(
            """
            INSERT INTO tasks (id, project_id, title, objective, created_at, updated_at)
            VALUES ('t1', 'p1', 'T', 'o', ?, ?)
            """,
            (now, now),
        )
        connection.execute(
            """
            INSERT INTO runs (id, project_id, task_id, status, created_at, updated_at)
            VALUES ('r1', 'p1', 't1', 'CREATED', ?, ?)
            """,
            (now, now),
        )
        connection.execute(
            """
            INSERT INTO run_stages (
                run_id, project_id, stage_key, status, required, order_hint,
                execution_mode, condition, created_at, updated_at
            )
            VALUES ('r1', 'p1', 'DISCOVERY', 'PENDING', 1, 0, 'SEQUENTIAL', 'ALWAYS', ?, ?)
            """,
            (now, now),
        )

        for attempt, retry_of in ((1, None), (2, "a1")):
            connection.execute(
                """
                INSERT INTO agent_runs (
                    id, run_id, project_id, stage_key, agent_profile_id, agent_profile_key,
                    agent_profile_version, executor_id, access_mode, status, attempt,
                    retry_of_agent_run_id, created_at, updated_at
                )
                VALUES (?, 'r1', 'p1', 'DISCOVERY', 'prof', 'explorer', 1, 'exec',
                        'READ_ONLY', 'FAILED', ?, ?, ?, ?)
                """,
                (f"a{attempt}", attempt, retry_of, now, now),
            )

    with database.connection() as connection:
        rows = connection.execute(
            "SELECT id, retry_of_agent_run_id FROM agent_runs ORDER BY attempt"
        ).fetchall()

    assert [(row["id"], row["retry_of_agent_run_id"]) for row in rows] == [
        ("a1", None),
        ("a2", "a1"),
    ]


def test_v3_database_still_upgrades_to_the_current_version(tmp_path: Path) -> None:
    """The full migration chain from Phase 2 remains intact."""

    database = SQLiteDatabase(tmp_path / "legacy-v3.sqlite")

    with database.transaction() as connection:
        for version in (1, 2, 3):
            MIGRATIONS[version](connection)
            _write_schema_version(connection, version)

    assert database.current_schema_version() == 3

    database.initialize()

    assert database.current_schema_version() == LATEST_SCHEMA_VERSION

    with sqlite3.connect(tmp_path / "legacy-v3.sqlite") as raw:
        tables = {
            row[0] for row in raw.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }

    assert {
        "workflow_definitions",
        "workflow_definition_versions",
        "workflow_snapshots",
        "run_stages",
        "agent_runs",
        "events",
    } <= tables
