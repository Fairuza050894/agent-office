"""Phase 3A hardening: bounded concurrency for read-only fan-out.

A stage that declares PARALLEL_ALLOWED and whose every assignment is read-only
may genuinely overlap. Write-capable assignments must stay sequential, because
Phase 3A has no workspace isolation yet.
"""

from __future__ import annotations

from typing import Any

from conftest import Harness, HarnessFactory, ScriptedExecutor, registry_for


def _workflow(harness: Harness, *, key: str, assignments: list[dict[str, Any]], mode: str) -> str:
    response = harness.client.post(
        "/api/workflows",
        json={
            "key": key,
            "name": key.title(),
            "stages": [
                {
                    "key": "DISCOVERY",
                    "name": "Discovery",
                    "order_hint": 0,
                    "execution_mode": mode,
                    "assignments": assignments,
                }
            ],
        },
    )
    assert response.status_code == 201, response.text

    return response.json()["id"]


def _run_workflow(harness: Harness, workflow_id: str) -> dict[str, Any]:
    project = harness.register_project()
    task = harness.create_task(project["id"], requested_workflow_id=workflow_id)
    run = harness.create_run(task["id"])

    return harness.start_run(run["id"])


def test_parallel_allowed_read_only_assignments_overlap_execution(
    harness_factory: HarnessFactory,
) -> None:
    executor = ScriptedExecutor(yield_on_start=True)
    harness = harness_factory(registry=registry_for(executor))

    workflow_id = _workflow(
        harness,
        key="parallel-read-only-flow",
        mode="PARALLEL_ALLOWED",
        assignments=[
            {"profile_key": "architect", "access_mode": "READ_ONLY"},
            {"profile_key": "explorer", "access_mode": "READ_ONLY"},
        ],
    )

    started = _run_workflow(harness, workflow_id)

    assert started["status"] == "COMPLETED"
    assert executor.start_calls == 2

    # Both read-only assignments were simultaneously in flight inside start().
    assert executor.max_concurrent_starts == 2

    assert len(harness.agent_runs(str(started["id"]))) == 2


def test_sequential_stage_does_not_overlap_execution(
    harness_factory: HarnessFactory,
) -> None:
    executor = ScriptedExecutor(yield_on_start=True)
    harness = harness_factory(registry=registry_for(executor))

    workflow_id = _workflow(
        harness,
        key="sequential-read-only-flow",
        mode="SEQUENTIAL",
        assignments=[
            {"profile_key": "architect", "access_mode": "READ_ONLY"},
            {"profile_key": "explorer", "access_mode": "READ_ONLY"},
        ],
    )

    started = _run_workflow(harness, workflow_id)

    assert started["status"] == "COMPLETED"
    assert executor.start_calls == 2
    assert executor.max_concurrent_starts == 1


def test_parallel_allowed_write_assignments_stay_sequential(
    harness_factory: HarnessFactory,
) -> None:
    """Without workspace isolation, write-capable work must not overlap."""

    executor = ScriptedExecutor(yield_on_start=True)
    harness = harness_factory(registry=registry_for(executor))

    workflow_id = _workflow(
        harness,
        key="parallel-write-flow",
        mode="PARALLEL_ALLOWED",
        assignments=[
            {"profile_key": "backend-developer", "access_mode": "WRITE"},
            {"profile_key": "frontend-developer", "access_mode": "WRITE"},
        ],
    )

    started = _run_workflow(harness, workflow_id)

    assert started["status"] == "COMPLETED"
    assert executor.start_calls == 2
    assert executor.max_concurrent_starts == 1


def test_parallel_allowed_mixed_access_modes_stay_sequential(
    harness_factory: HarnessFactory,
) -> None:
    executor = ScriptedExecutor(yield_on_start=True)
    harness = harness_factory(registry=registry_for(executor))

    workflow_id = _workflow(
        harness,
        key="parallel-mixed-flow",
        mode="PARALLEL_ALLOWED",
        assignments=[
            {"profile_key": "architect", "access_mode": "READ_ONLY"},
            {"profile_key": "backend-developer", "access_mode": "BOUNDED_WRITE"},
        ],
    )

    started = _run_workflow(harness, workflow_id)

    assert started["status"] == "COMPLETED"
    assert executor.max_concurrent_starts == 1


def test_concurrent_fan_out_keeps_one_durable_agent_run_per_assignment(
    harness_factory: HarnessFactory,
) -> None:
    executor = ScriptedExecutor(yield_on_start=True)
    harness = harness_factory(registry=registry_for(executor))

    workflow_id = _workflow(
        harness,
        key="parallel-durable-flow",
        mode="PARALLEL_ALLOWED",
        assignments=[
            {"profile_key": "architect", "access_mode": "READ_ONLY"},
            {"profile_key": "explorer", "access_mode": "READ_ONLY"},
        ],
    )

    started = _run_workflow(harness, workflow_id)
    agent_runs = harness.agent_runs(str(started["id"]))

    assert {agent_run["agent_profile_key"] for agent_run in agent_runs} == {
        "architect",
        "explorer",
    }
    assert len({agent_run["id"] for agent_run in agent_runs}) == 2
    assert {agent_run["stage_key"] for agent_run in agent_runs} == {"DISCOVERY"}
    assert {agent_run["status"] for agent_run in agent_runs} == {"COMPLETED"}

    created = [
        event
        for event in harness.events(str(started["id"]))
        if event["event_type"] == "agent.created"
    ]
    assert len(created) == 2

    # Exactly one stage transition even when assignments overlap.
    completed = [
        event
        for event in harness.events(str(started["id"]))
        if event["event_type"] == "stage.completed"
    ]
    assert len(completed) == 1


def test_concurrent_fan_out_waits_for_all_required_assignments(
    harness_factory: HarnessFactory,
) -> None:
    """The stage must not complete until every required assignment finished."""

    executor = ScriptedExecutor(yield_on_start=True)
    harness = harness_factory(registry=registry_for(executor))

    workflow_id = _workflow(
        harness,
        key="parallel-wait-flow",
        mode="PARALLEL_ALLOWED",
        assignments=[
            {"profile_key": "architect", "access_mode": "READ_ONLY"},
            {"profile_key": "explorer", "access_mode": "READ_ONLY"},
        ],
    )

    started = _run_workflow(harness, workflow_id)

    completed = [
        event
        for event in harness.events(str(started["id"]))
        if event["event_type"] == "stage.completed"
    ]
    completions_in_events = [
        event
        for event in harness.events(str(started["id"]))
        if event["event_type"] == "agent.completed"
    ]

    assert len(completions_in_events) == 2
    assert len(completed) == 1

    # The stage completion event follows both assignment completions.
    event_types = [event["event_type"] for event in harness.events(str(started["id"]))]
    assert event_types.index("stage.completed") > event_types.index("agent.completed")
