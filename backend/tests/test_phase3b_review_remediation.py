"""Phase 3B: review blocker and bounded remediation orchestration.

A reviewer that reports a blocker completed successfully. The reviewer's
AgentRun is never marked FAILED for reporting a blocker, and the remediation
loop is bounded so no autonomous cycle beyond the configured maximum ever runs.
"""

from __future__ import annotations

from pathlib import Path

from conftest import Harness, HarnessFactory

from agent_office.infrastructure.executors import ReferenceScenario


def _review_cycle_runs(harness: Harness, run_id: str, cycle: int) -> list[dict]:
    return [
        agent_run
        for agent_run in harness.agent_runs(run_id)
        if agent_run["stage_key"] == "REVIEW" and agent_run["remediation_cycle"] == cycle
    ]


def _remediation_cycles(harness: Harness, run_id: str) -> list[int]:
    return sorted(
        agent_run["remediation_cycle"]
        for agent_run in harness.agent_runs(run_id)
        if agent_run["stage_key"] == "REMEDIATION"
    )


def test_clear_review_completes_and_skips_remediation(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] == "COMPLETED"
    assert started["remediation_cycles_used"] == 0

    remediation = harness.stage(run["id"], "REMEDIATION")
    assert remediation["status"] == "SKIPPED"
    assert remediation["reason_code"] == "NOT_APPLICABLE"
    assert remediation["started_at"] is None

    assert _remediation_cycles(harness, run["id"]) == []


def test_review_blocker_starts_bounded_remediation_until_exhausted(
    harness_factory: HarnessFactory,
) -> None:
    """Scenario 7: repeated blockers reach the bound and stop autonomously."""

    harness = harness_factory(ReferenceScenario.REVIEW_BLOCKER)

    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] == "BLOCKED"
    assert started["failure_code"] == "REMEDIATION_BOUND_EXCEEDED"
    assert started["remediation_cycles_used"] == 3

    # Exactly three remediation cycles ran; a fourth never started.
    assert _remediation_cycles(harness, run["id"]) == [1, 2, 3]

    review = harness.stage(run["id"], "REVIEW")
    remediation = harness.stage(run["id"], "REMEDIATION")

    assert review["status"] == "BLOCKED"
    assert review["reason_code"] == "REMEDIATION_BOUND_EXCEEDED"
    assert remediation["status"] == "BLOCKED"

    event_types = [event["event_type"] for event in harness.events(run["id"])]
    assert "remediation.cycle.exhausted" in event_types
    assert "remediation.started" in event_types

    exhausted = [
        event
        for event in harness.events(run["id"])
        if event["event_type"] == "remediation.cycle.exhausted"
    ]
    assert exhausted[0]["payload"]["max_remediation_cycles"] == 3


def test_blocker_is_not_an_operational_failure(
    harness_factory: HarnessFactory,
) -> None:
    """A reviewer reporting a blocker completed successfully, not as FAILED."""

    harness = harness_factory(ReferenceScenario.REVIEW_BLOCKER)
    run, _ = harness.start_workflow("bug-fix", changed_areas=[])

    blocking = [
        agent_run
        for agent_run in harness.agent_runs(run["id"])
        if agent_run["review_verdict"] == "BLOCKER"
    ]

    assert blocking
    assert {agent_run["status"] for agent_run in blocking} == {"COMPLETED"}
    assert {agent_run["reason_code"] for agent_run in blocking} == {None}
    assert {agent_run["result_outcome"] for agent_run in blocking} == {"SUCCESS"}


