"""Explicit migration coverage for the Phase 4B schema (v7 -> v8).

Phase 4B persistence is purely additive: two new tables, their indexes, and the
durability triggers behind them. Nothing introduced by v1-v7 is altered, so a
database written by an earlier phase keeps every row it had.

The trigger and uniqueness contracts are asserted against rows Agent Office
itself wrote, so the schema is tested against production shape rather than a
hand-built insert that could drift away from it.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

import pytest
from conftest import HarnessFactory

from agent_office.domain import ChangeArea
from agent_office.infrastructure.executors import ReferenceScenario
from agent_office.persistence import LATEST_SCHEMA_VERSION, MIGRATIONS, SQLiteDatabase

PHASE_4B_TABLES = {"findings", "evidence"}

PHASE_4B_INDEXES = {
    "findings_run_idx",
    "findings_run_status_idx",
    "findings_identity_idx",
    "evidence_run_idx",
    "evidence_run_kind_idx",
}


def _version(database: SQLiteDatabase) -> int:
    with database.connection() as connection:
        row = connection.execute(
            "SELECT value FROM schema_metadata WHERE key = 'schema_version'"
        ).fetchone()

    assert row is not None
    return int(row["value"])


def _tables(database: SQLiteDatabase) -> set[str]:
    with database.connection() as connection:
        rows = connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()

    return {str(row["name"]) for row in rows}


def _triggers(database: SQLiteDatabase) -> set[str]:
    with database.connection() as connection:
        rows = connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'trigger'"
        ).fetchall()

    return {str(row["name"]) for row in rows}


def _indexes(database: SQLiteDatabase) -> set[str]:
    with database.connection() as connection:
        rows = connection.execute("SELECT name FROM sqlite_master WHERE type = 'index'").fetchall()

    return {str(row["name"]) for row in rows}


def _columns(database: SQLiteDatabase, table: str) -> set[str]:
    with database.connection() as connection:
        rows = connection.execute(f"PRAGMA table_info({table})").fetchall()

    return {str(row["name"]) for row in rows}


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


def _columns_of(path: Path, table: str) -> list[str]:
    with sqlite3.connect(path) as connection:
        return [str(row[1]) for row in connection.execute(f"PRAGMA table_info({table})").fetchall()]


def _blocked_review(
    harness_factory: HarnessFactory,
    database_path: Path,
) -> tuple[Any, list[dict[str, Any]]]:
    """Run a real blocked review loop against one specific database."""

    harness = harness_factory(ReferenceScenario.REMEDIATION_FAILURE, database_path=database_path)
    run, _ = harness.start_workflow("bug-fix", changed_areas=[ChangeArea.BACKEND])

    response = harness.client.get(f"/api/runs/{run['id']}/findings")
    assert response.status_code == 200, response.text

    return harness, response.json()["findings"]


def _checked_run(
    harness_factory: HarnessFactory,
    database_path: Path,
) -> tuple[Any, list[dict[str, Any]]]:
    """Run a real declared verification check against one specific database."""

    from test_phase4b_verification import (
        check_request,
        create_workflow,
        execute,
        register_repository,
    )

    harness = harness_factory(ReferenceScenario.SUCCESS, database_path=database_path)
    project, _ = register_repository(harness)
    workflow = create_workflow(harness, checks=[check_request()])
    run = execute(harness, workflow, project=project)

    response = harness.client.get(f"/api/runs/{run['id']}/evidence")
    assert response.status_code == 200, response.text

    return harness, response.json()


# ----------------------------------------------------------------------
# Version and shape
# ----------------------------------------------------------------------


def test_latest_schema_version_is_at_least_eight() -> None:
    """Phase 4B introduced version 8; later phases only add to it."""

    assert LATEST_SCHEMA_VERSION >= 8


def test_empty_database_reaches_the_phase_four_b_tables(tmp_path: Path) -> None:
    database = SQLiteDatabase(tmp_path / "empty.sqlite")
    database.initialize()

    assert _version(database) == LATEST_SCHEMA_VERSION
    assert PHASE_4B_TABLES <= _tables(database)
    assert PHASE_4B_INDEXES <= _indexes(database)


def test_phase_four_b_tables_carry_the_expected_columns(tmp_path: Path) -> None:
    database = SQLiteDatabase(tmp_path / "columns.sqlite")
    database.initialize()

    assert _columns(database, "findings") == {
        "id",
        "project_id",
        "run_id",
        "reviewer_agent_run_id",
        "category",
        "severity",
        "title",
        "description",
        "status",
        # The optional source location is one bounded JSON column, so a Finding
        # never needs a schema change to carry a new location facet.
        "location_json",
        "identity_key",
        # The uniqueness that makes duplicate reviewer delivery impossible.
        "dedupe_key",
        "remediation_owner_agent_run_id",
        "resolution_type",
        "resolver_agent_run_id",
        "resolution_summary",
        "created_at",
        "updated_at",
        "resolved_at",
    }

    assert _columns(database, "evidence") == {
        "id",
        "project_id",
        "task_id",
        "run_id",
        "agent_run_id",
        "kind",
        "status",
        "summary",
        "artifact_ref",
        "metadata_json",
        "schema_version",
        "created_at",
    }


# ----------------------------------------------------------------------
# Forward migration
# ----------------------------------------------------------------------


def test_phase_seven_database_migrates_forward_in_place(tmp_path: Path) -> None:
    """A real v7 database gains only the Phase 4B objects."""

    path = tmp_path / "v7.sqlite"
    _seed_at_version(path, 7)

    before = SQLiteDatabase(path)
    tables_before = _tables(before)
    assert not PHASE_4B_TABLES & tables_before

    database = SQLiteDatabase(path)
    database.initialize()

    assert _version(database) == LATEST_SCHEMA_VERSION
    assert PHASE_4B_TABLES <= (_tables(database) - tables_before)


def test_existing_rows_survive_the_phase_four_b_migration(tmp_path: Path) -> None:
    """Phase 2-3 rows are preserved by the additive migration."""

    path = tmp_path / "rows.sqlite"
    _seed_at_version(path, 7)

    with sqlite3.connect(path) as connection:
        connection.execute(
            "INSERT INTO projects ("
            "id, name, repository_path, canonical_path, git_common_dir, default_branch, "
            "preferred_executor_id, default_workflow_id, status, created_at, updated_at"
            ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "11111111-1111-1111-1111-111111111111",
                "Legacy Project",
                "/tmp/legacy",
                "/tmp/legacy",
                "/tmp/legacy/.git",
                "main",
                None,
                None,
                "ACTIVE",
                "2026-01-01T00:00:00Z",
                "2026-01-01T00:00:00Z",
            ),
        )

    database = SQLiteDatabase(path)
    database.initialize()

    with database.connection() as connection:
        row = connection.execute(
            "SELECT name FROM projects WHERE id = ?",
            ("11111111-1111-1111-1111-111111111111",),
        ).fetchone()

    assert row is not None
    assert row["name"] == "Legacy Project"


def test_migration_is_idempotent(tmp_path: Path) -> None:
    database = SQLiteDatabase(tmp_path / "idempotent.sqlite")
    database.initialize()

    before = _tables(database)

    database.initialize()

    assert _tables(database) == before


def test_newer_schema_is_rejected_not_downgraded(tmp_path: Path) -> None:
    """A database from a future version is never silently rewritten."""

    path = tmp_path / "future.sqlite"
    _seed_at_version(path, LATEST_SCHEMA_VERSION)

    with sqlite3.connect(path) as connection:
        connection.execute(
            "UPDATE schema_metadata SET value = ? WHERE key = 'schema_version'",
            (str(LATEST_SCHEMA_VERSION + 1),),
        )

    database = SQLiteDatabase(path)

    with pytest.raises(Exception, match="newer|version"):
        database.initialize()


# ----------------------------------------------------------------------
# Durability contracts
# ----------------------------------------------------------------------


def test_findings_are_never_deleted(
    tmp_path: Path,
    harness_factory: HarnessFactory,
) -> None:
    """Review history is append-only, enforced by the schema."""

    database_path = tmp_path / "findings-trigger.sqlite"
    database = SQLiteDatabase(database_path)
    database.initialize()

    assert "findings_no_delete" in _triggers(database)

    harness, recorded = _blocked_review(harness_factory, database_path)
    assert recorded

    with database.connection() as connection:
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute("DELETE FROM findings WHERE id = ?", (recorded[0]["id"],))

    # Still present, and still readable through the API.
    listed = harness.client.get(f"/api/runs/{recorded[0]['run_id']}/findings").json()
    assert len(listed["findings"]) == len(recorded)


def test_duplicate_reviewer_delivery_cannot_create_a_second_finding(
    tmp_path: Path,
    harness_factory: HarnessFactory,
) -> None:
    """The dedupe key makes duplicate delivery structurally impossible."""

    database_path = tmp_path / "dedupe.sqlite"
    database = SQLiteDatabase(database_path)
    database.initialize()

    _, recorded = _blocked_review(harness_factory, database_path)
    assert recorded

    copied = [name for name in _columns_of(database_path, "findings") if name != "id"]

    with database.connection() as connection:
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                f"INSERT INTO findings (id, {', '.join(copied)}) "
                f"SELECT ?, {', '.join(copied)} FROM findings LIMIT 1",
                ("99999999-9999-9999-9999-999999999999",),
            )


def test_evidence_is_append_only(
    tmp_path: Path,
    harness_factory: HarnessFactory,
) -> None:
    """Recorded proof is never rewritten or removed."""

    database_path = tmp_path / "evidence-trigger.sqlite"
    database = SQLiteDatabase(database_path)
    database.initialize()

    triggers = _triggers(database)
    assert {"evidence_append_only_update", "evidence_append_only_delete"} <= triggers

    _, recorded = _checked_run(harness_factory, database_path)
    assert recorded

    evidence_id = recorded[0]["id"]

    with database.connection() as connection:
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                "UPDATE evidence SET status = 'FAILED' WHERE id = ?",
                (evidence_id,),
            )

        with pytest.raises(sqlite3.IntegrityError):
            connection.execute("DELETE FROM evidence WHERE id = ?", (evidence_id,))


def test_evidence_rejects_an_unknown_run(
    tmp_path: Path,
    harness_factory: HarnessFactory,
) -> None:
    """Evidence cannot reference a Run that does not exist."""

    database_path = tmp_path / "foreign-keys.sqlite"
    database = SQLiteDatabase(database_path)
    database.initialize()

    _, recorded = _checked_run(harness_factory, database_path)
    assert recorded

    stored = _row(database, "evidence", recorded[0]["id"])
    columns = _columns_of(database_path, "evidence")

    substituted = {name: stored[name] for name in columns}
    substituted["id"] = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    substituted["run_id"] = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

    with database.connection() as connection:
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                f"INSERT INTO evidence ({', '.join(columns)}) "
                f"VALUES ({', '.join('?' for _ in columns)})",
                tuple(substituted[name] for name in columns),
            )


def _row(database: SQLiteDatabase, table: str, row_id: str) -> dict[str, Any]:
    with database.connection() as connection:
        row = connection.execute(f"SELECT * FROM {table} WHERE id = ?", (row_id,)).fetchone()

    assert row is not None
    return dict(row)
