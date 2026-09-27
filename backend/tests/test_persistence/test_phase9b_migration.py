"""Phase 9B migration tests for durable planning truth."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from agent_office.persistence import SQLiteDatabase
from agent_office.persistence.sqlite import LATEST_SCHEMA_VERSION


def _seed_v10(path: Path, monkeypatch: pytest.MonkeyPatch) -> SQLiteDatabase:
    database = SQLiteDatabase(path)
    monkeypatch.setattr(SQLiteDatabase, "LATEST_SCHEMA_VERSION", 10)
    database.initialize()
    assert database.current_schema_version() == 10
    monkeypatch.setattr(SQLiteDatabase, "LATEST_SCHEMA_VERSION", LATEST_SCHEMA_VERSION)
    return database


def test_v10_migrates_to_v11_with_separate_planning_tables(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database = _seed_v10(tmp_path / "phase9b.sqlite", monkeypatch)

    database.initialize()

    assert database.current_schema_version() == 11

    with database.connection() as connection:
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }

    assert {
        "composer_threads",
        "composer_messages",
        "team_proposals",
        "team_proposal_members",
        "planning_artifacts",
        "requirement_candidates",
        "planning_events",
    }.issubset(tables)
    assert "events" in tables


def test_planning_messages_and_events_are_append_only(tmp_path: Path) -> None:
    database = SQLiteDatabase(tmp_path / "append-only.sqlite")
    database.initialize()

    with database.transaction() as connection:
        connection.execute(
            """
            INSERT INTO composer_threads (
                id, project_id, requested_intent, resolved_intent, status,
                title, timezone, executor_id, workflow_id,
                created_at, updated_at, completed_at
            )
            VALUES (?, NULL, 'PLAN', NULL, 'OPEN', NULL, 'UTC', NULL, NULL, ?, ?, NULL)
            """,
            (
                "11111111-1111-4111-8111-111111111111",
                "2026-09-27T00:00:00+00:00",
                "2026-09-27T00:00:00+00:00",
            ),
        )
        connection.execute(
            """
            INSERT INTO composer_messages (
                id, thread_id, actor_type, role_key, message_kind, content, created_at
            )
            VALUES (?, ?, 'USER', NULL, 'USER_PROMPT', 'Plan this', ?)
            """,
            (
                "22222222-2222-4222-8222-222222222222",
                "11111111-1111-4111-8111-111111111111",
                "2026-09-27T00:00:01+00:00",
            ),
        )
        connection.execute(
            """
            INSERT INTO planning_events (
                id, thread_id, project_id, event_type, role_key,
                occurred_at, recorded_at, sequence, payload_json
            )
            VALUES (?, ?, NULL, 'composer.message.received', NULL, ?, ?, 0, '{}')
            """,
            (
                "33333333-3333-4333-8333-333333333333",
                "11111111-1111-4111-8111-111111111111",
                "2026-09-27T00:00:01+00:00",
                "2026-09-27T00:00:01+00:00",
            ),
        )

    with database.transaction() as connection:
        with pytest.raises(sqlite3.IntegrityError, match="append-only"):
            connection.execute(
                "UPDATE composer_messages SET content = 'changed' WHERE id = ?",
                ("22222222-2222-4222-8222-222222222222",),
            )

    with database.transaction() as connection:
        with pytest.raises(sqlite3.IntegrityError, match="append-only"):
            connection.execute(
                "DELETE FROM planning_events WHERE id = ?",
                ("33333333-3333-4333-8333-333333333333",),
            )


def test_requirement_project_scope_and_decision_are_storage_enforced(
    tmp_path: Path,
) -> None:
    database = SQLiteDatabase(tmp_path / "scope.sqlite")
    database.initialize()

    project_a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    project_b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    thread_id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    requirement_id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
    timestamp = "2026-09-27T00:00:00+00:00"

    with database.transaction() as connection:
        for project_id, name in ((project_a, "A"), (project_b, "B")):
            connection.execute(
                """
                INSERT INTO projects (
                    id, name, repository_path, canonical_path, git_common_dir,
                    default_branch, preferred_executor_id, default_workflow_id,
                    status, created_at, updated_at, archived_at
                )
                VALUES (?, ?, ?, ?, ?, 'main', NULL, NULL, 'ACTIVE', ?, ?, NULL)
                """,
                (
                    project_id,
                    name,
                    f"/tmp/{name}",
                    f"/tmp/{name}",
                    f"/tmp/{name}/.git",
                    timestamp,
                    timestamp,
                ),
            )
        connection.execute(
            """
            INSERT INTO composer_threads (
                id, project_id, requested_intent, resolved_intent, status,
                title, timezone, executor_id, workflow_id,
                created_at, updated_at, completed_at
            )
            VALUES (?, ?, 'PLAN', NULL, 'OPEN', NULL, 'UTC', NULL, NULL, ?, ?, NULL)
            """,
            (thread_id, project_a, timestamp, timestamp),
        )

    with database.transaction() as connection:
        with pytest.raises(sqlite3.IntegrityError, match="scope mismatch"):
            connection.execute(
                """
                INSERT INTO requirement_candidates (
                    id, thread_id, project_id, title, problem, requirement,
                    rationale, acceptance_hint, source_roles_json, status,
                    created_at, updated_at, approved_at, decided_at
                )
                VALUES (?, ?, ?, 'R', 'P', 'R', 'Why', NULL, '[]',
                        'PROPOSED', ?, ?, NULL, NULL)
                """,
                (
                    requirement_id,
                    thread_id,
                    project_b,
                    timestamp,
                    timestamp,
                ),
            )

    with database.transaction() as connection:
        connection.execute(
            """
            INSERT INTO requirement_candidates (
                id, thread_id, project_id, title, problem, requirement,
                rationale, acceptance_hint, source_roles_json, status,
                created_at, updated_at, approved_at, decided_at
            )
            VALUES (?, ?, ?, 'R', 'P', 'R', 'Why', NULL, '[]',
                    'PROPOSED', ?, ?, NULL, NULL)
            """,
            (
                requirement_id,
                thread_id,
                project_a,
                timestamp,
                timestamp,
            ),
        )
        connection.execute(
            """
            UPDATE requirement_candidates
            SET status = 'APPROVED', updated_at = ?, approved_at = ?, decided_at = ?
            WHERE id = ?
            """,
            (timestamp, timestamp, timestamp, requirement_id),
        )

    with database.transaction() as connection:
        with pytest.raises(sqlite3.IntegrityError, match="immutable"):
            connection.execute(
                """
                UPDATE requirement_candidates
                SET status = 'DEFERRED', approved_at = NULL
                WHERE id = ?
                """,
                (requirement_id,),
            )
