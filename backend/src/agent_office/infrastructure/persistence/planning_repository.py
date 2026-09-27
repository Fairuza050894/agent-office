"""SQLite adapters for the Phase 9 planning bounded context."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import cast

from agent_office.application.planning import (
    ComposerMessageRepository,
    ComposerThreadRepository,
    PlanningArtifactRepository,
    PlanningEventCursor,
    PlanningEventRepository,
    PlanningPersistenceError,
    RequirementCandidateRepository,
    TeamProposalRepository,
)
from agent_office.domain import (
    ComposerActorType,
    ComposerIntent,
    ComposerMessage,
    ComposerMessageId,
    ComposerMessageKind,
    ComposerThread,
    ComposerThreadId,
    ComposerThreadStatus,
    DomainId,
    ExecutorId,
    PlanningArtifact,
    PlanningArtifactId,
    PlanningArtifactStatus,
    PlanningArtifactType,
    PlanningContent,
    PlanningEvent,
    PlanningEventId,
    PlanningEventType,
    PlanningValue,
    ProjectId,
    RequirementCandidate,
    RequirementCandidateId,
    RequirementStatus,
    TeamMemberDisposition,
    TeamPhase,
    TeamProposal,
    TeamProposalId,
    TeamProposalMember,
    TeamProposalStatus,
    WorkflowDefinitionId,
    to_utc,
)
from agent_office.persistence import SQLiteDatabase


class SQLiteComposerThreadRepository(ComposerThreadRepository):
    def __init__(self, database: SQLiteDatabase) -> None:
        self._database = database

    def add(self, thread: ComposerThread) -> None:
        try:
            with self._database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO composer_threads (
                        id, project_id, requested_intent, resolved_intent, status,
                        title, timezone, executor_id, workflow_id,
                        created_at, updated_at, completed_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    _thread_parameters(thread),
                )
        except sqlite3.IntegrityError as exc:
            raise PlanningPersistenceError("Composer thread persistence invariant failed") from exc

    def get(self, thread_id: ComposerThreadId) -> ComposerThread | None:
        with self._database.connection() as connection:
            row = connection.execute(
                "SELECT * FROM composer_threads WHERE id = ?",
                (str(thread_id),),
            ).fetchone()
        return None if row is None else _hydrate_thread(row)

    def save(self, thread: ComposerThread) -> None:
        with self._database.transaction() as connection:
            cursor = connection.execute(
                """
                UPDATE composer_threads
                SET resolved_intent = ?, status = ?, title = ?, timezone = ?,
                    executor_id = ?, workflow_id = ?, updated_at = ?, completed_at = ?
                WHERE id = ?
                """,
                (
                    _optional_intent(thread.resolved_intent),
                    thread.status.value,
                    thread.title,
                    thread.timezone,
                    _optional_id(thread.executor_id),
                    _optional_id(thread.workflow_id),
                    _serialize_datetime(thread.updated_at),
                    _serialize_optional_datetime(thread.completed_at),
                    str(thread.id),
                ),
            )
            if cursor.rowcount != 1:
                raise PlanningPersistenceError(f"Composer thread {thread.id} was not found")

    def list_by_project(self, project_id: ProjectId) -> tuple[ComposerThread, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM composer_threads
                WHERE project_id = ?
                ORDER BY updated_at DESC, id ASC
                """,
                (str(project_id),),
            ).fetchall()
        return tuple(_hydrate_thread(row) for row in rows)


class SQLiteComposerMessageRepository(ComposerMessageRepository):
    def __init__(self, database: SQLiteDatabase) -> None:
        self._database = database

    def append(self, message: ComposerMessage) -> None:
        try:
            with self._database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO composer_messages (
                        id, thread_id, actor_type, role_key,
                        message_kind, content, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(message.id),
                        str(message.thread_id),
                        message.actor_type.value,
                        message.role_key,
                        message.message_kind.value,
                        message.content,
                        _serialize_datetime(message.created_at),
                    ),
                )
        except sqlite3.IntegrityError as exc:
            raise PlanningPersistenceError("Composer message persistence invariant failed") from exc

    def get(self, message_id: ComposerMessageId) -> ComposerMessage | None:
        with self._database.connection() as connection:
            row = connection.execute(
                "SELECT * FROM composer_messages WHERE id = ?",
                (str(message_id),),
            ).fetchone()
        return None if row is None else _hydrate_message(row)

    def list_by_thread(self, thread_id: ComposerThreadId) -> tuple[ComposerMessage, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM composer_messages
                WHERE thread_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (str(thread_id),),
            ).fetchall()
        return tuple(_hydrate_message(row) for row in rows)


