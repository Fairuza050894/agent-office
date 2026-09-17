"""Phase 3C: append-only AuditRecord for manual control-plane interventions.

An AuditRecord is not an Event. It records that an operator intervened, survives
restart, and cannot be rewritten or injected through any public route.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from conftest import Harness, HarnessFactory

from agent_office.domain import (
    AuditAction,
    AuditActorType,
    AuditRecord,
    AuditRecordId,
    AuditTargetType,
    DomainInvariantError,
    RunId,
    utc_now,
)
from agent_office.infrastructure.executors import REFERENCE_EXECUTOR_ID, ReferenceScenario
from agent_office.persistence import SQLiteDatabase


def _blocked_run(harness_factory: HarnessFactory) -> tuple[Harness, dict[str, Any]]:
    """Return a harness and a Run blocked on an unresolvable Executor."""

    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"], requested_executor_id=str(uuid4()))
    harness.start_raw(run["id"])

    assert harness.run_by_id(run["id"])["status"] == "BLOCKED"

    return harness, {"project": project, "task": task, "run": run}


def _reconcile_blocked_run(
    harness_factory: HarnessFactory,
    tmp_path: Path,
    database_name: str,
) -> tuple[Harness, dict[str, Any], dict[str, Any]]:
    """Return a reopened harness with a Run blocked on unprovable execution.

    A restart loses the in-memory executor sessions, so reconciliation cannot
    prove the started assignment. The Run ends up blocked on a resumable reason
    while its Executor stays resolved, which is the state needed to resume
    without choosing a new Executor.
    """

    database_path = tmp_path / database_name
    harness = harness_factory(ReferenceScenario.WAITING, database_path=database_path)
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    assert harness.run_by_id(run["id"])["resolved_executor_id"] is not None

    reopened = harness_factory(database_path=database_path)
    reopened.reconcile_raw(run["id"])

    blocked = reopened.run_by_id(run["id"])
    assert blocked["status"] == "BLOCKED"
    assert blocked["failure_code"] == "UNKNOWN_EXECUTION_STATE"

    return reopened, run, project


def test_a_run_without_intervention_has_no_audit_history(
    harness_factory: HarnessFactory,
) -> None:
    """Orchestration progress is not a manual intervention."""

    harness = harness_factory()
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] == "COMPLETED"
    assert harness.audit(run["id"]) == []


def test_cancellation_request_is_audited(harness_factory: HarnessFactory) -> None:
    harness, created = _blocked_run(harness_factory)
    run = created["run"]

    harness.cancel_raw(run["id"])

    records = harness.audit(run["id"])
    assert [record["action"] for record in records] == ["RUN_CANCELLATION_REQUESTED"]

    record = records[0]
    assert record["actor_type"] == "USER"
    assert record["actor_id"] is None
    assert record["target_type"] == "RUN"
    assert record["target_id"] == run["id"]
    assert record["project_id"] == created["project"]["id"]
    assert record["run_id"] == run["id"]

    # Nothing had started, so cancellation is provable rather than merely
    # requested, and the record reports the Run state that resulted.
    assert record["safe_metadata"]["status"] == "CANCELLED"


def test_cancellation_is_audited_on_the_executor_path(
    harness_factory: HarnessFactory,
) -> None:
    """The executor-driven cancellation path is audited identically."""

    harness = harness_factory(ReferenceScenario.CANCEL_UNKNOWN)
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    harness.cancel_raw(run["id"])

    records = harness.audit(run["id"])
    assert [record["action"] for record in records] == ["RUN_CANCELLATION_REQUESTED"]
    assert records[0]["safe_metadata"]["status"] == "BLOCKED"
    assert records[0]["safe_metadata"]["reason_code"] == "CANCELLATION_UNKNOWN"


def test_resume_is_audited(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """A resume that names no Executor records exactly one intervention."""

    harness, run, project = _reconcile_blocked_run(harness_factory, tmp_path, "audit-resume.sqlite")

    response = harness.resume_raw(run["id"])
    assert response.status_code == 200, response.text

    # The reconcile this fixture performed is itself an audited intervention.
    records = harness.audit(run["id"])
    assert [record["action"] for record in records] == [
        "RUN_RECONCILIATION_REQUESTED",
        "RUN_RESUME_REQUESTED",
    ]
    assert records[-1]["project_id"] == project["id"]


def test_reconciliation_request_is_audited(harness_factory: HarnessFactory) -> None:
    harness, created = _blocked_run(harness_factory)
    run = created["run"]

    harness.reconcile_raw(run["id"])

    records = harness.audit(run["id"])
    assert [record["action"] for record in records] == ["RUN_RECONCILIATION_REQUESTED"]
    assert records[0]["safe_metadata"]["status"] == "BLOCKED"
    assert records[0]["safe_metadata"]["reason_code"] == "EXECUTOR_UNAVAILABLE"


def test_executor_selection_during_resume_is_audited(
    harness_factory: HarnessFactory,
) -> None:
    """Choosing a different Executor is a distinct audited intervention."""

    harness, created = _blocked_run(harness_factory)
    run = created["run"]
    assert harness.run_by_id(run["id"])["resolved_executor_id"] is None

    harness.resume_raw(run["id"], executor_id=str(REFERENCE_EXECUTOR_ID), changed_areas=[])

    records = harness.audit(run["id"])
    assert [record["action"] for record in records] == [
        "RUN_EXECUTOR_SELECTED",
        "RUN_RESUME_REQUESTED",
    ]

    selection = records[0]
    assert selection["target_type"] == "EXECUTOR"
    assert selection["target_id"] == str(REFERENCE_EXECUTOR_ID)
    # Recorded against the state the operator changed from.
    assert selection["safe_metadata"]["status"] == "BLOCKED"
    # There was no previous Executor to name, so no key is fabricated.
    assert "previous_executor_id" not in selection["safe_metadata"]

    assert records[1]["safe_metadata"]["status"] == "COMPLETED"


def test_reselecting_the_same_executor_records_no_change(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """An explicit selection that changes nothing is not a change of Executor."""

    harness, run, _ = _reconcile_blocked_run(harness_factory, tmp_path, "audit-reselect.sqlite")
    resolved = harness.run_by_id(run["id"])["resolved_executor_id"]

    response = harness.resume_raw(run["id"], executor_id=resolved)
    assert response.status_code == 200, response.text

    actions = [record["action"] for record in harness.audit(run["id"])]
    assert actions == ["RUN_RECONCILIATION_REQUESTED", "RUN_RESUME_REQUESTED"]


def test_each_operator_request_is_audited_separately(
    harness_factory: HarnessFactory,
) -> None:
    """Repeated requests are distinct operator actions, so each is recorded."""

    harness, created = _blocked_run(harness_factory)
    run = created["run"]

    harness.reconcile_raw(run["id"])
    harness.reconcile_raw(run["id"])
    harness.reconcile_raw(run["id"])

    records = harness.audit(run["id"])
    assert len(records) == 3
    assert {record["action"] for record in records} == {"RUN_RECONCILIATION_REQUESTED"}
    assert len({record["id"] for record in records}) == 3


def test_a_rejected_intervention_is_not_audited(
    harness_factory: HarnessFactory,
) -> None:
    """No intervention was applied, so nothing is recorded."""

    harness, created = _blocked_run(harness_factory)
    run = created["run"]

    refused = harness.resume_raw(run["id"], executor_id=str(uuid4()))

    assert refused.status_code == 409
    assert harness.audit(run["id"]) == []


def test_audit_records_survive_restart(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "audit-restart.sqlite"
    harness = harness_factory(database_path=database_path)

    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"], requested_executor_id=str(uuid4()))
    harness.start_raw(run["id"])

    harness.cancel_raw(run["id"])
    before = harness.audit(run["id"])
    assert [record["action"] for record in before] == ["RUN_CANCELLATION_REQUESTED"]

    reopened = harness_factory(database_path=database_path)
    assert reopened.audit(run["id"]) == before

    # A further intervention after restart appends to the same history.
    reopened.reconcile_raw(run["id"])
    after = reopened.audit(run["id"])

    assert len(after) == len(before) + 1
    assert after[0] == before[0]
    assert after[1]["action"] == "RUN_RECONCILIATION_REQUESTED"


def test_audit_history_is_scoped_to_one_run(harness_factory: HarnessFactory) -> None:
    """Cross-Run and cross-Project leakage is impossible by construction."""

    harness = harness_factory()

    first_project = harness.register_project("First Project")
    first_task = harness.create_task(first_project["id"])
    first_run = harness.create_run(first_task["id"])
    harness.start_run(first_run["id"])

    # Same Project, different Run: isolates Run scoping.
    sibling_run = harness.create_run(first_task["id"])
    harness.start_run(sibling_run["id"])

    # Different Project: isolates Project scoping.
    other_project = harness.register_project("Other Project")
    other_task = harness.create_task(other_project["id"])
    other_run = harness.create_run(other_task["id"])
    harness.start_run(other_run["id"])

    harness.reconcile_raw(first_run["id"])

    records = harness.audit(first_run["id"])
    assert len(records) == 1
    assert records[0]["run_id"] == first_run["id"]
    assert records[0]["project_id"] == first_project["id"]

    assert harness.audit(sibling_run["id"]) == []
    assert harness.audit(other_run["id"]) == []


def test_audit_query_of_an_unknown_run_is_not_found(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()

    assert harness.client.get(f"/api/runs/{uuid4()}/audit").status_code == 404


def test_no_public_route_accepts_an_audit_record(
    harness_factory: HarnessFactory,
) -> None:
    """Audit history is produced only by the operations that intervene."""

    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])

    assert harness.client.post(f"/api/runs/{run['id']}/audit").status_code == 405
    assert harness.client.post("/api/audit").status_code == 404
    assert harness.audit(run["id"]) == []


def test_audit_records_carry_no_secret_or_path(
    harness_factory: HarnessFactory,
) -> None:
    harness, created = _blocked_run(harness_factory)
    run = created["run"]

    harness.resume_raw(run["id"], changed_areas=[])

    blob = str(harness.audit(run["id"]))

    for forbidden in (
        "repository_path",
        "canonical_path",
        "git_common_dir",
        str(harness.tmp_path),
        "token",
        "password",
        "secret",
        "authorization",
        "opaque_session_id",
    ):
        assert forbidden not in blob


def test_audit_metadata_keys_cannot_carry_secrets() -> None:
    """The domain rejects secret-bearing metadata keys before persistence."""

    with pytest.raises(DomainInvariantError, match="secret-bearing"):
        AuditRecord(
            id=AuditRecordId.new(),
            run_id=RunId.new(),
            actor_type=AuditActorType.USER,
            action=AuditAction.RUN_RESUME_REQUESTED,
            target_type=AuditTargetType.RUN,
            occurred_at=utc_now(),
            safe_metadata=(("api_token", "abc"),),
        )


def test_audit_target_must_be_a_canonical_identifier() -> None:
    """A filesystem path cannot be smuggled in as an audit target."""

    with pytest.raises(DomainInvariantError, match="canonical"):
        AuditRecord(
            id=AuditRecordId.new(),
            run_id=RunId.new(),
            actor_type=AuditActorType.USER,
            action=AuditAction.RUN_RESUME_REQUESTED,
            target_type=AuditTargetType.RUN,
            target_id="../../etc/passwd",
            occurred_at=utc_now(),
        )


def test_a_run_targeted_audit_record_requires_its_run() -> None:
    """Ownership is not optional for Run-scoped interventions."""

    with pytest.raises(DomainInvariantError, match="must reference its Run"):
        AuditRecord(
            id=AuditRecordId.new(),
            actor_type=AuditActorType.USER,
            action=AuditAction.RUN_RESUME_REQUESTED,
            target_type=AuditTargetType.RUN,
            occurred_at=utc_now(),
        )


def test_audit_storage_rejects_update_and_delete(
    harness_factory: HarnessFactory,
) -> None:
    """Append-only is enforced by the database, not only by convention."""

    harness, created = _blocked_run(harness_factory)
    run = created["run"]
    harness.reconcile_raw(run["id"])

    database = harness.app.state.project_database

    for statement in (
        "UPDATE audit_records SET action = 'RUN_RESUME_REQUESTED'",
        "DELETE FROM audit_records",
    ):
        with pytest.raises(sqlite3.IntegrityError, match="append-only"):
            with database.transaction() as connection:
                connection.execute(statement)

    # The record survived both rejected statements.
    assert len(harness.audit(run["id"])) == 1


def test_audit_storage_rejects_an_unknown_run_reference(
    harness_factory: HarnessFactory,
) -> None:
    """Audit ownership cannot point at a Run that does not exist."""

    harness, _ = _blocked_run(harness_factory)
    database: SQLiteDatabase = harness.app.state.project_database

    with pytest.raises(sqlite3.IntegrityError, match="FOREIGN KEY"):
        with database.transaction() as connection:
            connection.execute(
                """
                INSERT INTO audit_records (
                    id, project_id, run_id, actor_type, action, target_type,
                    target_id, occurred_at, safe_metadata_json
                )
                VALUES (?, NULL, ?, 'USER', 'RUN_RESUME_REQUESTED', 'RUN', ?, ?, '{}')
                """,
                (
                    str(AuditRecordId.new()),
                    str(RunId.new()),
                    str(RunId.new()),
                    utc_now().isoformat(),
                ),
            )
