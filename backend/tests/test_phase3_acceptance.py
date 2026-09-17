"""Phase 3 final acceptance: the complete ReferenceExecutor control plane.

Each family drives real application services over the real HTTP API against a
real SQLite database and real temporary Git repositories. Nothing here bypasses
the application layer; the two exceptions are stated where they occur
(external-event ingestion has no HTTP route in Phase 3, and adapter-call
counting needs the registered adapter).

Phase 3 proves orchestration truth. It never asserts that a command ran, that a
test passed, or that Evidence exists. See
`docs/architecture/ADR-0001-phase3-orchestration-evidence-boundary.md`.
"""

from __future__ import annotations

import asyncio
from dataclasses import replace
from pathlib import Path
from typing import Any
from uuid import uuid4

from conftest import Harness, HarnessFactory, ScriptedExecutor, registry_for

from agent_office.domain import (
    EVENT_SCHEMA_VERSION,
    AgentRunId,
    Event,
    EventId,
    EventSource,
    EventType,
    ExecutionStatus,
    ExecutorCapability,
    ProjectId,
    RunId,
    build_payload,
    utc_now,
)
from agent_office.infrastructure.executors import (
    REFERENCE_EXECUTOR_ID,
    ReferenceScenario,
)

EVIDENCE_DOMAIN_PREFIXES = ("review.finding", "evidence.", "test.", "command.", "artifact.")


# ----------------------------------------------------------------------
# Shared helpers
# ----------------------------------------------------------------------


def _event_types(harness: Harness, run_id: str) -> list[str]:
    return [event["event_type"] for event in harness.events(run_id)]


def _first_index(types: list[str], predicate: Any) -> int:
    for index, event_type in enumerate(types):
        if predicate(event_type):
            return index

    raise AssertionError(f"no event matched in {types}")


def _last_index(types: list[str], predicate: Any) -> int:
    for index in range(len(types) - 1, -1, -1):
        if predicate(types[index]):
            return index

    raise AssertionError(f"no event matched in {types}")


def _stage_agent_runs(harness: Harness, run_id: str, stage_key: str) -> list[dict[str, Any]]:
    return [
        agent_run for agent_run in harness.agent_runs(run_id) if agent_run["stage_key"] == stage_key
    ]