def test_remediation_success_rereview_clear_and_continues(
    harness_factory: HarnessFactory,
) -> None:
    """Scenario 6: blocker, remediation, clear re-review, verification."""

    harness = harness_factory(ReferenceScenario.REMEDIATION_SUCCESS)

    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] == "COMPLETED"
    assert started["remediation_cycles_used"] == 1

    # The initial review reported a blocker; the re-review came back clear.
    initial_verdicts = {
        agent_run["review_verdict"] for agent_run in _review_cycle_runs(harness, run["id"], 0)
    }
    rereview_verdicts = {
        agent_run["review_verdict"] for agent_run in _review_cycle_runs(harness, run["id"], 1)
    }

    assert initial_verdicts == {"BLOCKER"}
    assert rereview_verdicts == {"CLEAR"}

    assert _remediation_cycles(harness, run["id"]) == [1]

    remediation = harness.stage(run["id"], "REMEDIATION")
    assert remediation["status"] == "COMPLETED"

    review = harness.stage(run["id"], "REVIEW")
    assert review["status"] == "COMPLETED"

    event_types = [event["event_type"] for event in harness.events(run["id"])]
    assert "remediation.started" in event_types
    assert "remediation.completed" in event_types
    assert "verification.completed" in event_types


def test_remediation_failure_ends_the_run_truthfully(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.REMEDIATION_FAILURE)

    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] == "FAILED"
    assert started["failure_code"] == "REMEDIATION_FAILED"

    remediation = harness.stage(run["id"], "REMEDIATION")
    assert remediation["status"] == "FAILED"
    assert remediation["reason_code"] == "REMEDIATION_FAILED"

    failed = [
        agent_run
        for agent_run in harness.agent_runs(run["id"])
        if agent_run["stage_key"] == "REMEDIATION"
    ]
    assert {agent_run["status"] for agent_run in failed} == {"FAILED"}

    assert "remediation.failed" in [event["event_type"] for event in harness.events(run["id"])]

    # A failed remediation is implementation failure, not infrastructure, so it
    # is never retried automatically.
    assert {agent_run["attempt"] for agent_run in failed} == {1}


def test_remediation_cycles_are_durable_across_restart(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "remediation.sqlite"
    harness = harness_factory(
        ReferenceScenario.REMEDIATION_SUCCESS,
        database_path=database_path,
    )
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    agent_runs_before = harness.agent_runs(run["id"])
    stages_before = harness.stages(run["id"])

    reopened = harness_factory(database_path=database_path)

    assert reopened.run_by_id(run["id"]) == started
    assert reopened.agent_runs(run["id"]) == agent_runs_before
    assert reopened.stages(run["id"]) == stages_before

    assert reopened.run_by_id(run["id"])["remediation_cycles_used"] == 1
    assert _remediation_cycles(reopened, run["id"]) == [1]


def test_exhausted_remediation_blocks_and_does_not_run_again(
    harness_factory: HarnessFactory,
) -> None:
    """The exhausting Run never starts a fourth remedy, even when re-driven."""

    harness = harness_factory(ReferenceScenario.REVIEW_BLOCKER)
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["remediation_cycles_used"] == 3
    cycles_before = _remediation_cycles(harness, run["id"])
    agent_runs_before = harness.agent_runs(run["id"])

    # Re-driving the orchestrator must not start cycle 4.
    harness.reconcile_raw(run["id"])
    harness.resume_raw(run["id"])

    assert _remediation_cycles(harness, run["id"]) == cycles_before == [1, 2, 3]
    assert harness.agent_runs(run["id"]) == agent_runs_before
    assert harness.run_by_id(run["id"])["status"] == "BLOCKED"


def test_completed_review_stage_is_never_reopened(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.REMEDIATION_SUCCESS)
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    review = harness.stage(run["id"], "REVIEW")
    assert review["status"] == "COMPLETED"
    assert review["completed_at"] is not None

    review_events = [
        event
        for event in harness.events(run["id"])
        if event["event_type"] == "stage.completed" and event["payload"]["stage_key"] == "REVIEW"
    ]
    assert len(review_events) == 1

    # The re-review ran as additional AgentRuns within the still-open stage,
    # never by reverting the terminal stage.
    assert len(_review_cycle_runs(harness, run["id"], 0)) == 2
    assert len(_review_cycle_runs(harness, run["id"], 1)) == 2

    assert started["status"] == "COMPLETED"
