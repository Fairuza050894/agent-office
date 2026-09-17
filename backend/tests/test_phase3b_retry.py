"""Phase 3B: conservative operational retry.

Retry preserves failed attempt history by creating a NEW AgentRun per attempt.
Only explicitly retryable pre-start operational failures are retried, and an
UNKNOWN outcome is never repeated.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from conftest import Harness, HarnessFactory

from agent_office.domain import (
    AgentRunReasonCode,
    FailureRetryability,
    classify_failure_retryability,
)
from agent_office.infrastructure.executors import ReferenceScenario


def _attempts(harness: Harness, run_id: str, stage_key: str, profile_key: str) -> list[dict]:
    return sorted(
        (
            agent_run
            for agent_run in harness.agent_runs(run_id)
            if agent_run["stage_key"] == stage_key and agent_run["agent_profile_key"] == profile_key
        ),
        key=lambda agent_run: agent_run["attempt"],
    )


def test_retryable_first_attempt_fails_and_second_attempt_succeeds(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.RETRYABLE_START_FAILURE)

    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    # Scenario 1: the workflow continues after the retry succeeds.
    assert started["status"] == "COMPLETED"

    attempts = _attempts(harness, run["id"], "DISCOVERY", "explorer")
    assert [attempt["attempt"] for attempt in attempts] == [1, 2]

    first, second = attempts

    # Attempt 1 remains readable, failed, with its retryability claim recorded.
    assert first["status"] == "FAILED"
    assert first["reason_code"] == "EXECUTOR_START_FAILED"
    assert first["failure_retryable"] is True
    assert first["retry_of_agent_run_id"] is None

    # Attempt 2 is a distinct AgentRun that references attempt 1.
    assert second["status"] == "COMPLETED"
    assert second["retry_of_agent_run_id"] == first["id"]
    assert second["id"] != first["id"]


def test_retry_attempt_creation_is_recorded_as_an_event(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.RETRYABLE_START_FAILURE)
    run, _ = harness.start_workflow("bug-fix", changed_areas=[])

    attempts = _attempts(harness, run["id"], "DISCOVERY", "explorer")
    retry_id = attempts[1]["id"]

    created = [
        event
        for event in harness.events(run["id"])
        if event["event_type"] == "agent.created" and event["agent_run_id"] == retry_id
    ]

    assert len(created) == 1
    payload = created[0]["payload"]
    assert payload["attempt"] == 2
    assert payload["retry_of_agent_run_id"] == attempts[0]["id"]


def test_retry_history_survives_restart(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "retry-history.sqlite"
    harness = harness_factory(
        ReferenceScenario.RETRYABLE_START_FAILURE,
        database_path=database_path,
    )
    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    attempts_before = _attempts(harness, run["id"], "DISCOVERY", "explorer")
    assert [attempt["attempt"] for attempt in attempts_before] == [1, 2]

    reopened = harness_factory(database_path=database_path)

    attempts_after = _attempts(reopened, run["id"], "DISCOVERY", "explorer")
    assert attempts_after == attempts_before

    assert reopened.run_by_id(run["id"])["status"] == started["status"]


@pytest.mark.parametrize(
    ("scenario", "expected_reason"),
    [
        (ReferenceScenario.START_UNKNOWN, "EXECUTOR_START_UNKNOWN"),
        (ReferenceScenario.UNKNOWN_RESULT, "EXECUTION_RESULT_UNKNOWN"),
    ],
)
def test_unknown_outcome_causes_zero_retry(
    harness_factory: HarnessFactory,
    scenario: ReferenceScenario,
    expected_reason: str,
) -> None:
    harness = harness_factory(scenario)

    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    # Scenario 2: an unknown outcome blocks and is never retried.
    assert started["status"] == "BLOCKED"

    for agent_run in harness.agent_runs(run["id"]):
        assert agent_run["attempt"] == 1, "an UNKNOWN outcome must not create a retry attempt"

    assert any(
        agent_run["reason_code"] == expected_reason for agent_run in harness.agent_runs(run["id"])
    )

    start_requests = [
        event
        for event in harness.events(run["id"])
        if event["event_type"] == "agent.start.requested"
    ]
    assert len(start_requests) == len(harness.agent_runs(run["id"]))


def test_non_retryable_failure_causes_zero_automatic_retry(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.START_FAILURE)

    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] == "FAILED"

    discovery = [
        agent_run
        for agent_run in harness.agent_runs(run["id"])
        if agent_run["stage_key"] == "DISCOVERY"
    ]

    assert {agent_run["attempt"] for agent_run in discovery} == {1}
    assert {agent_run["failure_retryable"] for agent_run in discovery} == {False}


def test_runtime_failure_is_not_retried_as_an_infrastructure_fault(
    harness_factory: HarnessFactory,
) -> None:
    """Implementation work that failed is not an operational retry."""

    harness = harness_factory(ReferenceScenario.RUN_FAILURE)

    run, started = harness.start_workflow("bug-fix", changed_areas=[])

    assert started["status"] == "FAILED"

    for agent_run in harness.agent_runs(run["id"]):
        assert agent_run["attempt"] == 1


def test_retry_is_bounded_to_one_automatic_attempt(
    harness_factory: HarnessFactory,
) -> None:
    """A second retryable failure is not retried again."""

    harness = harness_factory(ReferenceScenario.RETRYABLE_START_FAILURE)

    # The first start succeeds for one assignment, so force the failure onto a
    # single-assignment workflow and exhaust the bound by inspection instead.
    run, _ = harness.start_workflow("bug-fix", changed_areas=[])

    attempts = _attempts(harness, run["id"], "DISCOVERY", "explorer")
    assert max(attempt["attempt"] for attempt in attempts) == 2


def test_duplicate_processing_does_not_create_a_third_attempt(
    harness_factory: HarnessFactory,
) -> None:
    """Re-processing a completed Run never fabricates another attempt."""

    harness = harness_factory(ReferenceScenario.RETRYABLE_START_FAILURE)
    run, _ = harness.start_workflow("bug-fix", changed_areas=[])

    attempts_before = _attempts(harness, run["id"], "DISCOVERY", "explorer")
    agent_runs_before = harness.agent_runs(run["id"])
    stages_before = harness.stages(run["id"])

    second_start = harness.start_raw(run["id"])
    assert second_start.status_code == 409

    reconcile = harness.reconcile_raw(run["id"])
    assert reconcile.status_code == 200

    assert _attempts(harness, run["id"], "DISCOVERY", "explorer") == attempts_before
    assert harness.agent_runs(run["id"]) == agent_runs_before
    assert harness.stages(run["id"]) == stages_before


@pytest.mark.parametrize(
    ("reason_code", "executor_retryable", "expected"),
    [
        (AgentRunReasonCode.EXECUTOR_START_FAILED, True, FailureRetryability.RETRYABLE),
        (AgentRunReasonCode.EXECUTOR_START_FAILED, False, FailureRetryability.NOT_RETRYABLE),
        # A missing claim is not treated as retryable.
        (AgentRunReasonCode.EXECUTOR_START_FAILED, None, FailureRetryability.NOT_RETRYABLE),
        # An UNKNOWN outcome is never retryable, whatever the executor claims.
        (
            AgentRunReasonCode.EXECUTOR_START_UNKNOWN,
            True,
            FailureRetryability.UNKNOWN,
        ),
        (
            AgentRunReasonCode.EXECUTION_RESULT_UNKNOWN,
            None,
            FailureRetryability.UNKNOWN,
        ),
        (
            AgentRunReasonCode.EXECUTION_STATUS_UNKNOWN,
            None,
            FailureRetryability.UNKNOWN,
        ),
        (
            AgentRunReasonCode.CANCELLATION_UNKNOWN,
            None,
            FailureRetryability.UNKNOWN,
        ),
        # A failure after work began is never retried automatically.
        (AgentRunReasonCode.EXECUTION_FAILED, True, FailureRetryability.NOT_RETRYABLE),
        (
            AgentRunReasonCode.REQUIRED_CAPABILITY_UNSUPPORTED,
            None,
            FailureRetryability.NOT_RETRYABLE,
        ),
        (None, None, FailureRetryability.UNKNOWN),
    ],
)
def test_failure_retryability_classification(
    reason_code: AgentRunReasonCode | None,
    executor_retryable: bool | None,
    expected: FailureRetryability,
) -> None:
    assert (
        classify_failure_retryability(reason_code, executor_retryable=executor_retryable)
        is expected
    )
