"""SQLite adapter for AgentRun persistence."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime

from agent_office.application.agents.errors import AgentRunPersistenceError
from agent_office.domain import (
    AgentAccessMode,
    AgentProfileId,
    AgentRun,
    AgentRunId,
    AgentRunReasonCode,
    AgentRunStatus,
    CapabilityRecord,
    CapabilityReport,
    CapabilitySupport,
    ExecutionOutcome,
    ExecutorCapability,
    ExecutorId,
    ExecutorSessionRef,
    ProjectId,
    RunId,
    SafeMetadata,
    StageKey,
    to_utc,
)
from agent_office.persistence import SQLiteDatabase

_COLUMNS = """
    id,
    run_id,
    project_id,
    stage_key,
    agent_profile_id,
    agent_profile_key,
    agent_profile_version,
    executor_id,
    access_mode,
    status,
    attempt,
    executor_session_ref_json,
    capability_snapshot_json,
    result_outcome,
    result_summary,
    reason_code,
    reason_summary,
    started_at,
    completed_at,
    created_at,
    updated_at
"""


class SQLiteAgentRunRepository:
    """Persist AgentRuns without exposing SQLite to the application layer."""

    def __init__(self, database: SQLiteDatabase) -> None:
        self._database = database

    def add(self, agent_run: AgentRun) -> None:
        try:
            with self._database.transaction() as connection:
                connection.execute(
                    f"""
                    INSERT INTO agent_runs ({_COLUMNS})
                    VALUES ({", ".join("?" * 21)})
                    """,
                    self._parameters(agent_run),
                )
        except sqlite3.IntegrityError as exc:
            raise AgentRunPersistenceError(
                "AgentRun could not be persisted because a persistence invariant was violated"
            ) from exc

    def update(self, agent_run: AgentRun) -> None:
        with self._database.transaction() as connection:
            connection.execute(
                """
                UPDATE agent_runs
                SET status = ?,
                    executor_session_ref_json = ?,
                    capability_snapshot_json = ?,
                    result_outcome = ?,
                    result_summary = ?,
                    reason_code = ?,
                    reason_summary = ?,
                    started_at = ?,
                    completed_at = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    agent_run.status.value,
                    _serialize_session(agent_run.executor_session_ref),
                    _serialize_capabilities(agent_run.capability_snapshot),
                    None if agent_run.result_outcome is None else agent_run.result_outcome.value,
                    agent_run.result_summary,
                    None if agent_run.reason_code is None else agent_run.reason_code.value,
                    agent_run.reason_summary,
                    _optional_datetime(agent_run.started_at),
                    _optional_datetime(agent_run.completed_at),
                    _serialize_datetime(agent_run.updated_at),
                    str(agent_run.id),
                ),
            )

    def get(self, agent_run_id: AgentRunId) -> AgentRun | None:
        with self._database.connection() as connection:
            row = connection.execute(
                """
                SELECT *
                FROM agent_runs
                WHERE id = ?
                """,
                (str(agent_run_id),),
            ).fetchone()

        return None if row is None else _hydrate(row)

    def list_by_run(self, run_id: RunId) -> tuple[AgentRun, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM agent_runs
                WHERE run_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (str(run_id),),
            ).fetchall()

        return tuple(_hydrate(row) for row in rows)

    def list_by_stage(self, run_id: RunId, stage_key: StageKey) -> tuple[AgentRun, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM agent_runs
                WHERE run_id = ?
                  AND stage_key = ?
                ORDER BY created_at ASC, id ASC
                """,
                (str(run_id), stage_key.value),
            ).fetchall()

        return tuple(_hydrate(row) for row in rows)

    def _parameters(self, agent_run: AgentRun) -> tuple[object, ...]:
        return (
            str(agent_run.id),
            str(agent_run.run_id),
            str(agent_run.project_id),
            agent_run.stage_key.value,
            str(agent_run.agent_profile_id),
            agent_run.agent_profile_key,
            agent_run.agent_profile_version,
            str(agent_run.executor_id),
            agent_run.access_mode.value,
            agent_run.status.value,
            agent_run.attempt,
            _serialize_session(agent_run.executor_session_ref),
            _serialize_capabilities(agent_run.capability_snapshot),
            None if agent_run.result_outcome is None else agent_run.result_outcome.value,
            agent_run.result_summary,
            None if agent_run.reason_code is None else agent_run.reason_code.value,
            agent_run.reason_summary,
            _optional_datetime(agent_run.started_at),
            _optional_datetime(agent_run.completed_at),
            _serialize_datetime(agent_run.created_at),
            _serialize_datetime(agent_run.updated_at),
        )


def _hydrate(row: sqlite3.Row) -> AgentRun:
    raw_reason_code = row["reason_code"]
    raw_result_outcome = row["result_outcome"]

    return AgentRun(
        id=AgentRunId.parse(row["id"]),
        run_id=RunId.parse(row["run_id"]),
        project_id=ProjectId.parse(row["project_id"]),
        stage_key=StageKey(row["stage_key"]),
        agent_profile_id=AgentProfileId.parse(row["agent_profile_id"]),
        agent_profile_key=row["agent_profile_key"],
        agent_profile_version=int(row["agent_profile_version"]),
        executor_id=ExecutorId.parse(row["executor_id"]),
        access_mode=AgentAccessMode(row["access_mode"]),
        status=AgentRunStatus(row["status"]),
        attempt=int(row["attempt"]),
        executor_session_ref=_parse_session(row["executor_session_ref_json"]),
        capability_snapshot=_parse_capabilities(row["capability_snapshot_json"]),
        result_outcome=(
            None if raw_result_outcome is None else ExecutionOutcome(raw_result_outcome)
        ),
        result_summary=row["result_summary"],
        reason_code=None if raw_reason_code is None else AgentRunReasonCode(raw_reason_code),
        reason_summary=row["reason_summary"],
        started_at=_optional_parse_datetime(row["started_at"]),
        completed_at=_optional_parse_datetime(row["completed_at"]),
        created_at=_parse_datetime(row["created_at"]),
        updated_at=_parse_datetime(row["updated_at"]),
    )


def _serialize_session(session: ExecutorSessionRef | None) -> str | None:
    if session is None:
        return None

    return json.dumps(
        {
            "executor_id": str(session.executor_id),
            "opaque_session_id": session.opaque_session_id,
            "created_at": _serialize_datetime(session.created_at),
            "safe_metadata": [list(item) for item in session.safe_metadata],
        }
    )


def _parse_session(value: str | None) -> ExecutorSessionRef | None:
    if value is None:
        return None

    document = json.loads(value)

    return ExecutorSessionRef(
        executor_id=ExecutorId.parse(document["executor_id"]),
        opaque_session_id=document["opaque_session_id"],
        created_at=_parse_datetime(document["created_at"]),
        safe_metadata=_parse_safe_metadata(document.get("safe_metadata", [])),
    )


def _serialize_capabilities(report: CapabilityReport | None) -> str | None:
    if report is None:
        return None

    return json.dumps(
        {
            "executor_id": str(report.executor_id),
            "capabilities": [
                {
                    "capability": record.capability.value,
                    "support": record.support.value,
                    "limitations": record.limitations,
                    "source": record.source,
                    "checked_at": (
                        None
                        if record.checked_at is None
                        else _serialize_datetime(record.checked_at)
                    ),
                }
                for record in report.capabilities
            ],
        }
    )


def _parse_capabilities(value: str | None) -> CapabilityReport | None:
    if value is None:
        return None

    document = json.loads(value)

    records = tuple(
        CapabilityRecord(
            capability=ExecutorCapability(record["capability"]),
            support=CapabilitySupport(record["support"]),
            limitations=record.get("limitations"),
            source=record.get("source"),
            checked_at=_optional_parse_datetime(record.get("checked_at")),
        )
        for record in document.get("capabilities", [])
    )

    return CapabilityReport(
        executor_id=ExecutorId.parse(document["executor_id"]),
        capabilities=records,
    )


def _parse_safe_metadata(raw: object) -> SafeMetadata:
    if not isinstance(raw, list):
        return ()

    pairs: list[tuple[str, str]] = []

    for item in raw:
        if isinstance(item, list) and len(item) == 2:
            pairs.append((str(item[0]), str(item[1])))

    return tuple(pairs)


def _serialize_datetime(value: datetime) -> str:
    return to_utc(value).isoformat()


def _optional_datetime(value: datetime | None) -> str | None:
    return None if value is None else _serialize_datetime(value)


def _parse_datetime(value: str) -> datetime:
    return to_utc(datetime.fromisoformat(value))


def _optional_parse_datetime(value: str | None) -> datetime | None:
    return None if value is None else _parse_datetime(value)
