"""SQLite persistence foundation for Agent Office.

Provides a small, restart-safe SQLite abstraction with explicit schema
versioning and deterministic local control-plane persistence.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path

BUSY_TIMEOUT_MS = 5000
LATEST_SCHEMA_VERSION: int = 11

SCHEMA_VERSION_KEY = "schema_version"


class DatabaseVersionError(RuntimeError):
    """Raised when database schema metadata cannot be safely interpreted."""


def _migration_v1(connection: sqlite3.Connection) -> None:
    """Create the foundation metadata schema.

    The migration deliberately does not write a version number. The migration
    runner records the exact target version after the migration succeeds.
    """

    connection.execute(
        """
        CREATE TABLE schema_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )


def _migration_v2(connection: sqlite3.Connection) -> None:
    """Create Project Registry persistence."""

    connection.execute(
        """
        CREATE TABLE projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            repository_path TEXT NOT NULL,
            canonical_path TEXT NOT NULL UNIQUE,
            git_common_dir TEXT NOT NULL UNIQUE,
            default_branch TEXT NOT NULL,
            preferred_executor_id TEXT,
            default_workflow_id TEXT,
            status TEXT NOT NULL
                CHECK (status IN ('ACTIVE', 'ARCHIVED')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            archived_at TEXT,
            CHECK (
                (status = 'ACTIVE' AND archived_at IS NULL)
                OR
                (status = 'ARCHIVED' AND archived_at IS NOT NULL)
            )
        )
        """
    )


def _migration_v3(connection: sqlite3.Connection) -> None:
    """Create Task and Run persistence."""

    connection.execute(
        """
        CREATE TABLE tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id),
            title TEXT NOT NULL,
            objective TEXT NOT NULL,
            constraints TEXT,
            requested_workflow_id TEXT,
            requested_executor_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE (project_id, id)
        )
        """
    )

    connection.execute(
        """
        CREATE TABLE runs (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id),
            task_id TEXT NOT NULL,
            status TEXT NOT NULL
                CHECK (status IN (
                    'CREATED', 'PLANNING', 'READY', 'RUNNING',
                    'REVIEWING', 'REMEDIATING', 'VERIFYING',
                    'COMPLETED', 'BLOCKED', 'FAILED', 'CANCELLED'
                )),
            requested_executor_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (project_id, task_id)
                REFERENCES tasks(project_id, id)
        )
        """
    )