def _started_run(
    harness: Harness,
    *,
    workflow_key: str = "enterprise-engineering",
    changed_areas: list[str] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    workflow = harness.workflow_by_key(workflow_key)
    project = harness.register_project()
    task = harness.create_task(
        project["id"],
        title=workflow_key,
        requested_workflow_id=workflow["id"],
    )
    run = harness.create_run(task["id"])

    return run, harness.start_run(run["id"], changed_areas=changed_areas)


def _no_evidence_is_claimed(harness: Harness, run_id: str) -> None:
    """Phase 3 must never assert engineering evidence."""

    types = _event_types(harness, run_id)

    for event_type in types:
        assert not event_type.startswith(EVIDENCE_DOMAIN_PREFIXES), event_type

    blob = str(
        {
            "run": harness.run_by_id(run_id),
            "agents": harness.agent_runs(run_id),
            "stages": harness.stages(run_id),
            "gates": harness.completion_gates(run_id),
            "snapshot": harness.client.get(f"/api/runs/{run_id}/snapshot").json(),
        }
    )

    for forbidden in ("evidence_id", "exit_status", "tests_passed", "test_result", "artifact_id"):
        assert forbidden not in blob


# ----------------------------------------------------------------------
# A. Happy path
# ----------------------------------------------------------------------


def test_a_happy_path_completes_the_full_workflow(
    harness_factory: HarnessFactory,
) -> None:
    """fan-out → fan-in → implementation → review → verification → completion."""

    harness = harness_factory()
    run, started = _started_run(harness, changed_areas=["BACKEND"])

    # The frozen snapshot is retained and is the Run's authority.
    snapshot = harness.client.get(f"/api/runs/{run['id']}/snapshot").json()
    assert snapshot["id"] == started["workflow_snapshot_id"]
    assert {stage["key"] for stage in snapshot["stages"]} == {
        "DISCOVERY",
        "IMPLEMENTATION",
        "REVIEW",
        "REMEDIATION",
        "VERIFICATION",
        "DOCUMENTATION",
    }

    assert started["status"] == "COMPLETED"
    assert harness.completion_gates(run["id"]) == {
        "status": "COMPLETED",
        "complete": True,
        "failures": [],
    }

    # Fan-out: discovery runs two required assignments as separate AgentRuns.
    discovery = _stage_agent_runs(harness, run["id"], "DISCOVERY")
    assert {agent_run["agent_profile_key"] for agent_run in discovery} == {
        "architect",
        "explorer",
    }
    assert len({agent_run["id"] for agent_run in discovery}) == 2
    assert {agent_run["attempt"] for agent_run in discovery} == {1}

    # Fan-in: no implementation assignment starts before every discovery
    # assignment has completed. Proved from the durable event order.
    discovery_completions = [
        index
        for index, event in enumerate(harness.events(run["id"]))
        if event["event_type"] == "agent.completed"
        and event["agent_run_id"] in {agent_run["id"] for agent_run in discovery}
    ]
    implementation_creations = [
        index
        for index, event in enumerate(harness.events(run["id"]))
        if event["event_type"] == "agent.created"
        and event["agent_run_id"]
        in {
            agent_run["id"] for agent_run in _stage_agent_runs(harness, run["id"], "IMPLEMENTATION")
        }
    ]

    assert len(discovery_completions) == 2
    assert implementation_creations
    # Every discovery assignment completed before any implementation assignment
    # was even created.
    assert max(discovery_completions) < min(implementation_creations)

    # Remediation was legitimately skipped: review came back clear.
    stages = {stage["stage_key"]: stage for stage in harness.stages(run["id"])}
    assert stages["REVIEW"]["status"] == "COMPLETED"
    assert stages["REMEDIATION"]["status"] == "SKIPPED"
    assert stages["REMEDIATION"]["reason_code"] == "NOT_APPLICABLE"
    assert stages["REMEDIATION"]["started_at"] is None
    assert stages["VERIFICATION"]["status"] == "COMPLETED"
    assert run["remediation_cycles_used"] == 0 if "remediation_cycles_used" in run else True
    assert harness.run_by_id(run["id"])["remediation_cycles_used"] == 0

    _no_evidence_is_claimed(harness, run["id"])


def test_happy_path_verification_is_a_completed_assignment_not_a_test_run(
    harness_factory: HarnessFactory,
) -> None:
    """Verification means the deterministic assignment completed."""

    harness = harness_factory()
    run, _ = _started_run(harness, changed_areas=[])

    verification = _stage_agent_runs(harness, run["id"], "VERIFICATION")
    assert len(verification) == 1
    assert verification[0]["agent_profile_key"] == "verifier"
    assert verification[0]["access_mode"] == "READ_ONLY"
    assert verification[0]["status"] == "COMPLETED"
    assert verification[0]["result_outcome"] == "SUCCESS"

    types = _event_types(harness, run["id"])
    assert "verification.started" in types
    assert "verification.completed" in types


# ----------------------------------------------------------------------
# B. Review blocker path
# ----------------------------------------------------------------------


def test_b_review_blocker_is_remediated_and_re_reviewed(
    harness_factory: HarnessFactory,
) -> None:
    """A blocker is a successful review verdict, not a failed reviewer."""

    harness = harness_factory(ReferenceScenario.REMEDIATION_SUCCESS)
    run, started = _started_run(harness, changed_areas=[])

    assert started["status"] == "COMPLETED"

    reviewers = _stage_agent_runs(harness, run["id"], "REVIEW")

    # Every reviewer completed successfully. The verdict, not the status,
    # carried the blocker.
    assert {agent_run["status"] for agent_run in reviewers} == {"COMPLETED"}
    assert "BLOCKER" in {agent_run["review_verdict"] for agent_run in reviewers}
    assert "CLEAR" in {agent_run["review_verdict"] for agent_run in reviewers}

    # Cycle 0 carried the blocker; cycle 1 carried the clear re-review.
    assert {
        agent_run["remediation_cycle"]
        for agent_run in reviewers
        if agent_run["review_verdict"] == "BLOCKER"
    } == {0}
    assert {
        agent_run["remediation_cycle"]
        for agent_run in reviewers
        if agent_run["review_verdict"] == "CLEAR"
    } == {1}

    remediation = _stage_agent_runs(harness, run["id"], "REMEDIATION")
    assert remediation
    assert {agent_run["remediation_cycle"] for agent_run in remediation} == {1}

    types = _event_types(harness, run["id"])
    assert "remediation.started" in types
    assert "remediation.completed" in types
    assert "verification.completed" in types

    stages = {stage["stage_key"]: stage for stage in harness.stages(run["id"])}
    assert stages["REVIEW"]["status"] == "COMPLETED"
    assert stages["REMEDIATION"]["status"] == "COMPLETED"
    assert harness.completion_gates(run["id"])["complete"] is True

    _no_evidence_is_claimed(harness, run["id"])


# ----------------------------------------------------------------------
# C. Remediation bound
# ----------------------------------------------------------------------


def test_c_remediation_is_bounded_and_never_loops_forever(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.REVIEW_BLOCKER)
    run, started = _started_run(harness, changed_areas=[])

    assert started["status"] == "BLOCKED"
    assert started["failure_code"] == "REMEDIATION_BOUND_EXCEEDED"

    persisted = harness.run_by_id(run["id"])
    assert persisted["remediation_cycles_used"] == 3

    remediation = _stage_agent_runs(harness, run["id"], "REMEDIATION")
    assert {agent_run["remediation_cycle"] for agent_run in remediation} == {1, 2, 3}
    assert not [agent_run for agent_run in remediation if agent_run["remediation_cycle"] == 4]

    reviewers = _stage_agent_runs(harness, run["id"], "REVIEW")
    assert not [agent_run for agent_run in reviewers if agent_run["remediation_cycle"] > 3]

    types = _event_types(harness, run["id"])
    assert types.count("remediation.cycle.exhausted") == 1
    assert "verification.started" not in types

    stages = {stage["stage_key"]: stage for stage in harness.stages(run["id"])}
    assert stages["REVIEW"]["status"] == "BLOCKED"
    assert stages["REMEDIATION"]["status"] == "BLOCKED"
    assert harness.completion_gates(run["id"])["complete"] is False

    # A bound-exceeded block is not cleared by reconcile or by a repeat request.
    harness.reconcile_raw(run["id"])
    assert harness.run_by_id(run["id"])["status"] == "BLOCKED"
    assert harness.resume_raw(run["id"]).status_code == 409


# ----------------------------------------------------------------------
# D. Retry
# ----------------------------------------------------------------------


def test_d_retryable_pre_start_failure_creates_a_new_attempt(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.RETRYABLE_START_FAILURE)
    run, started = _started_run(harness, workflow_key="bug-fix", changed_areas=[])

    discovery = _stage_agent_runs(harness, run["id"], "DISCOVERY")
    explorer = sorted(
        [agent_run for agent_run in discovery if agent_run["agent_profile_key"] == "explorer"],
        key=lambda agent_run: agent_run["attempt"],
    )

    assert [agent_run["attempt"] for agent_run in explorer] == [1, 2]
    assert [agent_run["status"] for agent_run in explorer] == ["FAILED", "COMPLETED"]

    # The failed attempt is retained, not overwritten.
    assert explorer[0]["reason_code"] == "EXECUTOR_START_FAILED"
    assert explorer[0]["failure_retryable"] is True
    assert explorer[0]["completed_at"] is not None

    # The retry references the attempt it supersedes.
    assert explorer[1]["retry_of_agent_run_id"] == explorer[0]["id"]
    assert explorer[1]["id"] != explorer[0]["id"]

    # The workflow continued past the retried assignment.
    assert started["status"] == "COMPLETED"

    created = [
        event
        for event in harness.events(run["id"])
        if event["event_type"] == "agent.created" and event["payload"].get("attempt") == 2
    ]
    assert len(created) == 1
    assert created[0]["payload"]["reason_code"] == "RETRYABLE_OPERATIONAL_FAILURE"


def test_d_non_retryable_failure_creates_no_second_attempt(
    harness_factory: HarnessFactory,
) -> None:
    """A failure that may have produced side effects is never repeated."""

    harness = harness_factory(ReferenceScenario.RUN_FAILURE)
    run, started = _started_run(harness, changed_areas=[])

    assert started["status"] == "FAILED"
    assert {agent_run["attempt"] for agent_run in harness.agent_runs(run["id"])} == {1}


# ----------------------------------------------------------------------
# E. Unknown
# ----------------------------------------------------------------------


def test_e_unknown_start_is_never_retried_or_claimed_complete(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.START_UNKNOWN)
    run, started = _started_run(harness, changed_areas=[])

    assert started["status"] == "BLOCKED"
    assert started["failure_code"] == "UNKNOWN_EXECUTION_STATE"
    assert started["status"] != "COMPLETED"

    # No automatic retry: an unprovable start must not be repeated.
    assert {agent_run["attempt"] for agent_run in harness.agent_runs(run["id"])} == {1}
    assert harness.completion_gates(run["id"])["complete"] is False

    # Reconciliation cannot fabricate the truth, so the Run stays blocked.
    harness.reconcile_raw(run["id"])
    assert harness.run_by_id(run["id"])["status"] == "BLOCKED"


def test_e_unknown_result_does_not_become_completion(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.UNKNOWN_RESULT)
    run, started = _started_run(harness, changed_areas=[])

    assert started["status"] == "BLOCKED"
    assert started["status"] != "COMPLETED"
    assert harness.completion_gates(run["id"])["complete"] is False

    for agent_run in harness.agent_runs(run["id"]):
        assert agent_run["result_outcome"] != "SUCCESS"


# ----------------------------------------------------------------------
# F. Failure
# ----------------------------------------------------------------------


def test_f_required_agent_failure_fails_the_run_without_downstream_work(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.RUN_FAILURE)
    run, started = _started_run(harness, changed_areas=[])

    assert started["status"] == "FAILED"
    assert started["failure_code"] == "REQUIRED_STAGE_FAILED"

    failed = [
        agent_run for agent_run in harness.agent_runs(run["id"]) if agent_run["status"] == "FAILED"
    ]
    assert failed
    assert failed[0]["reason_code"] == "EXECUTION_FAILED"

    stages = {stage["stage_key"]: stage for stage in harness.stages(run["id"])}
    assert stages["DISCOVERY"]["status"] == "FAILED"

    # No downstream stage ran, and no completion was claimed.
    assert stages["IMPLEMENTATION"]["status"] == "PENDING"
    assert "verification.started" not in _event_types(harness, run["id"])
    assert harness.completion_gates(run["id"])["complete"] is False


def test_f_verification_failure_prevents_completion(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.VERIFICATION_FAILURE)
    run, started = _started_run(harness, changed_areas=[])

    assert started["status"] == "FAILED"
    assert started["failure_code"] == "VERIFICATION_FAILED"
    assert "verification.failed" in _event_types(harness, run["id"])
    assert harness.completion_gates(run["id"])["complete"] is False

    stages = {stage["stage_key"]: stage for stage in harness.stages(run["id"])}
    assert stages["VERIFICATION"]["status"] == "FAILED"
    assert stages["DOCUMENTATION"]["status"] == "PENDING"


# ----------------------------------------------------------------------
# G. Cancellation confirmed
# ----------------------------------------------------------------------


def test_g_cancel_request_is_not_cancel_confirmation(
    harness_factory: HarnessFactory,
) -> None:
    """An acknowledged request without confirmation never claims CANCELLED."""

    harness = harness_factory(ReferenceScenario.CANCEL_REQUESTED)
    run, _ = _started_run(harness, changed_areas=[])

    body = harness.cancel_raw(run["id"]).json()

    assert body["status"] != "CANCELLED"
    assert body["cancel_requested_at"] is not None

    assert {agent_run["status"] for agent_run in harness.agent_runs(run["id"])} == {"WAITING"}
    assert {agent_run["reason_code"] for agent_run in harness.agent_runs(run["id"])} == {
        "CANCELLATION_REQUESTED_UNCONFIRMED"
    }

    types = _event_types(harness, run["id"])
    assert "run.cancel.requested" in types
    assert "agent.cancel.requested" in types
    assert "run.cancelled" not in types
    assert "agent.cancelled" not in types


def test_g_only_proven_confirmation_yields_cancelled(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.CANCEL_CONFIRMED)
    run, _ = _started_run(harness, changed_areas=[])

    body = harness.cancel_raw(run["id"]).json()

    assert body["status"] == "CANCELLED"
    assert {agent_run["status"] for agent_run in harness.agent_runs(run["id"])} == {"CANCELLED"}

    types = _event_types(harness, run["id"])
    assert "agent.cancelled" in types
    assert types[-1] == "run.cancelled"


# ----------------------------------------------------------------------
# H. Cancellation unknown / unsupported
# ----------------------------------------------------------------------


def test_h_unknown_cancellation_preserves_last_known_truth(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.CANCEL_UNKNOWN)
    run, _ = _started_run(harness, changed_areas=[])

    before = harness.agent_runs(run["id"])
    assert {agent_run["status"] for agent_run in before} == {"RUNNING"}

    body = harness.cancel_raw(run["id"]).json()

    assert body["status"] == "BLOCKED"
    assert body["status"] != "CANCELLED"
    assert body["failure_code"] == "CANCELLATION_UNKNOWN"

    after = harness.agent_runs(run["id"])
    assert {agent_run["status"] for agent_run in after} == {"RUNNING"}
    assert [agent_run["started_at"] for agent_run in after] == [
        agent_run["started_at"] for agent_run in before
    ]

    # Reconciliation is required, and the Run is a recovery candidate.
    candidate = [item for item in harness.recovery_candidates() if item["run_id"] == run["id"]][0]
    assert candidate["reconciliation_required"] is True

    assert harness.completion_gates(run["id"])["complete"] is False


def test_h_unsupported_cancellation_never_calls_cancel_and_never_claims_it(
    harness_factory: HarnessFactory,
) -> None:
    executor = ScriptedExecutor(
        session_status=ExecutionStatus.RUNNING,
        unsupported_capabilities=frozenset({ExecutorCapability.CANCELLATION}),
    )
    harness = harness_factory(registry=registry_for(executor))

    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    assert {agent_run["status"] for agent_run in harness.agent_runs(run["id"])} == {"RUNNING"}
    before = executor.cancel_calls

    body = harness.cancel_raw(run["id"]).json()

    assert executor.cancel_calls == before
    assert body["status"] == "BLOCKED"
    assert body["failure_code"] == "CANCELLATION_UNSUPPORTED"
    assert {agent_run["status"] for agent_run in harness.agent_runs(run["id"])} == {"RUNNING"}

    types = _event_types(harness, run["id"])
    assert "agent.blocked" not in types
    assert "agent.cancelled" not in types
    assert "run.cancelled" not in types

    # The cancellation stays unproven across a repeat request.
    assert harness.cancel_raw(run["id"]).json() == body


def test_h_reconciliation_resolves_an_unproven_cancellation(
    harness_factory: HarnessFactory,
) -> None:
    """Once the executor proves the truth, the AgentRun follows it."""

    executor = ScriptedExecutor(
        session_status=ExecutionStatus.RUNNING,
        unsupported_capabilities=frozenset({ExecutorCapability.CANCELLATION}),
    )
    harness = harness_factory(registry=registry_for(executor))

    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    harness.cancel_raw(run["id"])
    assert {agent_run["status"] for agent_run in harness.agent_runs(run["id"])} == {"RUNNING"}

    for session_id in executor.session_ids():
        executor.complete(session_id)

    harness.reconcile_raw(run["id"])

    proven = harness.agent_runs(run["id"])
    assert {agent_run["status"] for agent_run in proven} == {"COMPLETED"}
    assert {agent_run["reason_code"] for agent_run in proven} == {None}
    assert "agent.completed" in _event_types(harness, run["id"])


# ----------------------------------------------------------------------
# I. Restart
# ----------------------------------------------------------------------


def test_i_restart_preserves_history_and_requires_explicit_reconciliation(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "acceptance-restart.sqlite"
    harness = harness_factory(ReferenceScenario.WAITING, database_path=database_path)

    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    run_before = harness.run_by_id(run["id"])
    agents_before = harness.agent_runs(run["id"])
    stages_before = harness.stages(run["id"])
    events_before = harness.events(run["id"])
    snapshot_before = harness.client.get(f"/api/runs/{run['id']}/snapshot").json()

    # Close the application context by building a new one on the same database.
    reopened = harness_factory(database_path=database_path)

    assert reopened.run_by_id(run["id"]) == run_before
    assert reopened.agent_runs(run["id"]) == agents_before
    assert reopened.stages(run["id"]) == stages_before
    assert reopened.events(run["id"]) == events_before
    assert reopened.client.get(f"/api/runs/{run['id']}/snapshot").json() == snapshot_before

    # Recovery discovery identifies it without performing any execution.
    candidates = [item for item in reopened.recovery_candidates() if item["run_id"] == run["id"]]
    assert len(candidates) == 1
    assert candidates[0]["reconciliation_required"] is True
    assert candidates[0]["classification"] == "RECONCILIATION_REQUIRED"

    adapter = reopened.app.state.executor_registry.default().adapter
    starts_before = adapter.start_calls
    assert reopened.recovery_candidates()
    assert adapter.start_calls == starts_before

    # Explicit reconciliation creates no duplicate AgentRun and starts nothing.
    reconciled = reopened.reconcile_raw(run["id"]).json()
    assert reconciled["status"] == "BLOCKED"
    assert reconciled["failure_code"] == "UNKNOWN_EXECUTION_STATE"
    assert reopened.agent_runs(run["id"]) == agents_before
    assert adapter.start_calls == starts_before

    assert reopened.completion_gates(run["id"])["complete"] is False

    # Unknown stays safely blocked. Resume is permitted for this block reason
    # because the Executor is registered, but resuming cannot fabricate the
    # missing proof: no replacement AgentRun appears, no external work is
    # started, and the Run never claims completion.
    resumed = reopened.resume_raw(run["id"])
    assert resumed.status_code == 200
    assert resumed.json()["status"] != "COMPLETED"
    assert reopened.agent_runs(run["id"]) == agents_before
    assert adapter.start_calls == starts_before
    assert reopened.completion_gates(run["id"])["complete"] is False


def test_i_restart_preserves_a_completed_run_and_its_audit(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "acceptance-restart-complete.sqlite"
    harness = harness_factory(database_path=database_path)

    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"], requested_executor_id=str(uuid4()))
    harness.start_raw(run["id"])
    harness.reconcile_raw(run["id"])

    before = {
        "run": harness.run_by_id(run["id"]),
        "agents": harness.agent_runs(run["id"]),
        "stages": harness.stages(run["id"]),
        "events": harness.events(run["id"]),
        "audit": harness.audit(run["id"]),
    }

    reopened = harness_factory(database_path=database_path)

    assert reopened.run_by_id(run["id"]) == before["run"]
    assert reopened.agent_runs(run["id"]) == before["agents"]
    assert reopened.stages(run["id"]) == before["stages"]
    assert reopened.events(run["id"]) == before["events"]
    assert reopened.audit(run["id"]) == before["audit"]


# ----------------------------------------------------------------------
# J. Duplicate event
# ----------------------------------------------------------------------


def _external_event(
    harness: Harness,
    *,
    run_id: str,
    agent_run_id: str,
    event_type: EventType,
    external_event_id: str,
    payload: tuple[tuple[str, str], ...] = (),
) -> Event:
    """Build a canonical event exactly as an adapter would deliver it.

    Phase 3 exposes no HTTP route for external event ingestion, so this family
    drives the real orchestrator application service directly.
    """

    run = harness.run_by_id(run_id)
    retained, redacted = build_payload(payload)
    now = utc_now()

    return Event(
        id=EventId.new(),
        schema_version=EVENT_SCHEMA_VERSION,
        event_type=event_type,
        project_id=ProjectId.parse(run["project_id"]),
        run_id=RunId.parse(run_id),
        agent_run_id=AgentRunId.parse(agent_run_id),
        source=EventSource.EXECUTOR,
        # The deduplication key is derived from executor identity, session
        # reference, and external id. Without a session reference the event is
        # deliberately never deduplicated by identity.
        source_ref="acceptance-session-000001",
        occurred_at=now,
        recorded_at=now,
        payload=retained,
        redacted_keys=redacted,
        external_event_id=external_event_id,
        executor_id=REFERENCE_EXECUTOR_ID,
        created_at=now,
    )


def test_j_duplicate_executor_event_has_one_logical_effect(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.WAITING)
    run, _ = _started_run(harness, changed_areas=[])

    architect = [a for a in harness.agent_runs(run["id"]) if a["agent_profile_key"] == "architect"][
        0
    ]
    agent_runs_before = harness.agent_runs(run["id"])
    stages_before = harness.stages(run["id"])

    orchestrator = harness.app.state.orchestrator
    original = _external_event(
        harness,
        run_id=run["id"],
        agent_run_id=architect["id"],
        event_type=EventType.AGENT_COMPLETED,
        external_event_id="acceptance-duplicate-1",
        payload=(("summary", "Assignment completed."),),
    )
    duplicate = replace(
        original,
        id=EventId.new(),
        recorded_at=utc_now(),
        created_at=utc_now(),
    )

    first = asyncio.run(orchestrator.apply_external_event(original))
    second = asyncio.run(orchestrator.apply_external_event(duplicate))

    assert (first.persisted, first.duplicate) == (True, False)
    assert (second.persisted, second.duplicate) == (False, True)
    assert second.state_changed is False

    # One logical effect: no duplicate AgentRun, no duplicated stage change.
    assert len(harness.agent_runs(run["id"])) == len(agent_runs_before)
    assert harness.stages(run["id"]) == stages_before

    types = _event_types(harness, run["id"])
    assert types.count("agent.completed") == 1


# ----------------------------------------------------------------------
# K. Late event
# ----------------------------------------------------------------------


def test_k_late_activity_does_not_regress_a_completed_agent_run(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    run, started = _started_run(harness, workflow_key="bug-fix", changed_areas=[])
    assert started["status"] == "COMPLETED"

    completed = [
        agent_run
        for agent_run in harness.agent_runs(run["id"])
        if agent_run["status"] == "COMPLETED"
    ][0]

    orchestrator = harness.app.state.orchestrator
    late = _external_event(
        harness,
        run_id=run["id"],
        agent_run_id=completed["id"],
        event_type=EventType.AGENT_ACTIVITY,
        external_event_id="acceptance-late-activity-1",
        payload=(("activity", "Applying patch"),),
    )

    result = asyncio.run(orchestrator.apply_external_event(late))

    # The late event may be retained for history, but it changes nothing.
    assert result.state_changed is False
    assert result.ignored_for_state_reason is not None

    persisted = [
        agent_run
        for agent_run in harness.agent_runs(run["id"])
        if agent_run["id"] == completed["id"]
    ]
    assert persisted == [completed]
    assert harness.run_by_id(run["id"])["status"] == "COMPLETED"


# ----------------------------------------------------------------------
# L. SSE
# ----------------------------------------------------------------------


def test_l_sse_uses_durable_event_ids_and_resumes_after_them(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    run, _ = _started_run(harness, workflow_key="bug-fix", changed_areas=[])

    events = harness.events(run["id"])
    assert len(events) > 5

    def stream(last_event_id: str | None) -> list[str]:
        headers = {} if last_event_id is None else {"Last-Event-ID": last_event_id}
        response = harness.client.get(
            f"/api/runs/{run['id']}/events/stream",
            params={"follow": "false"},
            headers=headers,
        )

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")

        return [
            line.removeprefix("id: ")
            for line in response.text.splitlines()
            if line.startswith("id: ")
        ]

    # The SSE id is the durable Event id, in durable order.
    ids = stream(None)
    assert ids == [event["id"] for event in events]

    # Reconnecting from an emitted id replays only later durable events.
    resumed = stream(ids[2])
    assert resumed == ids[3:]

    # REST remains authoritative after a reconnect.
    assert harness.run_by_id(run["id"])["status"] == "COMPLETED"
    assert [event["id"] for event in harness.events(run["id"])] == ids


# ----------------------------------------------------------------------
# M. Audit
# ----------------------------------------------------------------------


def test_m_manual_interventions_are_audited_separately_from_events(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()

    # cancel
    cancel_project = harness.register_project("Audit Cancel")
    cancel_task = harness.create_task(cancel_project["id"])
    cancel_run = harness.create_run(cancel_task["id"], requested_executor_id=str(uuid4()))
    harness.start_raw(cancel_run["id"])
    harness.cancel_raw(cancel_run["id"])

    # reconcile
    reconcile_project = harness.register_project("Audit Reconcile")
    reconcile_task = harness.create_task(reconcile_project["id"])
    reconcile_run = harness.create_run(reconcile_task["id"], requested_executor_id=str(uuid4()))
    harness.start_raw(reconcile_run["id"])
    harness.reconcile_raw(reconcile_run["id"])

    # resume
    resume_project = harness.register_project("Audit Resume")
    resume_task = harness.create_task(resume_project["id"])
    resume_run = harness.create_run(resume_task["id"], requested_executor_id=str(uuid4()))
    harness.start_raw(resume_run["id"])
    harness.resume_raw(resume_run["id"], executor_id=str(REFERENCE_EXECUTOR_ID), changed_areas=[])

    expected = {
        cancel_run["id"]: ["RUN_CANCELLATION_REQUESTED"],
        reconcile_run["id"]: ["RUN_RECONCILIATION_REQUESTED"],
        resume_run["id"]: ["RUN_EXECUTOR_SELECTED", "RUN_RESUME_REQUESTED"],
    }

    expected_events = {
        cancel_run["id"]: "run.cancel.requested",
        reconcile_run["id"]: "run.blocked",
        resume_run["id"]: "run.resumed",
    }

    for run_id, actions in expected.items():
        records = harness.audit(run_id)
        assert [record["action"] for record in records] == actions

        # Audit is separate from the operational event history: an audit action
        # name is never an event type, and vice versa.
        event_types = _event_types(harness, run_id)
        assert not set(actions) & set(event_types)
        assert expected_events[run_id] in event_types
