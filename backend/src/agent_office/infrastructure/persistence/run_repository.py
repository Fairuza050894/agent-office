"""SQLite adapter for Run persistence."""

from __future__ import annotations

import sqlite3
from datetime import datetime

from agent_office.application.runs.errors import RunPersistenceError
from agent_office.domain import (
    ExecutorId,
    ProjectId,
    Run,
    RunId,
    RunStatus,
    TaskId,
    to_utc,
)
from agent_office.persistence import SQLiteDatabase


class SQLiteRunRepository:
    """Persist Runs without exposing SQLite to the application layer.

    Each Run is an independent record — creating a later Run never touches
    earlier Run rows.
    """

    def __init__(self, database: SQLiteDatabase) -> None:
        self._database = database

    def add(self, run: Run) -> None:
        try:
            with self._database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO runs (
                        id,
                        project_id,
                        task_id,
                        status,
                        requested_executor_id,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    self._parameters(run),
                )
        except sqlite3.IntegrityError as exc:
            raise RunPersistenceError(
                "Run could not be persisted because a persistence invariant was violated"
            ) from exc

    def get(self, run_id: RunId) -> Run | None:
        with self._database.connection() as connection:
            row = connection.execute(
                """
                SELECT *
                FROM runs
                WHERE id = ?
                """,
                (str(run_id),),
            ).fetchone()

        return None if row is None else self._hydrate(row)

    def list_by_task(self, task_id: TaskId) -> tuple[Run, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM runs
                WHERE task_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (str(task_id),),
            ).fetchall()

        return tuple(self._hydrate(row) for row in rows)

    def _parameters(self, run: Run) -> tuple[object, ...]:
        return (
            str(run.id),
            str(run.project_id),
            str(run.task_id),
            run.status.value,
            _optional_id(run.requested_executor_id),
            _serialize_datetime(run.created_at),
            _serialize_datetime(run.updated_at),
        )

    def _hydrate(self, row: sqlite3.Row) -> Run:
        return Run(
            id=RunId.parse(row["id"]),
            project_id=ProjectId.parse(row["project_id"]),
            task_id=TaskId.parse(row["task_id"]),
            status=RunStatus(row["status"]),
            requested_executor_id=_parse_optional_executor_id(row["requested_executor_id"]),
            created_at=_parse_datetime(row["created_at"]),
            updated_at=_parse_datetime(row["updated_at"]),
        )


def _optional_id(value: object | None) -> str | None:
    return None if value is None else str(value)


def _parse_optional_executor_id(value: str | None) -> ExecutorId | None:
    return None if value is None else ExecutorId.parse(value)


def _serialize_datetime(value: datetime) -> str:
    return to_utc(value).isoformat()


def _parse_datetime(value: str) -> datetime:
    return to_utc(datetime.fromisoformat(value))