def _migration_v4(connection: sqlite3.Connection) -> None:
    """Create workflow, stage, AgentRun, and Event persistence."""

    # Composite foreign keys below need a unique parent key on runs.
    connection.execute(
        """
        CREATE UNIQUE INDEX runs_id_project_unique
        ON runs (id, project_id)
        """
    )

    connection.execute(
        """
        CREATE TABLE workflow_definitions (
            id TEXT PRIMARY KEY,
            key TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            latest_version INTEGER NOT NULL CHECK (latest_version >= 1),
            status TEXT NOT NULL
                CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )

    # Workflow definition versions are append-only. Once a version has been
    # frozen into a Run snapshot it is never updated or deleted, so historical
    # Run meaning cannot drift when the reusable definition is edited.
    connection.execute(
        """
        CREATE TABLE workflow_definition_versions (
            workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id),
            version INTEGER NOT NULL CHECK (version >= 1),
            schema_version INTEGER NOT NULL,
            definition_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (workflow_id, version)
        )
        """
    )

    connection.execute(
        """
        CREATE TABLE workflow_snapshots (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            source_workflow_id TEXT REFERENCES workflow_definitions(id),
            source_workflow_key TEXT NOT NULL,
            source_workflow_version INTEGER NOT NULL
                CHECK (source_workflow_version >= 1),
            schema_version INTEGER NOT NULL,
            definition_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE (run_id),
            FOREIGN KEY (run_id, project_id) REFERENCES runs(id, project_id)
        )
        """
    )

    # Phase 3 lifecycle columns. Added columns are nullable so existing Phase 2
    # Run rows remain valid.
    connection.execute(
        """
        ALTER TABLE runs
        ADD COLUMN workflow_snapshot_id TEXT REFERENCES workflow_snapshots(id)
        """
    )

    for column in (
        "resolved_executor_id TEXT",
        "changed_areas_json TEXT",
        "failure_code TEXT",
        "failure_summary TEXT",
        "started_at TEXT",
        "completed_at TEXT",
        "cancel_requested_at TEXT",
    ):
        connection.execute(f"ALTER TABLE runs ADD COLUMN {column}")

    connection.execute(
        """
        CREATE TABLE run_stages (
            run_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            stage_key TEXT NOT NULL,
            status TEXT NOT NULL
                CHECK (status IN (
                    'PENDING', 'READY', 'RUNNING', 'WAITING',
                    'COMPLETED', 'FAILED', 'BLOCKED', 'SKIPPED', 'CANCELLED'
                )),
            required INTEGER NOT NULL CHECK (required IN (0, 1)),
            order_hint INTEGER NOT NULL CHECK (order_hint >= 0),
            execution_mode TEXT NOT NULL
                CHECK (execution_mode IN ('SEQUENTIAL', 'PARALLEL_ALLOWED')),
            condition TEXT NOT NULL,
            reason_code TEXT,
            reason_summary TEXT,
            started_at TEXT,
            completed_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (run_id, stage_key),
            FOREIGN KEY (run_id, project_id) REFERENCES runs(id, project_id)
        )
        """
    )

    connection.execute(
        """
        CREATE TABLE agent_runs (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            stage_key TEXT NOT NULL,
            agent_profile_id TEXT NOT NULL,
            agent_profile_key TEXT NOT NULL,
            agent_profile_version INTEGER NOT NULL
                CHECK (agent_profile_version >= 1),
            executor_id TEXT NOT NULL,
            access_mode TEXT NOT NULL
                CHECK (access_mode IN ('READ_ONLY', 'BOUNDED_WRITE', 'WRITE')),
            status TEXT NOT NULL
                CHECK (status IN (
                    'PENDING', 'STARTING', 'RUNNING', 'WAITING',
                    'COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'
                )),
            attempt INTEGER NOT NULL CHECK (attempt >= 1),
            executor_session_ref_json TEXT,
            capability_snapshot_json TEXT,
            result_outcome TEXT,
            result_summary TEXT,
            reason_code TEXT,
            reason_summary TEXT,
            started_at TEXT,
            completed_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (run_id, stage_key)
                REFERENCES run_stages(run_id, stage_key),
            FOREIGN KEY (run_id, project_id) REFERENCES runs(id, project_id)
        )
        """
    )

    connection.execute(
        """
        CREATE TABLE events (
            id TEXT PRIMARY KEY,
            schema_version INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            project_id TEXT NOT NULL,
            run_id TEXT NOT NULL,
            agent_run_id TEXT REFERENCES agent_runs(id),
            source TEXT NOT NULL,
            source_ref TEXT,
            occurred_at TEXT NOT NULL,
            recorded_at TEXT NOT NULL,
            sequence INTEGER,
            correlation_id TEXT,
            causation_id TEXT,
            payload_json TEXT NOT NULL,
            redacted_keys_json TEXT NOT NULL,
            external_event_id TEXT,
            executor_id TEXT,
            dedupe_key TEXT UNIQUE,
            created_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (run_id, project_id) REFERENCES runs(id, project_id)
        )
        """
    )

    connection.execute(
        """
        CREATE INDEX events_run_recorded_idx
        ON events (run_id, recorded_at, id)
        """
    )
    connection.execute(
        """
        CREATE INDEX events_agent_run_recorded_idx
        ON events (agent_run_id, recorded_at, id)
        """
    )
    connection.execute(
        """
        CREATE INDEX events_project_recorded_idx
        ON events (project_id, recorded_at, id)
        """
    )
    connection.execute(
        """
        CREATE INDEX events_event_type_idx
        ON events (event_type)
        """
    )
    connection.execute(
        """
        CREATE INDEX run_stages_run_idx
        ON run_stages (run_id, order_hint)
        """
    )
    connection.execute(
        """
        CREATE INDEX agent_runs_run_idx
        ON agent_runs (run_id, created_at)
        """
    )
    connection.execute(
        """
        CREATE INDEX agent_runs_stage_idx
        ON agent_runs (run_id, stage_key)
        """
    )
    connection.execute(
        """
        CREATE INDEX workflow_definition_versions_idx
        ON workflow_definition_versions (workflow_id, version)
        """
    )


def _migration_v5(connection: sqlite3.Connection) -> None:
    """Add Phase 3B retry, remediation, and review-verdict lifecycle columns.

    Every column is additive with a non-destructive default, so Phase 2 and
    Phase 3A rows remain valid and readable without rewriting them.
    """

    connection.execute(
        """
        ALTER TABLE runs
        ADD COLUMN remediation_cycles_used INTEGER NOT NULL DEFAULT 0
        """
    )

    connection.execute(
        """
        ALTER TABLE agent_runs
        ADD COLUMN retry_of_agent_run_id TEXT REFERENCES agent_runs(id)
        """
    )
    connection.execute(
        """
        ALTER TABLE agent_runs
        ADD COLUMN remediation_cycle INTEGER NOT NULL DEFAULT 0
        """
    )
    connection.execute(
        """
        ALTER TABLE agent_runs
        ADD COLUMN review_verdict TEXT
        """
    )
    connection.execute(
        """
        ALTER TABLE agent_runs
        ADD COLUMN failure_retryable INTEGER
        """
    )

    connection.execute(
        """
        CREATE INDEX agent_runs_retry_idx
        ON agent_runs (retry_of_agent_run_id)
        """
    )
    connection.execute(
        """
        CREATE INDEX agent_runs_attempt_idx
        ON agent_runs (run_id, stage_key, agent_profile_key, attempt)
        """
    )


def _migration_v6(connection: sqlite3.Connection) -> None:
    """Create append-only AuditRecord persistence.

    Append-only is enforced by the storage layer, not only by convention: the
    UPDATE and DELETE triggers abort, so durable audit history cannot be
    rewritten even by a direct SQL caller.
    """

    connection.execute(
        """
        CREATE TABLE audit_records (
            id TEXT PRIMARY KEY,
            project_id TEXT REFERENCES projects(id),
            run_id TEXT REFERENCES runs(id),
            actor_type TEXT NOT NULL,
            action TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT,
            occurred_at TEXT NOT NULL,
            safe_metadata_json TEXT NOT NULL
        )
        """
    )

    connection.execute(
        """
        CREATE INDEX audit_records_run_idx
        ON audit_records (run_id, occurred_at, id)
        """
    )

    connection.execute(
        """
        CREATE TRIGGER audit_records_append_only_update
        BEFORE UPDATE ON audit_records
        BEGIN
            SELECT RAISE(ABORT, 'audit_records is append-only');
        END
        """
    )

    connection.execute(
        """
        CREATE TRIGGER audit_records_append_only_delete
        BEFORE DELETE ON audit_records
        BEGIN
            SELECT RAISE(ABORT, 'audit_records is append-only');
        END
        """
    )


def _migration_v7(connection: sqlite3.Connection) -> None:
    """Create Phase 4A Workspace persistence.

    Additive only: the new table and the new AgentRun column are created without
    touching any object introduced by v1-v6, so every earlier row stays valid and
    readable.

    ``path_ref`` is an opaque, relative storage reference. The absolute
    filesystem location is never persisted and is recomputed from the configured
    workspace root on every infrastructure operation.
    """

    connection.execute(
        """
        CREATE TABLE workspaces (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id),
            run_id TEXT NOT NULL REFERENCES runs(id),
            owner_agent_run_id TEXT REFERENCES agent_runs(id),
            kind TEXT NOT NULL,
            access_mode TEXT NOT NULL,
            status TEXT NOT NULL,
            path_ref TEXT NOT NULL,
            base_revision TEXT,
            git_branch TEXT,
            reason_code TEXT,
            reason_summary TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            released_at TEXT
        )
        """
    )

    connection.execute(
        """
        ALTER TABLE agent_runs
        ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)
        """
    )

    connection.execute(
        """
        CREATE INDEX workspaces_run_idx
        ON workspaces (run_id, created_at)
        """
    )
    connection.execute(
        """
        CREATE INDEX workspaces_owner_idx
        ON workspaces (owner_agent_run_id)
        """
    )
    connection.execute(
        """
        CREATE INDEX workspaces_status_idx
        ON workspaces (status)
        """
    )


def _migration_v8(connection: sqlite3.Connection) -> None:
    """Create Phase 4B Finding and Evidence persistence.

    Additive only: no object introduced by v1-v7 is touched, so every earlier row
    stays valid and readable.

    Two durability rules are enforced by the schema rather than by convention:

    * ``findings.dedupe_key`` is UNIQUE, so duplicate reviewer delivery cannot
      create a second Finding for the same observation;
    * Findings cannot be deleted and Evidence cannot be updated or deleted, so
      review history and engineering proof are append-only.
    """

    connection.execute(
        """
        CREATE TABLE findings (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id),
            run_id TEXT NOT NULL REFERENCES runs(id),
            reviewer_agent_run_id TEXT NOT NULL REFERENCES agent_runs(id),
            category TEXT NOT NULL,
            severity TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL,
            identity_key TEXT NOT NULL,
            dedupe_key TEXT NOT NULL UNIQUE,
            location_json TEXT,
            remediation_owner_agent_run_id TEXT REFERENCES agent_runs(id),
            resolution_type TEXT,
            resolver_agent_run_id TEXT REFERENCES agent_runs(id),
            resolution_summary TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            resolved_at TEXT
        )
        """
    )

    connection.execute(
        """
        CREATE INDEX findings_run_idx
        ON findings (run_id, created_at)
        """
    )
    connection.execute(
        """
        CREATE INDEX findings_run_status_idx
        ON findings (run_id, severity, status)
        """
    )
    connection.execute(
        """
        CREATE INDEX findings_identity_idx
        ON findings (run_id, identity_key)
        """
    )

    connection.execute(
        """
        CREATE TRIGGER findings_no_delete
        BEFORE DELETE ON findings
        BEGIN
            SELECT RAISE(ABORT, 'findings are never deleted');
        END
        """
    )

    connection.execute(
        """
        CREATE TABLE evidence (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id),
            task_id TEXT NOT NULL REFERENCES tasks(id),
            run_id TEXT NOT NULL REFERENCES runs(id),
            agent_run_id TEXT REFERENCES agent_runs(id),
            kind TEXT NOT NULL,
            status TEXT NOT NULL,
            summary TEXT NOT NULL,
            artifact_ref TEXT,
            metadata_json TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )

    connection.execute(
        """
        CREATE INDEX evidence_run_idx
        ON evidence (run_id, created_at)
        """
    )
    connection.execute(
        """
        CREATE INDEX evidence_run_kind_idx
        ON evidence (run_id, kind)
        """
    )

    connection.execute(
        """
        CREATE TRIGGER evidence_append_only_update
        BEFORE UPDATE ON evidence
        BEGIN
            SELECT RAISE(ABORT, 'evidence is append-only');
        END
        """
    )
    connection.execute(
        """
        CREATE TRIGGER evidence_append_only_delete
        BEFORE DELETE ON evidence
        BEGIN
            SELECT RAISE(ABORT, 'evidence is append-only');
        END
        """
    )