class SQLiteTeamProposalRepository(TeamProposalRepository):
    def __init__(self, database: SQLiteDatabase) -> None:
        self._database = database

    def add(
        self,
        proposal: TeamProposal,
        members: tuple[TeamProposalMember, ...],
    ) -> None:
        try:
            with self._database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO team_proposals (
                        id, thread_id, phase, status,
                        rationale_summary, created_at, decided_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    _team_parameters(proposal),
                )
                for member in members:
                    if member.proposal_id != proposal.id:
                        raise PlanningPersistenceError(
                            "Team proposal member belongs to a different proposal"
                        )
                    connection.execute(
                        """
                        INSERT INTO team_proposal_members (
                            proposal_id, role_key, disposition, reason, order_hint
                        )
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            str(member.proposal_id),
                            member.role_key,
                            member.disposition.value,
                            member.reason,
                            member.order_hint,
                        ),
                    )
        except sqlite3.IntegrityError as exc:
            raise PlanningPersistenceError("Team proposal persistence invariant failed") from exc

    def get(self, proposal_id: TeamProposalId) -> TeamProposal | None:
        with self._database.connection() as connection:
            row = connection.execute(
                "SELECT * FROM team_proposals WHERE id = ?",
                (str(proposal_id),),
            ).fetchone()
        return None if row is None else _hydrate_team(row)

    def save(self, proposal: TeamProposal) -> None:
        try:
            with self._database.transaction() as connection:
                cursor = connection.execute(
                    """
                    UPDATE team_proposals
                    SET status = ?, rationale_summary = ?, decided_at = ?
                    WHERE id = ?
                    """,
                    (
                        proposal.status.value,
                        proposal.rationale_summary,
                        _serialize_optional_datetime(proposal.decided_at),
                        str(proposal.id),
                    ),
                )
                if cursor.rowcount != 1:
                    raise PlanningPersistenceError(
                        f"Team proposal {proposal.id} was not found"
                    )
        except sqlite3.IntegrityError as exc:
            raise PlanningPersistenceError("Team proposal decision was rejected") from exc

    def list_by_thread(
        self,
        thread_id: ComposerThreadId,
    ) -> tuple[tuple[TeamProposal, tuple[TeamProposalMember, ...]], ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM team_proposals
                WHERE thread_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (str(thread_id),),
            ).fetchall()
            result: list[tuple[TeamProposal, tuple[TeamProposalMember, ...]]] = []
            for row in rows:
                proposal = _hydrate_team(row)
                member_rows = connection.execute(
                    """
                    SELECT *
                    FROM team_proposal_members
                    WHERE proposal_id = ?
                    ORDER BY order_hint ASC, role_key ASC
                    """,
                    (str(proposal.id),),
                ).fetchall()
                result.append(
                    (
                        proposal,
                        tuple(_hydrate_team_member(member) for member in member_rows),
                    )
                )
        return tuple(result)


class SQLitePlanningArtifactRepository(PlanningArtifactRepository):
    def __init__(self, database: SQLiteDatabase) -> None:
        self._database = database

    def add(self, artifact: PlanningArtifact) -> None:
        try:
            with self._database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO planning_artifacts (
                        id, thread_id, artifact_type, title, content_json,
                        author_role_key, status, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(artifact.id),
                        str(artifact.thread_id),
                        artifact.artifact_type.value,
                        artifact.title,
                        json.dumps(dict(artifact.content), sort_keys=True),
                        artifact.author_role_key,
                        artifact.status.value,
                        _serialize_datetime(artifact.created_at),
                        _serialize_datetime(artifact.updated_at),
                    ),
                )
        except sqlite3.IntegrityError as exc:
            raise PlanningPersistenceError(
                "Planning artifact persistence invariant failed"
            ) from exc

    def list_by_thread(self, thread_id: ComposerThreadId) -> tuple[PlanningArtifact, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM planning_artifacts
                WHERE thread_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (str(thread_id),),
            ).fetchall()
        return tuple(_hydrate_artifact(row) for row in rows)


class SQLiteRequirementCandidateRepository(RequirementCandidateRepository):
    def __init__(self, database: SQLiteDatabase) -> None:
        self._database = database

    def add(self, requirement: RequirementCandidate) -> None:
        try:
            with self._database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO requirement_candidates (
                        id, thread_id, project_id, title, problem, requirement,
                        rationale, acceptance_hint, source_roles_json, status,
                        created_at, updated_at, approved_at, decided_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    _requirement_parameters(requirement),
                )
        except sqlite3.IntegrityError as exc:
            raise PlanningPersistenceError("Requirement persistence invariant failed") from exc

    def get(
        self,
        requirement_id: RequirementCandidateId,
    ) -> RequirementCandidate | None:
        with self._database.connection() as connection:
            row = connection.execute(
                "SELECT * FROM requirement_candidates WHERE id = ?",
                (str(requirement_id),),
            ).fetchone()
        return None if row is None else _hydrate_requirement(row)

    def save(self, requirement: RequirementCandidate) -> None:
        try:
            with self._database.transaction() as connection:
                cursor = connection.execute(
                    """
                    UPDATE requirement_candidates
                    SET title = ?, problem = ?, requirement = ?, rationale = ?,
                        acceptance_hint = ?, source_roles_json = ?, status = ?,
                        updated_at = ?, approved_at = ?, decided_at = ?
                    WHERE id = ?
                    """,
                    (
                        requirement.title,
                        requirement.problem,
                        requirement.requirement,
                        requirement.rationale,
                        requirement.acceptance_hint,
                        json.dumps(requirement.source_roles),
                        requirement.status.value,
                        _serialize_datetime(requirement.updated_at),
                        _serialize_optional_datetime(requirement.approved_at),
                        _serialize_optional_datetime(requirement.decided_at),
                        str(requirement.id),
                    ),
                )
                if cursor.rowcount != 1:
                    raise PlanningPersistenceError(
                        f"Requirement candidate {requirement.id} was not found"
                    )
        except sqlite3.IntegrityError as exc:
            raise PlanningPersistenceError("Requirement decision was rejected") from exc

    def list_by_thread(
        self,
        thread_id: ComposerThreadId,
    ) -> tuple[RequirementCandidate, ...]:
        with self._database.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM requirement_candidates
                WHERE thread_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (str(thread_id),),
            ).fetchall()
        return tuple(_hydrate_requirement(row) for row in rows)


class SQLitePlanningEventRepository(PlanningEventRepository):
    def __init__(self, database: SQLiteDatabase) -> None:
        self._database = database

    def append(self, event: PlanningEvent) -> None:
        try:
            with self._database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO planning_events (
                        id, thread_id, project_id, event_type, role_key,
                        occurred_at, recorded_at, sequence, payload_json
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(event.id),
                        str(event.thread_id),
                        _optional_id(event.project_id),
                        event.event_type.value,
                        event.role_key,
                        _serialize_datetime(event.occurred_at),
                        _serialize_datetime(event.recorded_at),
                        event.sequence,
                        json.dumps(dict(event.payload), sort_keys=True),
                    ),
                )
        except sqlite3.IntegrityError as exc:
            raise PlanningPersistenceError("Planning Event persistence invariant failed") from exc

    def get(self, event_id: PlanningEventId) -> PlanningEvent | None:
        with self._database.connection() as connection:
            row = connection.execute(
                "SELECT * FROM planning_events WHERE id = ?",
                (str(event_id),),
            ).fetchone()
        return None if row is None else _hydrate_event(row)

    def next_sequence(self, thread_id: ComposerThreadId) -> int:
        with self._database.connection() as connection:
            row = connection.execute(
                """
                SELECT MAX(sequence) AS max_sequence
                FROM planning_events
                WHERE thread_id = ?
                """,
                (str(thread_id),),
            ).fetchone()
        if row is None or row["max_sequence"] is None:
            return 0
        return int(row["max_sequence"]) + 1

    def list_by_thread(
        self,
        thread_id: ComposerThreadId,
        *,
        limit: int,
        after: PlanningEventCursor | None = None,
    ) -> tuple[PlanningEvent, ...]:
        query = """
            SELECT *
            FROM planning_events
            WHERE thread_id = ?
        """
        parameters: list[object] = [str(thread_id)]

        if after is not None:
            query += """
              AND (
                    recorded_at > ?
                    OR (recorded_at = ? AND id > ?)
              )
            """
            serialized = _serialize_datetime(after.recorded_at)
            parameters.extend((serialized, serialized, str(after.event_id)))

        query += " ORDER BY recorded_at ASC, id ASC LIMIT ?"
        parameters.append(limit)

        with self._database.connection() as connection:
            rows = connection.execute(query, tuple(parameters)).fetchall()
        return tuple(_hydrate_event(row) for row in rows)


def _thread_parameters(thread: ComposerThread) -> tuple[object, ...]:
    return (
        str(thread.id),
        _optional_id(thread.project_id),
        thread.requested_intent.value,
        _optional_enum(thread.resolved_intent),
        thread.status.value,
        thread.title,
        thread.timezone,
        _optional_id(thread.executor_id),
        _optional_id(thread.workflow_id),
        _serialize_datetime(thread.created_at),
        _serialize_datetime(thread.updated_at),
        _serialize_optional_datetime(thread.completed_at),
    )


def _hydrate_thread(row: sqlite3.Row) -> ComposerThread:
    return ComposerThread(
        id=ComposerThreadId.parse(row["id"]),
        project_id=_parse_optional_id(row["project_id"], ProjectId),
        requested_intent=ComposerIntent(row["requested_intent"]),
        resolved_intent=(
            None if row["resolved_intent"] is None else ComposerIntent(row["resolved_intent"])
        ),
        status=ComposerThreadStatus(row["status"]),
        title=row["title"],
        timezone=row["timezone"],
        executor_id=_parse_optional_id(row["executor_id"], ExecutorId),
        workflow_id=_parse_optional_id(row["workflow_id"], WorkflowDefinitionId),
        created_at=_parse_datetime(row["created_at"]),
        updated_at=_parse_datetime(row["updated_at"]),
        completed_at=_parse_optional_datetime(row["completed_at"]),
    )


def _hydrate_message(row: sqlite3.Row) -> ComposerMessage:
    return ComposerMessage(
        id=ComposerMessageId.parse(row["id"]),
        thread_id=ComposerThreadId.parse(row["thread_id"]),
        actor_type=ComposerActorType(row["actor_type"]),
        role_key=row["role_key"],
        message_kind=ComposerMessageKind(row["message_kind"]),
        content=row["content"],
        created_at=_parse_datetime(row["created_at"]),
    )


def _team_parameters(proposal: TeamProposal) -> tuple[object, ...]:
    return (
        str(proposal.id),
        str(proposal.thread_id),
        proposal.phase.value,
        proposal.status.value,
        proposal.rationale_summary,
        _serialize_datetime(proposal.created_at),
        _serialize_optional_datetime(proposal.decided_at),
    )


def _hydrate_team(row: sqlite3.Row) -> TeamProposal:
    return TeamProposal(
        id=TeamProposalId.parse(row["id"]),
        thread_id=ComposerThreadId.parse(row["thread_id"]),
        phase=TeamPhase(row["phase"]),
        status=TeamProposalStatus(row["status"]),
        rationale_summary=row["rationale_summary"],
        created_at=_parse_datetime(row["created_at"]),
        decided_at=_parse_optional_datetime(row["decided_at"]),
    )


def _hydrate_team_member(row: sqlite3.Row) -> TeamProposalMember:
    return TeamProposalMember(
        proposal_id=TeamProposalId.parse(row["proposal_id"]),
        role_key=row["role_key"],
        disposition=TeamMemberDisposition(row["disposition"]),
        reason=row["reason"],
        order_hint=int(row["order_hint"]),
    )


def _hydrate_artifact(row: sqlite3.Row) -> PlanningArtifact:
    return PlanningArtifact(
        id=PlanningArtifactId.parse(row["id"]),
        thread_id=ComposerThreadId.parse(row["thread_id"]),
        artifact_type=PlanningArtifactType(row["artifact_type"]),
        title=row["title"],
        content=_parse_planning_content(row["content_json"]),
        author_role_key=row["author_role_key"],
        status=PlanningArtifactStatus(row["status"]),
        created_at=_parse_datetime(row["created_at"]),
        updated_at=_parse_datetime(row["updated_at"]),
    )


def _requirement_parameters(requirement: RequirementCandidate) -> tuple[object, ...]:
    return (
        str(requirement.id),
        str(requirement.thread_id),
        _optional_id(requirement.project_id),
        requirement.title,
        requirement.problem,
        requirement.requirement,
        requirement.rationale,
        requirement.acceptance_hint,
        json.dumps(requirement.source_roles),
        requirement.status.value,
        _serialize_datetime(requirement.created_at),
        _serialize_datetime(requirement.updated_at),
        _serialize_optional_datetime(requirement.approved_at),
        _serialize_optional_datetime(requirement.decided_at),
    )


def _hydrate_requirement(row: sqlite3.Row) -> RequirementCandidate:
    raw_roles = cast(list[str], json.loads(row["source_roles_json"]))
    return RequirementCandidate(
        id=RequirementCandidateId.parse(row["id"]),
        thread_id=ComposerThreadId.parse(row["thread_id"]),
        project_id=_parse_optional_id(row["project_id"], ProjectId),
        title=row["title"],
        problem=row["problem"],
        requirement=row["requirement"],
        rationale=row["rationale"],
        acceptance_hint=row["acceptance_hint"],
        source_roles=tuple(raw_roles),
        status=RequirementStatus(row["status"]),
        created_at=_parse_datetime(row["created_at"]),
        updated_at=_parse_datetime(row["updated_at"]),
        approved_at=_parse_optional_datetime(row["approved_at"]),
        decided_at=_parse_optional_datetime(row["decided_at"]),
    )


def _hydrate_event(row: sqlite3.Row) -> PlanningEvent:
    return PlanningEvent(
        id=PlanningEventId.parse(row["id"]),
        thread_id=ComposerThreadId.parse(row["thread_id"]),
        project_id=_parse_optional_id(row["project_id"], ProjectId),
        event_type=PlanningEventType(row["event_type"]),
        role_key=row["role_key"],
        occurred_at=_parse_datetime(row["occurred_at"]),
        recorded_at=_parse_datetime(row["recorded_at"]),
        sequence=int(row["sequence"]),
        payload=_parse_planning_content(row["payload_json"]),
    )


def _parse_planning_content(raw: str) -> PlanningContent:
    loaded = cast(dict[str, PlanningValue], json.loads(raw))
    return tuple((str(key), value) for key, value in loaded.items())


def _optional_id(value: object | None) -> str | None:
    return None if value is None else str(value)


def _optional_intent(value: ComposerIntent | None) -> str | None:
    return None if value is None else value.value


def _parse_optional_id[_IdT: DomainId](
    value: str | None,
    identifier_type: type[_IdT],
) -> _IdT | None:
    return None if value is None else identifier_type.parse(value)


def _serialize_datetime(value: datetime) -> str:
    return to_utc(value).isoformat()


def _serialize_optional_datetime(value: datetime | None) -> str | None:
    return None if value is None else _serialize_datetime(value)


def _parse_datetime(value: str) -> datetime:
    return to_utc(datetime.fromisoformat(value))


def _parse_optional_datetime(value: str | None) -> datetime | None:
    return None if value is None else _parse_datetime(value)
