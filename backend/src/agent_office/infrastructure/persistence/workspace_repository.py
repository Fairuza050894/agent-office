"""SQLite adapter for Workspace persistence."""

from __future__ import annotations

import sqlite3
from datetime import datetime

from agent_office.application.workspaces.errors import WorkspacePersistenceError
from agent_office.domain import (
    AgentAccessMode,
    AgentRunId,
    ProjectId,
    RunId,
    Workspace,
    WorkspaceId,
    WorkspaceKind,
    WorkspaceReasonCode,
    WorkspaceStatus,
    to_utc,
)
from agent_office.persistence import SQLiteDatabase

_COLUMNS = """
    id,
    project_id,
    run_id,
    owner_agent_run_id,
    kind,
    access_mode,
    status,
    path_ref,
    base_revision,
    git_branch,
    reason_code,
    reason_summary,
    created_at,
    updated_at,
    released_at
"""

_COLUMN_COUNT = 15


class SQLiteWorkspaceRepository:
    """Persist Workspaces without exposing SQLite to the application layer."""

    def __init__(self, database: SQLiteDatabase) -> None:
        self._database = database

    def add(self, workspace: Workspace) -> None:
        try:
            with self._database.transaction() as connection:
                connection.execute(
                    f"""
                    INSERT INTO workspaces ({_COLUMNS})
                    VALUES ({", ".join("?" * _COLUMN_COUNT)})
                    """,
                    self._parameters(workspace),
                )
        except sqlite3.IntegrityError as exc:
            raise WorkspacePersistenceError(
                "Workspace could not be persisted because a persistence invariant was violated"
            ) from exc

    def update(self, workspace: Workspace) -> None:
        with self._database.transaction() as connection:
            connection.execute(
                """
                UPDATE workspaces
                SET owner_agent_run_id = ?,
                    status = ?,
                    base_revision = ?,
                    git_branch = ?,
                    reason_code = ?,
                    reason_summary = ?,
                    updated_at = ?,
                    released_at = ?
                WHERE id = ?
                """,
                (
                    (
                        None
                        if workspace.owner_agent_run_id is None
                        else str(workspace.owner_agent_run_id)
                    ),
                    workspace.status.value,
                    workspace.base_revision,
                    workspace.git_branch,
                    None if workspace.reason_code is None else workspace.reason_code.value,
                    workspace.reason_summary,
                    _serialize(workspace.updated_at),
                    _optional(workspace.released_at),
                    str(workspace.id),
                ),
            )

    def acquire_write_ownership(
        self,
        workspace_id: WorkspaceId,
        agent_run_id: AgentRunId,
        *,
        updated_at: str,
    ) -> bool:
        """Claim write ownership with one atomic conditional statement.

        The condition is evaluated by the database, so two concurrent writers
        cannot both succeed regardless of application-level races.
        """

        with self._database.transaction() as connection:
            cursor = connection.execute(
                """
                UPDATE workspaces
                SET owner_agent_run_id = ?,
                    status = ?,
                    updated_at = ?
                WHERE id = ?
                  AND owner_agent_run_id IS NULL
                  AND status = ?
                """,
                (
                    str(agent_run_id),
                    WorkspaceStatus.IN_USE.value,
                    updated_at,
                    str(workspace_id),
                    WorkspaceStatus.READY.value,
                ),
            )

            return cursor.rowcount == 1

    def release_write_ownership(
        self,
        workspace_id: WorkspaceId,
        *,
        status: str,
        updated_at: str,
    ) -> bool:
        with self._database.transaction() as connection:
            cursor = connection.execute(
                """
                UPDATE workspaces
                SET owner_agent_run_id = NULL,
                    status = ?,
                    updated_at = ?
                WHERE id = ?
                  AND owner_agent_run_id IS NOT NULL
                """,
                (status, updated_at, str(workspace_id)),
            )

            return cursor.rowcount == 1

    def get(self, workspace_id: WorkspaceId) -> Workspace | None:
        with self._database.connection() as connection:
            row = connection.execute(
                "SELECT * FROM workspaces WHERE id = ?",
                (str(workspace_id),),
            ).fetchone()

        return None if row is None else _hydrate(row)

    def list_by_run(self, run_id: RunId) -> tuple[Workspace, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM workspaces
                WHERE run_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (str(run_id),),
            ).fetchall()

        return tuple(_hydrate(row) for row in rows)

    def find_by_owner(self, agent_run_id: AgentRunId) -> Workspace | None:
        with self._database.connection() as connection:
            row = connection.execute(
                """
                SELECT *
                FROM workspaces
                WHERE owner_agent_run_id = ?
                ORDER BY created_at ASC, id ASC
                LIMIT 1
                """,
                (str(agent_run_id),),
            ).fetchone()

        return None if row is None else _hydrate(row)

    def list_active(self) -> tuple[Workspace, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM workspaces
                WHERE status NOT IN (?, ?)
                ORDER BY created_at ASC, id ASC
                """,
                (WorkspaceStatus.RELEASED.value, WorkspaceStatus.FAILED.value),
            ).fetchall()

        return tuple(_hydrate(row) for row in rows)

    def _parameters(self, workspace: Workspace) -> tuple[object, ...]:
        return (
            str(workspace.id),
            str(workspace.project_id),
            str(workspace.run_id),
            None if workspace.owner_agent_run_id is None else str(workspace.owner_agent_run_id),
            workspace.kind.value,
            workspace.access_mode.value,
            workspace.status.value,
            workspace.path_ref,
            workspace.base_revision,
            workspace.git_branch,
            None if workspace.reason_code is None else workspace.reason_code.value,
            workspace.reason_summary,
            _serialize(workspace.created_at),
            _serialize(workspace.updated_at),
            _optional(workspace.released_at),
        )


def _serialize(value: datetime) -> str:
    return to_utc(value).isoformat()


def _optional(value: datetime | None) -> str | None:
    return None if value is None else _serialize(value)


def _hydrate(row: sqlite3.Row) -> Workspace:
    raw_owner = row["owner_agent_run_id"]
    raw_reason = row["reason_code"]
    raw_released_at = row["released_at"]

    return Workspace(
        id=WorkspaceId.parse(row["id"]),
        project_id=ProjectId.parse(row["project_id"]),
        run_id=RunId.parse(row["run_id"]),
        owner_agent_run_id=None if raw_owner is None else AgentRunId.parse(raw_owner),
        kind=WorkspaceKind(row["kind"]),
        access_mode=AgentAccessMode(row["access_mode"]),
        status=WorkspaceStatus(row["status"]),
        path_ref=row["path_ref"],
        base_revision=row["base_revision"],
        git_branch=row["git_branch"],
        reason_code=None if raw_reason is None else WorkspaceReasonCode(raw_reason),
        reason_summary=row["reason_summary"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
        released_at=(None if raw_released_at is None else datetime.fromisoformat(raw_released_at)),
    )