def _migration_v9(connection: sqlite3.Connection) -> None:
    """Persist the explicit Phase 4C candidate Workspace on each Run.

    The column is nullable so every historical Run remains readable. A candidate
    is designated only after a writable Workspace already exists, and the
    foreign key prevents a durable Run from pointing at an unknown Workspace.
    """

    connection.execute(
        """
        ALTER TABLE runs
        ADD COLUMN candidate_workspace_id TEXT REFERENCES workspaces(id)
        """
    )

    connection.execute(
        """
        CREATE INDEX runs_candidate_workspace_idx
        ON runs (candidate_workspace_id)
        """
    )


def _migration_v10(connection: sqlite3.Connection) -> None:
    """Enforce Phase 7 cross-Project ownership at the persistence boundary.

    Existing Phase 3 foreign keys already bind Run-scoped rows to a Project for
    stages and AgentRuns. Phase 7 closes the remaining attachment gaps for
    Workspaces, Event AgentRun references, and candidate Workspace selection.

    The migration validates historical rows before installing triggers. A
    database containing contradictory ownership fails closed instead of silently
    accepting the newer schema version.
    """

    checks = (
        (
            """
            SELECT 1
            FROM workspaces AS workspace
            LEFT JOIN runs AS run
              ON run.id = workspace.run_id
             AND run.project_id = workspace.project_id
            WHERE run.id IS NULL
            LIMIT 1
            """,
            "Existing Workspace has a Run/Project scope mismatch.",
        ),
        (
            """
            SELECT 1
            FROM workspaces AS workspace
            LEFT JOIN agent_runs AS agent_run
              ON agent_run.id = workspace.owner_agent_run_id
             AND agent_run.run_id = workspace.run_id
             AND agent_run.project_id = workspace.project_id
            WHERE workspace.owner_agent_run_id IS NOT NULL
              AND agent_run.id IS NULL
            LIMIT 1
            """,
            "Existing Workspace owner belongs to a different Run or Project.",
        ),
        (
            """
            SELECT 1
            FROM events AS event
            LEFT JOIN agent_runs AS agent_run
              ON agent_run.id = event.agent_run_id
             AND agent_run.run_id = event.run_id
             AND agent_run.project_id = event.project_id
            WHERE event.agent_run_id IS NOT NULL
              AND agent_run.id IS NULL
            LIMIT 1
            """,
            "Existing Event references an AgentRun outside its Run/Project scope.",
        ),
        (
            """
            SELECT 1
            FROM runs AS run
            LEFT JOIN workspaces AS workspace
              ON workspace.id = run.candidate_workspace_id
             AND workspace.run_id = run.id
             AND workspace.project_id = run.project_id
            WHERE run.candidate_workspace_id IS NOT NULL
              AND workspace.id IS NULL
            LIMIT 1
            """,
            "Existing Run candidate Workspace belongs to a different Run or Project.",
        ),
    )

    for statement, message in checks:
        if connection.execute(statement).fetchone() is not None:
            raise DatabaseVersionError(message)

    connection.execute(
        """
        CREATE TRIGGER workspaces_scope_insert
        BEFORE INSERT ON workspaces
        WHEN
            NOT EXISTS (
                SELECT 1
                FROM runs
                WHERE id = NEW.run_id
                  AND project_id = NEW.project_id
            )
            OR (
                NEW.owner_agent_run_id IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1
                    FROM agent_runs
                    WHERE id = NEW.owner_agent_run_id
                      AND run_id = NEW.run_id
                      AND project_id = NEW.project_id
                )
            )
        BEGIN
            SELECT RAISE(ABORT, 'FOREIGN KEY workspace ownership scope mismatch');
        END
        """
    )
    connection.execute(
        """
        CREATE TRIGGER workspaces_scope_update
        BEFORE UPDATE OF project_id, run_id, owner_agent_run_id ON workspaces
        WHEN
            NOT EXISTS (
                SELECT 1
                FROM runs
                WHERE id = NEW.run_id
                  AND project_id = NEW.project_id
            )
            OR (
                NEW.owner_agent_run_id IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1
                    FROM agent_runs
                    WHERE id = NEW.owner_agent_run_id
                      AND run_id = NEW.run_id
                      AND project_id = NEW.project_id
                )
            )
        BEGIN
            SELECT RAISE(ABORT, 'FOREIGN KEY workspace ownership scope mismatch');
        END
        """
    )
    connection.execute(
        """
        CREATE TRIGGER events_agent_scope_insert
        BEFORE INSERT ON events
        WHEN NEW.agent_run_id IS NOT NULL
         AND NOT EXISTS (
                SELECT 1
                FROM agent_runs
                WHERE id = NEW.agent_run_id
                  AND run_id = NEW.run_id
                  AND project_id = NEW.project_id
            )
        BEGIN
            SELECT RAISE(ABORT, 'FOREIGN KEY event AgentRun ownership scope mismatch');
        END
        """
    )
    connection.execute(
        """
        CREATE TRIGGER events_agent_scope_update
        BEFORE UPDATE OF project_id, run_id, agent_run_id ON events
        WHEN NEW.agent_run_id IS NOT NULL
         AND NOT EXISTS (
                SELECT 1
                FROM agent_runs
                WHERE id = NEW.agent_run_id
                  AND run_id = NEW.run_id
                  AND project_id = NEW.project_id
            )
        BEGIN
            SELECT RAISE(ABORT, 'FOREIGN KEY event AgentRun ownership scope mismatch');
        END
        """
    )
    connection.execute(
        """
        CREATE TRIGGER runs_candidate_workspace_scope_insert
        BEFORE INSERT ON runs
        WHEN NEW.candidate_workspace_id IS NOT NULL
         AND NOT EXISTS (
                SELECT 1
                FROM workspaces
                WHERE id = NEW.candidate_workspace_id
                  AND run_id = NEW.id
                  AND project_id = NEW.project_id
            )
        BEGIN
            SELECT RAISE(ABORT, 'FOREIGN KEY candidate Workspace ownership scope mismatch');
        END
        """
    )
    connection.execute(
        """
        CREATE TRIGGER runs_candidate_workspace_scope_update
        BEFORE UPDATE OF project_id, candidate_workspace_id ON runs
        WHEN NEW.candidate_workspace_id IS NOT NULL
         AND NOT EXISTS (
                SELECT 1
                FROM workspaces
                WHERE id = NEW.candidate_workspace_id
                  AND run_id = NEW.id
                  AND project_id = NEW.project_id
            )
        BEGIN
            SELECT RAISE(ABORT, 'FOREIGN KEY candidate Workspace ownership scope mismatch');
        END
        """
    )


