"""SQLite adapter for Task persistence."""

from __future__ import annotations

import sqlite3
from datetime import datetime

from agent_office.application.tasks.errors import TaskPersistenceError
from agent_office.domain import (
    ExecutorId,
    ProjectId,
    Task,
    TaskId,
    WorkflowDefinitionId,
    to_utc,
)
from agent_office.persistence import SQLiteDatabase


class SQLiteTaskRepository:
    """Persist Tasks without exposing SQLite to the application layer."""

    def __init__(self, database: SQLiteDatabase) -> None:
        self._database = database

    def add(self, task: Task) -> None:
        try:
            with self._database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO tasks (
                        id,
                        project_id,
                        title,
                        objective,
                        constraints,
                        requested_workflow_id,
                        requested_executor_id,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    self._parameters(task),
                )
        except sqlite3.IntegrityError as exc:
            raise TaskPersistenceError(
                "Task could not be persisted because a persistence invariant was violated"
            ) from exc

    def get(self, task_id: TaskId) -> Task | None:
        with self._database.connection() as connection:
            row = connection.execute(
                """
                SELECT *
                FROM tasks
                WHERE id = ?
                """,
                (str(task_id),),
            ).fetchone()

        return None if row is None else self._hydrate(row)

    def list_by_project(self, project_id: ProjectId) -> tuple[Task, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM tasks
                WHERE project_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (str(project_id),),
            ).fetchall()

        return tuple(self._hydrate(row) for row in rows)

    def _parameters(self, task: Task) -> tuple[object, ...]:
        return (
            str(task.id),
            str(task.project_id),
            task.title,
            task.objective,
            task.constraints,
            _optional_id(task.requested_workflow_id),
            _optional_id(task.requested_executor_id),
            _serialize_datetime(task.created_at),
            _serialize_datetime(task.updated_at),
        )

    def _hydrate(self, row: sqlite3.Row) -> Task:
        return Task(
            id=TaskId.parse(row["id"]),
            project_id=ProjectId.parse(row["project_id"]),
            title=row["title"],
            objective=row["objective"],
            constraints=row["constraints"],
            requested_workflow_id=_parse_optional_workflow_id(row["requested_workflow_id"]),
            requested_executor_id=_parse_optional_executor_id(row["requested_executor_id"]),
            created_at=_parse_datetime(row["created_at"]),
            updated_at=_parse_datetime(row["updated_at"]),
        )


def _optional_id(value: object | None) -> str | None:
    return None if value is None else str(value)


def _parse_optional_executor_id(value: str | None) -> ExecutorId | None:
    return None if value is None else ExecutorId.parse(value)


def _parse_optional_workflow_id(value: str | None) -> WorkflowDefinitionId | None:
    return None if value is None else WorkflowDefinitionId.parse(value)


def _serialize_datetime(value: datetime) -> str:
    return to_utc(value).isoformat()


def _parse_datetime(value: str) -> datetime:
    return to_utc(datetime.fromisoformat(value))
