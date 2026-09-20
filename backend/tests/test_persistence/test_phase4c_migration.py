"""Phase 4C schema migration: explicit candidate Workspace identity."""

from __future__ import annotations

from pathlib import Path

from agent_office.persistence import LATEST_SCHEMA_VERSION, MIGRATIONS, SQLiteDatabase
from agent_office.persistence.sqlite import _write_schema_version


def _seed_v8(path: Path) -> SQLiteDatabase:
    database = SQLiteDatabase(path)

    for version in range(1, 9):
        with database.transaction() as connection:
            MIGRATIONS[version](connection)
            _write_schema_version(connection, version)

    with database.transaction() as connection:
        connection.execute(
            """
            INSERT INTO projects (
                id, name, repository_path, canonical_path, git_common_dir,
                default_branch, preferred_executor_id, default_workflow_id,
                status, created_at, updated_at, archived_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "project-1",
                "Project",
                "/tmp/repository",
                "/tmp/repository",
                "/tmp/repository/.git",
                "main",
                None,
                None,
                "ACTIVE",
                "2026-09-19T00:00:00+00:00",
                "2026-09-19T00:00:00+00:00",
                None,
            ),
        )
        connection.execute(
            """
            INSERT INTO tasks (
                id, project_id, title, objective, constraints,
                requested_workflow_id, requested_executor_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "task-1",
                "project-1",
                "Task",
                "Objective",
                None,
                None,
                None,
                "2026-09-19T00:00:00+00:00",
                "2026-09-19T00:00:00+00:00",
            ),
        )
        connection.execute(
            """
            INSERT INTO runs (
                id, project_id, task_id, status, requested_executor_id,
                created_at, updated_at, remediation_cycles_used
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "run-1",
                "project-1",
                "task-1",
                "CREATED",
                None,
                "2026-09-19T00:00:00+00:00",
                "2026-09-19T00:00:00+00:00",
                0,
            ),
        )

    return database


def test_v9_adds_nullable_candidate_workspace_without_rewriting_old_runs(tmp_path: Path) -> None:
    database = _seed_v8(tmp_path / "phase4c.sqlite")

    assert database.current_schema_version() == 8
    assert LATEST_SCHEMA_VERSION >= 9

    database.initialize()

    assert database.current_schema_version() == LATEST_SCHEMA_VERSION

    with database.connection() as connection:
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(runs)")}
        run = connection.execute(
            "SELECT candidate_workspace_id FROM runs WHERE id = ?",
            ("run-1",),
        ).fetchone()
        foreign_keys = connection.execute("PRAGMA foreign_key_list(runs)").fetchall()

    assert "candidate_workspace_id" in columns
    assert run is not None
    assert run["candidate_workspace_id"] is None
    assert any(
        row["table"] == "workspaces" and row["from"] == "candidate_workspace_id"
        for row in foreign_keys
    )