def _migration_v11(connection: sqlite3.Connection) -> None:
    """Create Phase 9B planning-domain persistence.

    Planning records are durable and restart-safe, but they are deliberately
    separated from operational Run / AgentRun / Event truth.
    """

    connection.execute(
        """
        CREATE TABLE composer_threads (
            id TEXT PRIMARY KEY,
            project_id TEXT REFERENCES projects(id),
            requested_intent TEXT NOT NULL
                CHECK (requested_intent IN ('AUTO', 'ASK', 'PLAN', 'BRAINSTORM', 'RUN')),
            resolved_intent TEXT
                CHECK (
                    resolved_intent IS NULL
                    OR resolved_intent IN ('ASK', 'PLAN', 'BRAINSTORM', 'RUN')
                ),
            status TEXT NOT NULL
                CHECK (status IN ('OPEN', 'ACTIVE', 'AWAITING_USER', 'COMPLETED', 'ARCHIVED')),
            title TEXT,
            timezone TEXT NOT NULL,
            executor_id TEXT,
            workflow_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            completed_at TEXT,
            CHECK (
                (
                    status IN ('COMPLETED', 'ARCHIVED')
                    AND completed_at IS NOT NULL
                )
                OR
                (
                    status NOT IN ('COMPLETED', 'ARCHIVED')
                    AND completed_at IS NULL
                )
            )
        )
        """
    )
    connection.execute(
        """
        CREATE INDEX composer_threads_project_idx
        ON composer_threads (project_id, updated_at, id)
        """
    )

    connection.execute(
        """
        CREATE TABLE composer_messages (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL REFERENCES composer_threads(id),
            actor_type TEXT NOT NULL CHECK (actor_type IN ('USER', 'ROLE', 'SYSTEM')),
            role_key TEXT,
            message_kind TEXT NOT NULL
                CHECK (
                    message_kind IN (
                        'USER_PROMPT',
                        'ROLE_CONTRIBUTION',
                        'SYSTEM_SUMMARY'
                    )
                ),
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            CHECK (
                (actor_type = 'ROLE' AND role_key IS NOT NULL)
                OR
                (actor_type <> 'ROLE' AND role_key IS NULL)
            )
        )
        """
    )
    connection.execute(
        """
        CREATE INDEX composer_messages_thread_idx
        ON composer_messages (thread_id, created_at, id)
        """
    )
    connection.execute(
        """
        CREATE TRIGGER composer_messages_append_only_update
        BEFORE UPDATE ON composer_messages
        BEGIN
            SELECT RAISE(ABORT, 'composer_messages is append-only');
        END
        """
    )
    connection.execute(
        """
        CREATE TRIGGER composer_messages_append_only_delete
        BEFORE DELETE ON composer_messages
        BEGIN
            SELECT RAISE(ABORT, 'composer_messages is append-only');
        END
        """
    )

    connection.execute(
        """
        CREATE TABLE team_proposals (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL REFERENCES composer_threads(id),
            phase TEXT NOT NULL
                CHECK (phase IN ('PLANNING', 'IMPLEMENTATION', 'REVIEW', 'DOCUMENTATION')),
            status TEXT NOT NULL
                CHECK (status IN ('PROPOSED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED')),
            rationale_summary TEXT NOT NULL,
            created_at TEXT NOT NULL,
            decided_at TEXT,
            CHECK (
                (status = 'PROPOSED' AND decided_at IS NULL)
                OR
                (status <> 'PROPOSED' AND decided_at IS NOT NULL)
            )
        )
        """
    )
    connection.execute(
        """
        CREATE INDEX team_proposals_thread_idx
        ON team_proposals (thread_id, created_at, id)
        """
    )

    connection.execute(
        """
        CREATE TABLE team_proposal_members (
            proposal_id TEXT NOT NULL REFERENCES team_proposals(id),
            role_key TEXT NOT NULL,
            disposition TEXT NOT NULL
                CHECK (disposition IN ('INCLUDED', 'DEFERRED', 'EXCLUDED')),
            reason TEXT NOT NULL,
            order_hint INTEGER NOT NULL CHECK (order_hint >= 0),
            PRIMARY KEY (proposal_id, role_key)
        )
        """
    )

    connection.execute(
        """
        CREATE TABLE planning_artifacts (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL REFERENCES composer_threads(id),
            artifact_type TEXT NOT NULL
                CHECK (artifact_type IN ('BRIEF', 'NOTE', 'DECISION', 'QUESTION', 'RISK', 'ACTION')),
            title TEXT NOT NULL,
            content_json TEXT NOT NULL,
            author_role_key TEXT,
            status TEXT NOT NULL
                CHECK (status IN ('DRAFT', 'OPEN', 'RESOLVED', 'ARCHIVED')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE INDEX planning_artifacts_thread_idx
        ON planning_artifacts (thread_id, created_at, id)
        """
    )

    connection.execute(
        """
        CREATE TABLE requirement_candidates (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL REFERENCES composer_threads(id),
            project_id TEXT REFERENCES projects(id),
            title TEXT NOT NULL,
            problem TEXT NOT NULL,
            requirement TEXT NOT NULL,
            rationale TEXT NOT NULL,
            acceptance_hint TEXT,
            source_roles_json TEXT NOT NULL,
            status TEXT NOT NULL
                CHECK (status IN ('PROPOSED', 'APPROVED', 'REJECTED', 'DEFERRED')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            approved_at TEXT,
            decided_at TEXT,
            CHECK (
                (
                    status = 'PROPOSED'
                    AND approved_at IS NULL
                    AND decided_at IS NULL
                )
                OR
                (
                    status = 'APPROVED'
                    AND approved_at IS NOT NULL
                    AND decided_at IS NOT NULL
                    AND approved_at = decided_at
                )
                OR
                (
                    status IN ('REJECTED', 'DEFERRED')
                    AND approved_at IS NULL
                    AND decided_at IS NOT NULL
                )
            )
        )
        """
    )
    connection.execute(
        """
        CREATE INDEX requirement_candidates_thread_idx
        ON requirement_candidates (thread_id, created_at, id)
        """
    )
    connection.execute(
        """
        CREATE INDEX requirement_candidates_project_status_idx
        ON requirement_candidates (project_id, status, created_at)
        """
    )
    connection.execute(
        """
        CREATE TRIGGER requirement_candidates_scope_insert
        BEFORE INSERT ON requirement_candidates
        WHEN NOT EXISTS (
            SELECT 1
            FROM composer_threads
            WHERE id = NEW.thread_id
              AND project_id IS NEW.project_id
        )
        BEGIN
            SELECT RAISE(ABORT, 'FOREIGN KEY requirement Project scope mismatch');
        END
        """
    )
    connection.execute(
        """
        CREATE TRIGGER requirement_candidates_scope_update
        BEFORE UPDATE OF thread_id, project_id ON requirement_candidates
        WHEN NOT EXISTS (
            SELECT 1
            FROM composer_threads
            WHERE id = NEW.thread_id
              AND project_id IS NEW.project_id
        )
        BEGIN
            SELECT RAISE(ABORT, 'FOREIGN KEY requirement Project scope mismatch');
        END
        """
    )
    connection.execute(
        """
        CREATE TRIGGER requirement_candidates_terminal_status
        BEFORE UPDATE OF status ON requirement_candidates
        WHEN OLD.status <> 'PROPOSED'
        BEGIN
            SELECT RAISE(ABORT, 'requirement decision is immutable');
        END
        """
    )
    connection.execute(
        """
        CREATE TRIGGER requirement_candidates_no_delete
        BEFORE DELETE ON requirement_candidates
        BEGIN
            SELECT RAISE(ABORT, 'requirement_candidates are never deleted');
        END
        """
    )

    connection.execute(
        """
        CREATE TABLE planning_events (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL REFERENCES composer_threads(id),
            project_id TEXT REFERENCES projects(id),
            event_type TEXT NOT NULL,
            role_key TEXT,
            occurred_at TEXT NOT NULL,
            recorded_at TEXT NOT NULL,
            sequence INTEGER NOT NULL CHECK (sequence >= 0),
            payload_json TEXT NOT NULL,
            UNIQUE (thread_id, sequence)
        )
        """
    )
    connection.execute(
        """
        CREATE INDEX planning_events_thread_recorded_idx
        ON planning_events (thread_id, recorded_at, id)
        """
    )
    connection.execute(
        """
        CREATE INDEX planning_events_project_recorded_idx
        ON planning_events (project_id, recorded_at, id)
        """
    )
    connection.execute(
        """
        CREATE TRIGGER planning_events_scope_insert
        BEFORE INSERT ON planning_events
        WHEN NOT EXISTS (
            SELECT 1
            FROM composer_threads
            WHERE id = NEW.thread_id
              AND project_id IS NEW.project_id
        )
        BEGIN
            SELECT RAISE(ABORT, 'FOREIGN KEY planning Event Project scope mismatch');
        END
        """
    )
    connection.execute(
        """
        CREATE TRIGGER planning_events_append_only_update
        BEFORE UPDATE ON planning_events
        BEGIN
            SELECT RAISE(ABORT, 'planning_events is append-only');
        END
        """
    )
    connection.execute(
        """
        CREATE TRIGGER planning_events_append_only_delete
        BEFORE DELETE ON planning_events
        BEGIN
            SELECT RAISE(ABORT, 'planning_events is append-only');
        END
        """
    )


