"""Phase 3B: Phase-3 verification orchestration semantics.

Phase 3 verification proves orchestration only. It never executes repository
commands, never creates Evidence, and never claims that tests passed.
"""

from __future__ import annotations

from conftest import Harness, HarnessFactory

from agent_office.infrastructure.executors import ReferenceScenario


def _verification_runs(harness: Harness, run_id: str) -> list[dict]:
    return [
        agent_run
        for agent_run in harness.agent_runs(run_id)
        if agent_run["stage_key"] == "VERIFICATION"
    ]


def test_verification_is_a_separate_durable_assignment(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] == "COMPLETED"

    verification_runs = _verification_runs(harness, run["id"])

    assert len(verification_runs) == 1
    assert verification_runs[0]["agent_profile_key"] == "verifier"
    assert verification_runs[0]["status"] == "COMPLETED"
    assert verification_runs[0]["id"] not in {
        agent_run["id"]
        for agent_run in harness.agent_runs(run["id"])
        if agent_run["stage_key"] == "REVIEW"
    }

    verification = harness.stage(run["id"], "VERIFICATION")
    assert verification["status"] == "COMPLETED"
    assert verification["started_at"] is not None


def test_remediation_flow_reaches_verification(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.REMEDIATION_SUCCESS)
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] == "COMPLETED"

    event_types = [event["event_type"] for event in harness.events(run["id"])]

    # Verification happens after remediation is resolved, not before.
    assert "verification.started" in event_types
    assert "verification.completed" in event_types
    assert event_types.index("remediation.completed") < event_types.index("verification.started")


def test_verification_failure_prevents_run_completion(
    harness_factory: HarnessFactory,
) -> None:
    """Scenario 8: a failing verification never yields a completed Run."""

    harness = harness_factory(ReferenceScenario.VERIFICATION_FAILURE)
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] == "FAILED"
    assert started["status"] != "COMPLETED"
    assert started["failure_code"] == "VERIFICATION_FAILED"

    verification = harness.stage(run["id"], "VERIFICATION")
    assert verification["status"] == "FAILED"
    assert verification["reason_code"] == "VERIFICATION_FAILED"

    assert {agent_run["status"] for agent_run in _verification_runs(harness, run["id"])} == {
        "FAILED"
    }

    assert "verification.failed" in [event["event_type"] for event in harness.events(run["id"])]

    # The downstream documentation stage never ran.
    assert harness.stage(run["id"], "DOCUMENTATION")["status"] == "PENDING"

    gates = harness.completion_gates(run["id"])
    assert gates["complete"] is False
    assert "VERIFICATION_FAILED" in gates["failures"]


def test_verification_success_permits_completion_only_when_all_gates_pass(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    run, started = harness.start_workflow("bug-fix", changed_areas=["UI"])

    assert started["status"] == "COMPLETED"

    gates = harness.completion_gates(run["id"])
    assert gates["complete"] is True
    assert gates["failures"] == []

    stages = {stage["stage_key"]: stage["status"] for stage in harness.stages(run["id"])}
    assert stages == {
        "DISCOVERY": "COMPLETED",
        "IMPLEMENTATION": "COMPLETED",
        "REVIEW": "COMPLETED",
        "REMEDIATION": "SKIPPED",
        "VERIFICATION": "COMPLETED",
        "DOCUMENTATION": "COMPLETED",
    }


def test_verification_makes_no_test_claim(
    harness_factory: HarnessFactory,
) -> None:
    """No test-result claim is fabricated anywhere.

    A verification stage that ran no command records no test result. The only
    evidence Phase 4B records here is the Git-derived change summary taken at the
    review handoff, which asserts nothing about testing.
    """

    harness = harness_factory()
    run, _ = harness.start_workflow("bug-fix", changed_areas=[])

    events = harness.events(run["id"], limit=200)
    event_types = [event["event_type"] for event in events]

    assert not [event for event in event_types if event.startswith("test.")]
    assert not [event for event in event_types if event.startswith("command.")]

    evidence_events = [event for event in events if event["event_type"] == "evidence.created"]
    assert {event["payload"]["kind"] for event in evidence_events} == {"DIFF_SUMMARY"}

    body = harness.client.get(f"/api/runs/{run['id']}/agents").text
    for forbidden in ("tests_passed", "evidence_id", "exit_status", "command"):
        assert forbidden not in body

    summary = _verification_runs(harness, run["id"])[0]["result_summary"]
    assert "test" not in str(summary).lower()
    assert "evidence" not in str(summary).lower()


def test_verification_stage_is_required_by_the_built_in_workflows(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()

    for key in ("enterprise-engineering", "bug-fix"):
        workflow = harness.workflow_by_key(key)
        verification = next(stage for stage in workflow["stages"] if stage["key"] == "VERIFICATION")

        assert verification["required"] is True
        assert [assignment["profile_key"] for assignment in verification["assignments"]] == [
            "verifier"
        ]
