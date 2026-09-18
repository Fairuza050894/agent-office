"""SQLite adapter for Finding persistence.

Findings are never deleted, and their reviewer attribution, original text, and
identity keys are write-once. Only lifecycle columns are updated.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime

from agent_office.application.review.errors import FindingPersistenceError
from agent_office.domain import (
    AgentRunId,
    Finding,
    FindingCategory,
    FindingId,
    FindingLocation,
    FindingResolutionType,
    FindingSeverity,
    FindingStatus,
    ProjectId,
    RunId,
    to_utc,
)
from agent_office.persistence import SQLiteDatabase

_COLUMNS = """
    id,
    project_id,
    run_id,
    reviewer_agent_run_id,
    category,
    severity,
    title,
    description,
    status,
    identity_key,
    dedupe_key,
    location_json,
    remediation_owner_agent_run_id,
    resolution_type,
    resolver_agent_run_id,
    resolution_summary,
    created_at,
    updated_at,
    resolved_at
"""

_COLUMN_COUNT = 19


class SQLiteFindingRepository:
    """Persist Findings without exposing SQLite to the application layer."""

    def __init__(self, database: SQLiteDatabase) -> None:
        self._database = database

    def add(self, finding: Finding) -> bool:
        """Persist a Finding, returning False when the identity is already known.

        The deduplication key is UNIQUE, so a duplicate reviewer delivery is
        absorbed by the database rather than racing in application code.
        """

        try:
            with self._database.transaction() as connection:
                connection.execute(
                    f"""
                    INSERT INTO findings ({_COLUMNS})
                    VALUES ({", ".join("?" * _COLUMN_COUNT)})
                    """,
                    self._parameters(finding),
                )
        except sqlite3.IntegrityError as exc:
            if self._dedupe_key_exists(finding.dedupe_key):
                return False

            raise FindingPersistenceError(
                "Finding could not be persisted because a persistence invariant was violated"
            ) from exc

        return True

    def update(self, finding: Finding) -> None:
        with self._database.transaction() as connection:
            connection.execute(
                """
                UPDATE findings
                SET status = ?,
                    remediation_owner_agent_run_id = ?,
                    resolution_type = ?,
                    resolver_agent_run_id = ?,
                    resolution_summary = ?,
                    updated_at = ?,
                    resolved_at = ?
                WHERE id = ?
                """,
                (
                    finding.status.value,
                    (
                        None
                        if finding.remediation_owner_agent_run_id is None
                        else str(finding.remediation_owner_agent_run_id)
                    ),
                    None if finding.resolution_type is None else finding.resolution_type.value,
                    (
                        None
                        if finding.resolver_agent_run_id is None
                        else str(finding.resolver_agent_run_id)
                    ),
                    finding.resolution_summary,
                    _serialize(finding.updated_at),
                    _optional(finding.resolved_at),
                    str(finding.id),
                ),
            )

    def get(self, finding_id: FindingId) -> Finding | None:
        with self._database.connection() as connection:
            row = connection.execute(
                "SELECT * FROM findings WHERE id = ?",
                (str(finding_id),),
            ).fetchone()

        return None if row is None else _hydrate(row)

    def find_by_dedupe_key(self, dedupe_key: str) -> Finding | None:
        with self._database.connection() as connection:
            row = connection.execute(
                "SELECT * FROM findings WHERE dedupe_key = ?",
                (dedupe_key,),
            ).fetchone()

        return None if row is None else _hydrate(row)

    def list_by_run(self, run_id: RunId) -> tuple[Finding, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM findings
                WHERE run_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (str(run_id),),
            ).fetchall()

        return tuple(_hydrate(row) for row in rows)

    def list_open_by_run(self, run_id: RunId) -> tuple[Finding, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM findings
                WHERE run_id = ?
                  AND status IN ('OPEN', 'ACKNOWLEDGED', 'REMEDIATING')
                ORDER BY created_at ASC, id ASC
                """,
                (str(run_id),),
            ).fetchall()

        return tuple(_hydrate(row) for row in rows)

    def _dedupe_key_exists(self, dedupe_key: str) -> bool:
        with self._database.connection() as connection:
            row = connection.execute(
                "SELECT 1 FROM findings WHERE dedupe_key = ?",
                (dedupe_key,),
            ).fetchone()

        return row is not None

    def _parameters(self, finding: Finding) -> tuple[object, ...]:
        return (
            str(finding.id),
            str(finding.project_id),
            str(finding.run_id),
            str(finding.reviewer_agent_run_id),
            finding.category.value,
            finding.severity.value,
            finding.title,
            finding.description,
            finding.status.value,
            finding.identity_key,
            finding.dedupe_key,
            None if finding.location is None else json.dumps(_location_document(finding.location)),
            (
                None
                if finding.remediation_owner_agent_run_id is None
                else str(finding.remediation_owner_agent_run_id)
            ),
            None if finding.resolution_type is None else finding.resolution_type.value,
            (None if finding.resolver_agent_run_id is None else str(finding.resolver_agent_run_id)),
            finding.resolution_summary,
            _serialize(finding.created_at),
            _serialize(finding.updated_at),
            _optional(finding.resolved_at),
        )


def _location_document(location: FindingLocation) -> dict[str, object]:
    return {
        "repository_relative_path": location.repository_relative_path,
        "line_start": location.line_start,
        "line_end": location.line_end,
        "symbol": location.symbol,
        "artifact_ref": location.artifact_ref,
    }


def _serialize(value: datetime) -> str:
    return to_utc(value).isoformat()


def _optional(value: datetime | None) -> str | None:
    return None if value is None else _serialize(value)


def _hydrate(row: sqlite3.Row) -> Finding:
    raw_location = row["location_json"]
    raw_owner = row["remediation_owner_agent_run_id"]
    raw_resolution = row["resolution_type"]
    raw_resolver = row["resolver_agent_run_id"]
    raw_resolved_at = row["resolved_at"]

    location: FindingLocation | None = None

    if raw_location is not None:
        document = json.loads(raw_location)
        location = FindingLocation(
            repository_relative_path=document.get("repository_relative_path"),
            line_start=document.get("line_start"),
            line_end=document.get("line_end"),
            symbol=document.get("symbol"),
            artifact_ref=document.get("artifact_ref"),
        )

    return Finding(
        id=FindingId.parse(row["id"]),
        project_id=ProjectId.parse(row["project_id"]),
        run_id=RunId.parse(row["run_id"]),
        reviewer_agent_run_id=AgentRunId.parse(row["reviewer_agent_run_id"]),
        category=FindingCategory(row["category"]),
        severity=FindingSeverity(row["severity"]),
        title=row["title"],
        description=row["description"],
        status=FindingStatus(row["status"]),
        identity_key=row["identity_key"],
        dedupe_key=row["dedupe_key"],
        location=location,
        remediation_owner_agent_run_id=(None if raw_owner is None else AgentRunId.parse(raw_owner)),
        resolution_type=None if raw_resolution is None else FindingResolutionType(raw_resolution),
        resolver_agent_run_id=None if raw_resolver is None else AgentRunId.parse(raw_resolver),
        resolution_summary=row["resolution_summary"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
        resolved_at=(None if raw_resolved_at is None else datetime.fromisoformat(raw_resolved_at)),
    )