MIGRATIONS: dict[int, Callable[[sqlite3.Connection], None]] = {
    1: _migration_v1,
    2: _migration_v2,
    3: _migration_v3,
    4: _migration_v4,
    5: _migration_v5,
    6: _migration_v6,
    7: _migration_v7,
    8: _migration_v8,
    9: _migration_v9,
    10: _migration_v10,
    11: _migration_v11,
}


class SQLiteDatabase:
    """Minimal SQLite persistence abstraction for Agent Office.

    Connections are owned by this abstraction and always close when their
    context exits. Transactions explicitly begin, commit, or roll back.
    """

    LATEST_SCHEMA_VERSION: int = LATEST_SCHEMA_VERSION

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def _open(self) -> sqlite3.Connection:
        """Open and configure a SQLite connection."""

        self.path.parent.mkdir(parents=True, exist_ok=True)

        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row

        # Agent Office owns transaction boundaries explicitly.
        connection.isolation_level = None

        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute(f"PRAGMA busy_timeout = {BUSY_TIMEOUT_MS}")

        return connection

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        """Yield a configured connection and always close it."""

        connection = self._open()

        try:
            yield connection
        finally:
            connection.close()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """Yield a connection inside an explicit transaction.

        The transaction commits on success and rolls back on any exceptional
        exit. The underlying connection is always closed.
        """

        with self.connection() as connection:
            try:
                connection.execute("BEGIN")
                yield connection
                connection.execute("COMMIT")
            except BaseException:
                if connection.in_transaction:
                    connection.execute("ROLLBACK")
                raise

    def current_schema_version(self) -> int:
        """Return the current schema version.

        A database without schema_metadata is considered uninitialized and
        therefore version 0. Once schema_metadata exists, malformed or missing
        schema-version metadata fails closed.
        """

        with self.connection() as connection:
            if not _metadata_table_exists(connection):
                return 0

            return _read_schema_version(connection)

    def initialize(self) -> None:
        """Idempotently migrate the database to the latest supported schema."""

        current_version = self.current_schema_version()

        if current_version > self.LATEST_SCHEMA_VERSION:
            raise DatabaseVersionError(
                "Database schema is newer than this Agent Office version: "
                f"{current_version} > {self.LATEST_SCHEMA_VERSION}"
            )

        if current_version == self.LATEST_SCHEMA_VERSION:
            return

        self._run_migrations(current_version)

    def _run_migrations(self, starting_version: int) -> None:
        """Apply every required migration sequentially."""

        for version in range(
            starting_version + 1,
            self.LATEST_SCHEMA_VERSION + 1,
        ):
            migration = MIGRATIONS.get(version)

            if migration is None:
                raise DatabaseVersionError(
                    "Database migration sequence is incomplete: "
                    f"missing migration for schema version {version}"
                )

            with self.transaction() as connection:
                migration(connection)
                _write_schema_version(connection, version)


