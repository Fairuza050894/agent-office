"""SQLite adapter for Evidence persistence.

Evidence is append-only. There is no update and no delete, and the Phase 4B
schema rejects both at the storage layer, so a rerun creates a new record instead
of rewriting history.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime

from agent_office.application.verification.errors import EvidencePersistenceError
from agent_office.domain import (
    AgentRunId,
    Evidence,
    EvidenceId,
    EvidenceKind,
    EvidenceStatus,
    ProjectId,
    RunId,
    TaskId,
    to_utc,
)
from agent_office.persistence import SQLiteDatabase

_COLUMNS = """
    id,
    project_id,
    task_id,
    run_id,
    agent_run_id,
    kind,
    status,
    summary,
    artifact_ref,
    metadata_json,
    schema_version,
    created_at
"""

_COLUMN_COUNT = 12


class SQLiteEvidenceRepository:
    """Persist Evidence without exposing SQLite to the application layer."""

    def __init__(self, database: SQLiteDatabase) -> None:
        self._database = database

    def append(self, evidence: Evidence) -> None:
        try:
            with self._database.transaction() as connection:
                connection.execute(
                    f"""
                    INSERT INTO evidence ({_COLUMNS})
                    VALUES ({", ".join("?" * _COLUMN_COUNT)})
                    """,
                    self._parameters(evidence),
                )
        except sqlite3.IntegrityError as exc:
            raise EvidencePersistenceError(
                "Evidence could not be persisted because a persistence invariant was violated"
            ) from exc

    def get(self, evidence_id: EvidenceId) -> Evidence | None:
        with self._database.connection() as connection:
            row = connection.execute(
                "SELECT * FROM evidence WHERE id = ?",
                (str(evidence_id),),
            ).fetchone()

        return None if row is None else _hydrate(row)

    def list_by_run(self, run_id: RunId) -> tuple[Evidence, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM evidence
                WHERE run_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (str(run_id),),
            ).fetchall()

        return tuple(_hydrate(row) for row in rows)

    def list_by_run_and_kind(self, run_id: RunId, kind: EvidenceKind) -> tuple[Evidence, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM evidence
                WHERE run_id = ? AND kind = ?
                ORDER BY created_at ASC, id ASC
                """,
                (str(run_id), kind.value),
            ).fetchall()

        return tuple(_hydrate(row) for row in rows)

    def _parameters(self, evidence: Evidence) -> tuple[object, ...]:
        return (
            str(evidence.id),
            str(evidence.project_id),
            str(evidence.task_id),
            str(evidence.run_id),
            None if evidence.agent_run_id is None else str(evidence.agent_run_id),
            evidence.kind.value,
            evidence.status.value,
            evidence.summary,
            evidence.artifact_ref,
            json.dumps(dict(evidence.metadata), sort_keys=True),
            evidence.schema_version,
            to_utc(evidence.created_at).isoformat(),
        )


def _hydrate(row: sqlite3.Row) -> Evidence:
    raw_agent_run = row["agent_run_id"]

    return Evidence(
        id=EvidenceId.parse(row["id"]),
        project_id=ProjectId.parse(row["project_id"]),
        task_id=TaskId.parse(row["task_id"]),
        run_id=RunId.parse(row["run_id"]),
        agent_run_id=None if raw_agent_run is None else AgentRunId.parse(raw_agent_run),
        kind=EvidenceKind(row["kind"]),
        status=EvidenceStatus(row["status"]),
        summary=row["summary"],
        artifact_ref=row["artifact_ref"],
        metadata=tuple(
            (str(key), str(value)) for key, value in json.loads(row["metadata_json"]).items()
        ),
        schema_version=int(row["schema_version"]),
        created_at=datetime.fromisoformat(row["created_at"]),
    )
