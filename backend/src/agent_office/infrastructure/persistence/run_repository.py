"""SQLite adapter for Run persistence."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime

from agent_office.application.runs.errors import RunPersistenceError
from agent_office.domain import (
    TERMINAL_RUN_STATUSES,
    ChangeArea,
    ExecutorId,
    ProjectId,
    Run,
    RunId,
    RunReasonCode,
    RunStatus,
    TaskId,
    WorkflowSnapshotId,
    WorkspaceId,
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
                        updated_at,
                        workflow_snapshot_id,
                        resolved_executor_id,
                        changed_areas_json,
                        failure_code,
                        failure_summary,
                        started_at,
                        completed_at,
                        cancel_requested_at,
                        remediation_cycles_used,
                        candidate_workspace_id
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    self._parameters(run),
                )
        except sqlite3.IntegrityError as exc:
            raise RunPersistenceError(
                "Run could not be persisted because a persistence invariant was violated"
            ) from exc

    def update(self, run: Run) -> None:
        """Persist lifecycle changes for an existing Run.

        ``workflow_snapshot_id`` is written once and never changed afterwards,
        which keeps the frozen workflow immutable for the Run.
        """

        with self._database.transaction() as connection:
            connection.execute(
                """
                UPDATE runs
                SET status = ?,
                    resolved_executor_id = ?,
                    changed_areas_json = ?,
                    failure_code = ?,
                    failure_summary = ?,
                    started_at = ?,
                    completed_at = ?,
                    cancel_requested_at = ?,
                    remediation_cycles_used = ?,
                    candidate_workspace_id = COALESCE(?, candidate_workspace_id),
                    updated_at = ?,
                    workflow_snapshot_id = COALESCE(workflow_snapshot_id, ?)
                WHERE id = ?
                """,
                (
                    run.status.value,
                    None if run.resolved_executor_id is None else str(run.resolved_executor_id),
                    _serialize_changed_areas(run.changed_areas),
                    None if run.failure_code is None else run.failure_code.value,
                    run.failure_summary,
                    _optional_datetime(run.started_at),
                    _optional_datetime(run.completed_at),
                    _optional_datetime(run.cancel_requested_at),
                    run.remediation_cycles_used,
                    None if run.candidate_workspace_id is None else str(run.candidate_workspace_id),
                    _serialize_datetime(run.updated_at),
                    None if run.workflow_snapshot_id is None else str(run.workflow_snapshot_id),
                    str(run.id),
                ),
            )

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

    def list_non_terminal(self) -> tuple[Run, ...]:
        terminal = tuple(status.value for status in TERMINAL_RUN_STATUSES)

        with self._database.connection() as connection:
            rows = connection.execute(
                f"""
                SELECT *
                FROM runs
                WHERE status NOT IN ({", ".join("?" * len(terminal))})
                ORDER BY created_at ASC, id ASC
                """,
                terminal,
            ).fetchall()

        return tuple(self._hydrate(row) for row in rows)

    def _parameters(self, run: Run) -> tuple[object, ...]:
        return (
            str(run.id),
            str(run.project_id),
            str(run.task_id),
            run.status.value,
            None if run.requested_executor_id is None else str(run.requested_executor_id),
            _serialize_datetime(run.created_at),
            _serialize_datetime(run.updated_at),
            None if run.workflow_snapshot_id is None else str(run.workflow_snapshot_id),
            None if run.resolved_executor_id is None else str(run.resolved_executor_id),
            _serialize_changed_areas(run.changed_areas),
            None if run.failure_code is None else run.failure_code.value,
            run.failure_summary,
            _optional_datetime(run.started_at),
            _optional_datetime(run.completed_at),
            _optional_datetime(run.cancel_requested_at),
            run.remediation_cycles_used,
            None if run.candidate_workspace_id is None else str(run.candidate_workspace_id),
        )

    def _hydrate(self, row: sqlite3.Row) -> Run:
        raw_failure_code = row["failure_code"]
        raw_executor_id = row["resolved_executor_id"]
        raw_snapshot_id = row["workflow_snapshot_id"]

        return Run(
            id=RunId.parse(row["id"]),
            project_id=ProjectId.parse(row["project_id"]),
            task_id=TaskId.parse(row["task_id"]),
            status=RunStatus(row["status"]),
            requested_executor_id=_parse_optional_executor_id(row["requested_executor_id"]),
            created_at=_parse_datetime(row["created_at"]),
            updated_at=_parse_datetime(row["updated_at"]),
            workflow_snapshot_id=(
                None if raw_snapshot_id is None else WorkflowSnapshotId.parse(raw_snapshot_id)
            ),
            resolved_executor_id=(
                None if raw_executor_id is None else ExecutorId.parse(raw_executor_id)
            ),
            changed_areas=_parse_changed_areas(row["changed_areas_json"]),
            failure_code=None if raw_failure_code is None else RunReasonCode(raw_failure_code),
            failure_summary=row["failure_summary"],
            started_at=_optional_parse_datetime(row["started_at"]),
            completed_at=_optional_parse_datetime(row["completed_at"]),
            cancel_requested_at=_optional_parse_datetime(row["cancel_requested_at"]),
            remediation_cycles_used=int(row["remediation_cycles_used"]),
            candidate_workspace_id=(
                None
                if row["candidate_workspace_id"] is None
                else WorkspaceId.parse(row["candidate_workspace_id"])
            ),
        )


def _serialize_changed_areas(value: tuple[ChangeArea, ...] | None) -> str | None:
    if value is None:
        return None

    return json.dumps([area.value for area in value])


def _parse_changed_areas(value: str | None) -> tuple[ChangeArea, ...] | None:
    if value is None:
        return None

    return tuple(ChangeArea(area) for area in json.loads(value))


def _parse_optional_executor_id(value: str | None) -> ExecutorId | None:
    return None if value is None else ExecutorId.parse(value)


def _serialize_datetime(value: datetime) -> str:
    return to_utc(value).isoformat()


def _optional_datetime(value: datetime | None) -> str | None:
    return None if value is None else _serialize_datetime(value)


def _parse_datetime(value: str) -> datetime:
    return to_utc(datetime.fromisoformat(value))


def _optional_parse_datetime(value: str | None) -> datetime | None:
    return None if value is None else _parse_datetime(value)
