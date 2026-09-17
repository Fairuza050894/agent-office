"""SQLite adapter for stage runtime state persistence."""

from __future__ import annotations

import sqlite3
from datetime import datetime

from agent_office.application.runs.errors import RunStagePersistenceError
from agent_office.domain import (
    ProjectId,
    RunId,
    RunStageState,
    RunStageStatus,
    StageCondition,
    StageExecutionMode,
    StageKey,
    StageReasonCode,
    to_utc,
)
from agent_office.persistence import SQLiteDatabase


class SQLiteRunStageRepository:
    """Persist Run stage runtime state without exposing SQLite upward."""

    def __init__(self, database: SQLiteDatabase) -> None:
        self._database = database

    def add_many(self, stages: tuple[RunStageState, ...]) -> None:
        if not stages:
            return

        try:
            with self._database.transaction() as connection:
                connection.executemany(
                    """
                    INSERT INTO run_stages (
                        run_id,
                        project_id,
                        stage_key,
                        status,
                        required,
                        order_hint,
                        execution_mode,
                        condition,
                        reason_code,
                        reason_summary,
                        started_at,
                        completed_at,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    tuple(self._parameters(stage) for stage in stages),
                )
        except sqlite3.IntegrityError as exc:
            raise RunStagePersistenceError(
                "Run stages could not be persisted because a persistence invariant was violated"
            ) from exc

    def update(self, stage: RunStageState) -> None:
        with self._database.transaction() as connection:
            connection.execute(
                """
                UPDATE run_stages
                SET status = ?,
                    reason_code = ?,
                    reason_summary = ?,
                    started_at = ?,
                    completed_at = ?,
                    updated_at = ?
                WHERE run_id = ?
                  AND stage_key = ?
                """,
                (
                    stage.status.value,
                    None if stage.reason_code is None else stage.reason_code.value,
                    stage.reason_summary,
                    _optional_datetime(stage.started_at),
                    _optional_datetime(stage.completed_at),
                    _serialize_datetime(stage.updated_at),
                    str(stage.run_id),
                    stage.stage_key.value,
                ),
            )

    def get(self, run_id: RunId, stage_key: StageKey) -> RunStageState | None:
        with self._database.connection() as connection:
            row = connection.execute(
                """
                SELECT *
                FROM run_stages
                WHERE run_id = ?
                  AND stage_key = ?
                """,
                (str(run_id), stage_key.value),
            ).fetchone()

        return None if row is None else _hydrate(row)

    def list_by_run(self, run_id: RunId) -> tuple[RunStageState, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM run_stages
                WHERE run_id = ?
                ORDER BY order_hint ASC, stage_key ASC
                """,
                (str(run_id),),
            ).fetchall()

        return tuple(_hydrate(row) for row in rows)

    def _parameters(self, stage: RunStageState) -> tuple[object, ...]:
        return (
            str(stage.run_id),
            str(stage.project_id),
            stage.stage_key.value,
            stage.status.value,
            1 if stage.required else 0,
            stage.order_hint,
            stage.execution_mode.value,
            stage.condition.value,
            None if stage.reason_code is None else stage.reason_code.value,
            stage.reason_summary,
            _optional_datetime(stage.started_at),
            _optional_datetime(stage.completed_at),
            _serialize_datetime(stage.created_at),
            _serialize_datetime(stage.updated_at),
        )


def _hydrate(row: sqlite3.Row) -> RunStageState:
    raw_reason_code = row["reason_code"]

    return RunStageState(
        run_id=RunId.parse(row["run_id"]),
        project_id=ProjectId.parse(row["project_id"]),
        stage_key=StageKey(row["stage_key"]),
        status=RunStageStatus(row["status"]),
        required=bool(row["required"]),
        order_hint=int(row["order_hint"]),
        execution_mode=StageExecutionMode(row["execution_mode"]),
        condition=StageCondition(row["condition"]),
        reason_code=None if raw_reason_code is None else StageReasonCode(raw_reason_code),
        reason_summary=row["reason_summary"],
        started_at=_optional_parse_datetime(row["started_at"]),
        completed_at=_optional_parse_datetime(row["completed_at"]),
        created_at=_parse_datetime(row["created_at"]),
        updated_at=_parse_datetime(row["updated_at"]),
    )


def _serialize_datetime(value: datetime) -> str:
    return to_utc(value).isoformat()


def _optional_datetime(value: datetime | None) -> str | None:
    return None if value is None else _serialize_datetime(value)


def _parse_datetime(value: str) -> datetime:
    return to_utc(datetime.fromisoformat(value))


def _optional_parse_datetime(value: str | None) -> datetime | None:
    return None if value is None else _parse_datetime(value)
