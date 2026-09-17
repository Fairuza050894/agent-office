"""Phase 3B: lifecycle events and duplicate-processing safety.

Every new lifecycle transition uses the existing canonical taxonomy. Duplicate
processing produces one logical effect, and no Finding or Evidence event is ever
fabricated.
"""

from __future__ import annotations

from conftest import Harness, HarnessFactory, ScriptedExecutor, registry_for

from agent_office.domain import CancellationOutcome, ExecutionStatus
from agent_office.infrastructure.executors import ReferenceScenario


def _event_types(harness: Harness, run_id: str) -> list[str]:
    return [event["event_type"] for event in harness.events(run_id)]


def test_retry_creation_is_recorded_with_attempt_metadata(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.RETRYABLE_START_FAILURE)
    run, _ = harness.start_workflow("bug-fix", changed_areas=[])

    created = [
        event
        for event in harness.events(run["id"])
        if event["event_type"] == "agent.created" and event["payload"].get("attempt") == 2
    ]

    assert len(created) == 1
    assert created[0]["payload"]["retry_of_agent_run_id"]
    assert created[0]["payload"]["reason_code"] == "RETRYABLE_OPERATIONAL_FAILURE"


def test_resume_emits_a_canonical_run_resumed_event(
    harness_factory: HarnessFactory,
) -> None:
    from uuid import uuid4

    from agent_office.infrastructure.executors import REFERENCE_EXECUTOR_ID

    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"], requested_executor_id=str(uuid4()))
    harness.start_raw(run["id"])

    harness.resume_raw(run["id"], executor_id=str(REFERENCE_EXECUTOR_ID), changed_areas=[])

    resumed = [event for event in harness.events(run["id"]) if event["event_type"] == "run.resumed"]

    assert len(resumed) == 1
    assert resumed[0]["payload"]["resolved_executor_id"] == str(REFERENCE_EXECUTOR_ID)


def test_remediation_events_use_the_canonical_taxonomy(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.REMEDIATION_SUCCESS)
    run, _ = harness.start_workflow("bug-fix", changed_areas=[])

    event_types = _event_types(harness, run["id"])

    assert "remediation.started" in event_types
    assert "remediation.completed" in event_types
    assert "verification.started" in event_types
    assert "verification.completed" in event_types


def test_remediation_bound_event_is_emitted_once(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.REVIEW_BLOCKER)
    run, _ = harness.start_workflow("bug-fix", changed_areas=[])

    exhausted = [
        event
        for event in harness.events(run["id"])
        if event["event_type"] == "remediation.cycle.exhausted"
    ]

    assert len(exhausted) == 1
    assert exhausted[0]["payload"]["remediation_cycles_used"] == 3


def test_no_finding_or_evidence_events_are_fabricated(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.REMEDIATION_SUCCESS)
    run, _ = harness.start_workflow("bug-fix", changed_areas=[])

    event_types = _event_types(harness, run["id"])

    assert not [name for name in event_types if name.startswith("review.finding")]
    assert not [name for name in event_types if name.startswith("evidence")]
    assert not [name for name in event_types if name.startswith("test.")]


def test_duplicate_reconcile_produces_one_logical_effect(
    harness_factory: HarnessFactory,
) -> None:
    """Scenario 10: repeated lifecycle processing changes nothing twice."""

    harness = harness_factory(ReferenceScenario.WAITING)
    run, _ = harness.start_workflow("bug-fix", changed_areas=[])

    first = harness.reconcile_raw(run["id"]).json()
    agent_runs_after_first = harness.agent_runs(run["id"])
    stages_after_first = harness.stages(run["id"])
    reconciliations_after_first = [
        event
        for event in harness.events(run["id"])
        if event["event_type"] == "executor.session.reconciled"
    ]
    other_events_after_first = [
        event["event_type"]
        for event in harness.events(run["id"])
        if event["event_type"] != "executor.session.reconciled"
    ]

    for _ in range(3):
        assert harness.reconcile_raw(run["id"]).json() == first

    assert harness.agent_runs(run["id"]) == agent_runs_after_first
    assert harness.stages(run["id"]) == stages_after_first

    # Each explicit request records its own reconciliation observation, but no
    # workflow effect is duplicated: the AgentRuns and stages are byte-identical
    # and no additional state-change event was produced.
    reconciliations_after = [
        event
        for event in harness.events(run["id"])
        if event["event_type"] == "executor.session.reconciled"
    ]
    other_events_after = [
        event["event_type"]
        for event in harness.events(run["id"])
        if event["event_type"] != "executor.session.reconciled"
    ]

    assert len(reconciliations_after) > len(reconciliations_after_first)
    assert other_events_after == other_events_after_first


def test_duplicate_cancellation_produces_one_logical_effect(
    harness_factory: HarnessFactory,
) -> None:
    executor = ScriptedExecutor(
        session_status=ExecutionStatus.RUNNING,
        cancel_outcome=CancellationOutcome.UNKNOWN,
    )
    harness = harness_factory(registry=registry_for(executor))

    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    first = harness.cancel_raw(run["id"]).json()
    agent_runs_after_first = harness.agent_runs(run["id"])
    cancel_calls_after_first = executor.cancel_calls

    second = harness.cancel_raw(run["id"]).json()
    third = harness.cancel_raw(run["id"]).json()

    assert second == first == third
    assert harness.agent_runs(run["id"]) == agent_runs_after_first
    assert executor.cancel_calls == cancel_calls_after_first


def test_lifecycle_events_survive_restart(
    harness_factory: HarnessFactory,
    tmp_path,
) -> None:
    database_path = tmp_path / "lifecycle-events.sqlite"
    harness = harness_factory(
        ReferenceScenario.REMEDIATION_SUCCESS,
        database_path=database_path,
    )
    run, _ = harness.start_workflow("bug-fix", changed_areas=[])

    events_before = harness.events(run["id"])

    reopened = harness_factory(database_path=database_path)

    assert reopened.events(run["id"]) == events_before
    assert "remediation.started" in _event_types(reopened, run["id"])


def test_events_keep_project_and_run_ownership(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.REMEDIATION_SUCCESS)
    run, _ = harness.start_workflow("bug-fix", changed_areas=[])

    run_body = harness.run_by_id(run["id"])

    for event in harness.events(run["id"]):
        assert event["run_id"] == run["id"]
        assert event["project_id"] == run_body["project_id"]
        assert event["schema_version"] == 1


def test_event_payloads_remain_bounded_and_safe(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.REVIEW_BLOCKER)
    run, _ = harness.start_workflow("bug-fix", changed_areas=[])

    body = harness.client.get(f"/api/runs/{run['id']}/events").text

    for forbidden in ("dedupe_key", "executor_session", "Traceback", str(harness.tmp_path)):
        assert forbidden not in body