def _metadata_table_exists(connection: sqlite3.Connection) -> bool:
    row = connection.execute(
        """
        SELECT 1
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'schema_metadata'
        """
    ).fetchone()

    return row is not None


def _read_schema_version(connection: sqlite3.Connection) -> int:
    try:
        row = connection.execute(
            """
            SELECT value
            FROM schema_metadata
            WHERE key = ?
            """,
            (SCHEMA_VERSION_KEY,),
        ).fetchone()
    except sqlite3.DatabaseError as exc:
        raise DatabaseVersionError("Database schema metadata is malformed") from exc

    if row is None:
        raise DatabaseVersionError("Database schema metadata exists but schema_version is missing")

    raw_value = row["value"]

    try:
        version = int(raw_value)
    except (TypeError, ValueError) as exc:
        raise DatabaseVersionError("Stored database schema version is invalid") from exc

    if version < 0:
        raise DatabaseVersionError("Stored database schema version must not be negative")

    return version


def _write_schema_version(
    connection: sqlite3.Connection,
    version: int,
) -> None:
    connection.execute(
        """
        INSERT INTO schema_metadata (key, value)
        VALUES (?, ?)
        ON CONFLICT(key)
        DO UPDATE SET value = excluded.value
        """,
        (SCHEMA_VERSION_KEY, str(version)),
    )
