"""SQLite adapters for WorkflowDefinition and WorkflowSnapshot persistence.

Workflow definition versions are append-only. A revision inserts a new
immutable version row and updates only the identity row's latest-version
pointer, name, description, and status. A version that a Run may already
reference is never rewritten, so historical Run meaning cannot drift.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime

from agent_office.application.workflows.errors import (
    WorkflowKeyConflictError,
    WorkflowPersistenceError,
)
from agent_office.domain import (
    ProjectId,
    RunId,
    WorkflowDefinition,
    WorkflowDefinitionId,
    WorkflowDefinitionStatus,
    WorkflowGraph,
    WorkflowSnapshot,
    WorkflowSnapshotId,
    to_utc,
)
from agent_office.persistence import SQLiteDatabase


class SQLiteWorkflowDefinitionRepository:
    """Persist versioned WorkflowDefinitions without exposing SQLite upward."""

    def __init__(self, database: SQLiteDatabase) -> None:
        self._database = database

    def add(self, definition: WorkflowDefinition) -> None:
        try:
            with self._database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO workflow_definitions (
                        id,
                        key,
                        name,
                        description,
                        latest_version,
                        status,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(definition.id),
                        definition.key,
                        definition.name,
                        definition.description,
                        definition.version,
                        definition.status.value,
                        _serialize_datetime(definition.created_at),
                        _serialize_datetime(definition.updated_at),
                    ),
                )
                self._insert_version(connection, definition)
        except sqlite3.IntegrityError as exc:
            raise WorkflowKeyConflictError(
                f"Workflow key {definition.key} is already registered"
            ) from exc

    def add_version(self, definition: WorkflowDefinition) -> None:
        try:
            with self._database.transaction() as connection:
                row = connection.execute(
                    """
                    SELECT latest_version
                    FROM workflow_definitions
                    WHERE id = ?
                    """,
                    (str(definition.id),),
                ).fetchone()

                if row is None:
                    raise WorkflowPersistenceError(
                        f"WorkflowDefinition {definition.id} does not exist"
                    )

                if definition.version <= int(row["latest_version"]):
                    raise WorkflowPersistenceError(
                        "Workflow version history is append-only: "
                        f"version {definition.version} is not newer than "
                        f"{int(row['latest_version'])}"
                    )

                self._insert_version(connection, definition)
                connection.execute(
                    """
                    UPDATE workflow_definitions
                    SET name = ?,
                        description = ?,
                        latest_version = ?,
                        status = ?,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        definition.name,
                        definition.description,
                        definition.version,
                        definition.status.value,
                        _serialize_datetime(definition.updated_at),
                        str(definition.id),
                    ),
                )
        except sqlite3.IntegrityError as exc:
            raise WorkflowPersistenceError(
                "Workflow version could not be persisted because a persistence invariant "
                "was violated"
            ) from exc

    def get(self, workflow_id: WorkflowDefinitionId) -> WorkflowDefinition | None:
        with self._database.connection() as connection:
            row = connection.execute(
                """
                SELECT identity.id AS id,
                       identity.key AS key,
                       identity.name AS name,
                       identity.description AS description,
                       identity.status AS status,
                       identity.created_at AS created_at,
                       identity.updated_at AS updated_at,
                       identity.latest_version AS version,
                       version.schema_version AS schema_version,
                       version.definition_json AS definition_json
                FROM workflow_definitions AS identity
                JOIN workflow_definition_versions AS version
                  ON version.workflow_id = identity.id
                 AND version.version = identity.latest_version
                WHERE identity.id = ?
                """,
                (str(workflow_id),),
            ).fetchone()

        return None if row is None else _hydrate(row)

    def get_by_key(self, key: str) -> WorkflowDefinition | None:
        with self._database.connection() as connection:
            row = connection.execute(
                """
                SELECT identity.id AS id,
                       identity.key AS key,
                       identity.name AS name,
                       identity.description AS description,
                       identity.status AS status,
                       identity.created_at AS created_at,
                       identity.updated_at AS updated_at,
                       identity.latest_version AS version,
                       version.schema_version AS schema_version,
                       version.definition_json AS definition_json
                FROM workflow_definitions AS identity
                JOIN workflow_definition_versions AS version
                  ON version.workflow_id = identity.id
                 AND version.version = identity.latest_version
                WHERE identity.key = ?
                """,
                (key.strip().lower(),),
            ).fetchone()

        return None if row is None else _hydrate(row)

    def get_version(
        self,
        workflow_id: WorkflowDefinitionId,
        version: int,
    ) -> WorkflowDefinition | None:
        with self._database.connection() as connection:
            row = connection.execute(
                """
                SELECT identity.id AS id,
                       identity.key AS key,
                       identity.name AS name,
                       identity.description AS description,
                       identity.status AS status,
                       identity.created_at AS created_at,
                       identity.updated_at AS updated_at,
                       version.version AS version,
                       version.schema_version AS schema_version,
                       version.definition_json AS definition_json
                FROM workflow_definitions AS identity
                JOIN workflow_definition_versions AS version
                  ON version.workflow_id = identity.id
                WHERE identity.id = ?
                  AND version.version = ?
                """,
                (str(workflow_id), version),
            ).fetchone()

        return None if row is None else _hydrate(row)

    def list(self) -> tuple[WorkflowDefinition, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT identity.id AS id,
                       identity.key AS key,
                       identity.name AS name,
                       identity.description AS description,
                       identity.status AS status,
                       identity.created_at AS created_at,
                       identity.updated_at AS updated_at,
                       identity.latest_version AS version,
                       version.schema_version AS schema_version,
                       version.definition_json AS definition_json
                FROM workflow_definitions AS identity
                JOIN workflow_definition_versions AS version
                  ON version.workflow_id = identity.id
                 AND version.version = identity.latest_version
                ORDER BY identity.key ASC
                """
            ).fetchall()

        return tuple(_hydrate(row) for row in rows)

    def list_versions(
        self,
        workflow_id: WorkflowDefinitionId,
    ) -> tuple[WorkflowDefinition, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT identity.id AS id,
                       identity.key AS key,
                       identity.name AS name,
                       identity.description AS description,
                       identity.status AS status,
                       identity.created_at AS created_at,
                       identity.updated_at AS updated_at,
                       version.version AS version,
                       version.schema_version AS schema_version,
                       version.definition_json AS definition_json
                FROM workflow_definitions AS identity
                JOIN workflow_definition_versions AS version
                  ON version.workflow_id = identity.id
                WHERE identity.id = ?
                ORDER BY version.version ASC
                """,
                (str(workflow_id),),
            ).fetchall()

        return tuple(_hydrate(row) for row in rows)

    def _insert_version(
        self,
        connection: sqlite3.Connection,
        definition: WorkflowDefinition,
    ) -> None:
        connection.execute(
            """
            INSERT INTO workflow_definition_versions (
                workflow_id,
                version,
                schema_version,
                definition_json,
                created_at
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                str(definition.id),
                definition.version,
                definition.graph.schema_version,
                json.dumps(definition.graph.to_document()),
                _serialize_datetime(definition.updated_at),
            ),
        )


class SQLiteWorkflowSnapshotRepository:
    """Persist immutable WorkflowSnapshots."""

    def __init__(self, database: SQLiteDatabase) -> None:
        self._database = database

    def add(self, snapshot: WorkflowSnapshot) -> None:
        try:
            with self._database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO workflow_snapshots (
                        id,
                        run_id,
                        project_id,
                        source_workflow_id,
                        source_workflow_key,
                        source_workflow_version,
                        schema_version,
                        definition_json,
                        created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(snapshot.id),
                        str(snapshot.run_id),
                        str(snapshot.project_id),
                        (
                            None
                            if snapshot.source_workflow_id is None
                            else str(snapshot.source_workflow_id)
                        ),
                        snapshot.source_workflow_key,
                        snapshot.source_workflow_version,
                        snapshot.graph.schema_version,
                        json.dumps(snapshot.to_document()),
                        _serialize_datetime(snapshot.created_at),
                    ),
                )
        except sqlite3.IntegrityError as exc:
            raise WorkflowPersistenceError(
                "Workflow snapshot could not be persisted because a Run already has one"
            ) from exc

    def get_by_run(self, run_id: RunId) -> WorkflowSnapshot | None:
        with self._database.connection() as connection:
            row = connection.execute(
                """
                SELECT *
                FROM workflow_snapshots
                WHERE run_id = ?
                """,
                (str(run_id),),
            ).fetchone()

        if row is None:
            return None

        raw_source_id = row["source_workflow_id"]

        return WorkflowSnapshot.from_document(
            snapshot_id=WorkflowSnapshotId.parse(row["id"]),
            run_id=RunId.parse(row["run_id"]),
            project_id=ProjectId.parse(row["project_id"]),
            source_workflow_id=(
                None if raw_source_id is None else WorkflowDefinitionId.parse(raw_source_id)
            ),
            source_workflow_key=row["source_workflow_key"],
            source_workflow_version=int(row["source_workflow_version"]),
            document=json.loads(row["definition_json"]),
            created_at=_parse_datetime(row["created_at"]),
        )


def _hydrate(row: sqlite3.Row) -> WorkflowDefinition:
    return WorkflowDefinition(
        id=WorkflowDefinitionId.parse(row["id"]),
        key=row["key"],
        name=row["name"],
        description=row["description"],
        version=int(row["version"]),
        status=WorkflowDefinitionStatus(row["status"]),
        graph=WorkflowGraph.from_document(json.loads(row["definition_json"])),
        created_at=_parse_datetime(row["created_at"]),
        updated_at=_parse_datetime(row["updated_at"]),
    )


def _serialize_datetime(value: datetime) -> str:
    return to_utc(value).isoformat()


def _parse_datetime(value: str) -> datetime:
    return to_utc(datetime.fromisoformat(value))
