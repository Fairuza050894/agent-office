"""SQLite adapter for Project Registry persistence."""

from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path

from agent_office.application.projects import (
    DuplicateProjectError,
    ProjectNotFoundError,
)
from agent_office.domain import (
    ExecutorId,
    Project,
    ProjectId,
    ProjectStatus,
    RepositoryIdentity,
    WorkflowDefinitionId,
    to_utc,
)
from agent_office.persistence import SQLiteDatabase


class SQLiteProjectRepository:
    """Persist Projects without exposing SQLite to the application layer."""

    def __init__(self, database: SQLiteDatabase) -> None:
        self._database = database

    def add(self, project: Project) -> None:
        try:
            with self._database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO projects (
                        id,
                        name,
                        repository_path,
                        canonical_path,
                        git_common_dir,
                        default_branch,
                        preferred_executor_id,
                        default_workflow_id,
                        status,
                        created_at,
                        updated_at,
                        archived_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    self._parameters(project),
                )
        except sqlite3.IntegrityError as exc:
            raise DuplicateProjectError("Repository is already registered") from exc

    def get(self, project_id: ProjectId) -> Project | None:
        with self._database.connection() as connection:
            row = connection.execute(
                """
                SELECT *
                FROM projects
                WHERE id = ?
                """,
                (str(project_id),),
            ).fetchone()

        return None if row is None else self._hydrate(row)

    def find_by_repository_identity(
        self,
        identity: RepositoryIdentity,
    ) -> Project | None:
        with self._database.connection() as connection:
            row = connection.execute(
                """
                SELECT *
                FROM projects
                WHERE canonical_path = ?
                   OR git_common_dir = ?
                LIMIT 1
                """,
                (
                    str(identity.canonical_path),
                    str(identity.git_common_dir),
                ),
            ).fetchone()

        return None if row is None else self._hydrate(row)

    def list_all(self) -> tuple[Project, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM projects
                ORDER BY created_at ASC, id ASC
                """
            ).fetchall()

        return tuple(self._hydrate(row) for row in rows)

    def save(self, project: Project) -> None:
        with self._database.transaction() as connection:
            cursor = connection.execute(
                """
                UPDATE projects
                SET
                    name = ?,
                    default_branch = ?,
                    preferred_executor_id = ?,
                    default_workflow_id = ?,
                    status = ?,
                    updated_at = ?,
                    archived_at = ?
                WHERE id = ?
                """,
                (
                    project.name,
                    project.default_branch,
                    _optional_id(project.preferred_executor_id),
                    _optional_id(project.default_workflow_id),
                    project.status.value,
                    _serialize_datetime(project.updated_at),
                    _serialize_optional_datetime(project.archived_at),
                    str(project.id),
                ),
            )

            if cursor.rowcount != 1:
                raise ProjectNotFoundError(f"Project {project.id} was not found")

    def _parameters(self, project: Project) -> tuple[object, ...]:
        return (
            str(project.id),
            project.name,
            str(project.repository_path),
            str(project.repository_identity.canonical_path),
            str(project.repository_identity.git_common_dir),
            project.default_branch,
            _optional_id(project.preferred_executor_id),
            _optional_id(project.default_workflow_id),
            project.status.value,
            _serialize_datetime(project.created_at),
            _serialize_datetime(project.updated_at),
            _serialize_optional_datetime(project.archived_at),
        )

    def _hydrate(self, row: sqlite3.Row) -> Project:
        return Project(
            id=ProjectId.parse(row["id"]),
            name=row["name"],
            repository_path=Path(row["repository_path"]),
            repository_identity=RepositoryIdentity(
                canonical_path=Path(row["canonical_path"]),
                git_common_dir=Path(row["git_common_dir"]),
            ),
            default_branch=row["default_branch"],
            preferred_executor_id=_parse_optional_executor_id(row["preferred_executor_id"]),
            default_workflow_id=_parse_optional_workflow_id(row["default_workflow_id"]),
            status=ProjectStatus(row["status"]),
            created_at=_parse_datetime(row["created_at"]),
            updated_at=_parse_datetime(row["updated_at"]),
            archived_at=_parse_optional_datetime(row["archived_at"]),
        )


def _optional_id(value: object | None) -> str | None:
    return None if value is None else str(value)


def _parse_optional_executor_id(
    value: str | None,
) -> ExecutorId | None:
    return None if value is None else ExecutorId.parse(value)


def _parse_optional_workflow_id(
    value: str | None,
) -> WorkflowDefinitionId | None:
    return None if value is None else WorkflowDefinitionId.parse(value)


def _serialize_datetime(value: datetime) -> str:
    return to_utc(value).isoformat()


def _serialize_optional_datetime(
    value: datetime | None,
) -> str | None:
    return None if value is None else _serialize_datetime(value)


def _parse_datetime(value: str) -> datetime:
    return to_utc(datetime.fromisoformat(value))


def _parse_optional_datetime(
    value: str | None,
) -> datetime | None:
    return None if value is None else _parse_datetime(value)
