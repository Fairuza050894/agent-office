"""Phase 3A hardening: stage reconciliation after external AgentRun events.

An externally delivered AgentRun event can change an AgentRun that an owning
stage is waiting on. The stage must be re-evaluated from factual AgentRun state
so downstream stages can become eligible, without duplicating work and without
regressing terminal state.
"""

from __future__ import annotations

import asyncio
from dataclasses import replace
from typing import Any

from conftest import Harness, HarnessFactory

from agent_office.domain import (
    EVENT_SCHEMA_VERSION,
    AgentRunId,
    Event,
    EventId,
    EventSource,
    EventType,
    ExecutorId,
    ProjectId,
    RunId,
    utc_now,
)

REFERENCE_EXECUTOR_ID = "00000000-0000-4000-8000-000000000001"


def _inbound_event(
    harness: Harness,
    *,
    run_id: str,
    agent_run_id: str,
    event_type: EventType,
    external_event_id: str,
) -> Event:
    run = harness.client.get(f"/api/runs/{run_id}").json()
    now = utc_now()

    return Event(
        id=EventId.new(),
        schema_version=EVENT_SCHEMA_VERSION,
        event_type=event_type,
        project_id=ProjectId.parse(run["project_id"]),
        run_id=RunId.parse(run_id),
        agent_run_id=AgentRunId.parse(agent_run_id),
        source=EventSource.EXECUTOR,
        source_ref="reference-session-000001",
        occurred_at=now,
        recorded_at=now,
        payload=(),
        external_event_id=external_event_id,
        executor_id=ExecutorId.parse(REFERENCE_EXECUTOR_ID),
        created_at=now,
    )


def _deliver(harness: Harness, event: Event) -> Any:
    return asyncio.run(harness.app.state.orchestrator.apply_external_event(event))


def _waiting_run(harness: Harness) -> dict[str, Any]:
    """Start a Run whose required assignment is waiting on the executor."""

    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    return run


def test_inbound_agent_completion_reconciles_a_waiting_stage(
    harness_factory: HarnessFactory,
) -> None:
    from agent_office.infrastructure.executors import ReferenceScenario

    harness = harness_factory(ReferenceScenario.WAITING)
    run = _waiting_run(harness)

    # The stage is waiting on its required assignment and the Run is not
    # terminal.
    assert harness.stage_status(run["id"], "DISCOVERY") == "WAITING"
    assert harness.client.get(f"/api/runs/{run['id']}").json()["status"] not in {
        "COMPLETED",
        "FAILED",
        "CANCELLED",
    }

    waiting_agents = harness.agent_runs(run["id"])
    assert {agent["status"] for agent in waiting_agents} == {"WAITING"}
    assert set(harness.agent_statuses(run["id"], "DISCOVERY")) == {"WAITING"}

    # Deliver completion for every assignment of the stage.
    for agent_run in waiting_agents:
        result = _deliver(
            harness,
            _inbound_event(
                harness,
                run_id=run["id"],
                agent_run_id=agent_run["id"],
                event_type=EventType.AGENT_COMPLETED,
                external_event_id=f"external-complete-{agent_run['id']}",
            ),
        )
        assert result.persisted is True
        assert result.state_changed is True

    assert set(harness.agent_statuses(run["id"], "DISCOVERY")) == {"COMPLETED"}
    assert harness.stage_status(run["id"], "DISCOVERY") == "COMPLETED"


def test_reconciled_stage_makes_downstream_eligible_and_is_idempotent(
    harness_factory: HarnessFactory,
) -> None:
    from agent_office.infrastructure.executors import ReferenceScenario

    harness = harness_factory(ReferenceScenario.WAITING)
    run = _waiting_run(harness)

    waiting_agents = sorted(
        harness.agent_runs(run["id"]), key=lambda agent: agent["agent_profile_key"]
    )
    first = waiting_agents[0]

    # The downstream assignment must not exist while the upstream stage waits.
    assert harness.agent_statuses(run["id"], "IMPLEMENTATION") == []

    event = _inbound_event(
        harness,
        run_id=run["id"],
        agent_run_id=first["id"],
        event_type=EventType.AGENT_COMPLETED,
        external_event_id=f"external-complete-{first['id']}",
    )

    first_result = _deliver(harness, event)
    assert first_result.state_changed is True

    # Only one of the two required assignments has completed, so the stage is
    # still resolving and nothing downstream may start.
    assert harness.stage_status(run["id"], "DISCOVERY") == "WAITING"
    assert harness.agent_statuses(run["id"], "IMPLEMENTATION") == []
    assert not [
        e
        for e in harness.events(run["id"])
        if e["event_type"] == "stage.completed" and e["payload"]["stage_key"] == "DISCOVERY"
    ]

    # Completing the remaining assignment reconciles the stage and unlocks the
    # downstream stage.
    second = waiting_agents[1]
    second_result = _deliver(
        harness,
        _inbound_event(
            harness,
            run_id=run["id"],
            agent_run_id=second["id"],
            event_type=EventType.AGENT_COMPLETED,
            external_event_id=f"external-complete-{second['id']}",
        ),
    )
    assert second_result.state_changed is True

    assert harness.stage_status(run["id"], "DISCOVERY") == "COMPLETED"

    completed_events = [
        e
        for e in harness.events(run["id"])
        if e["event_type"] == "stage.completed" and e["payload"]["stage_key"] == "DISCOVERY"
    ]
    assert len(completed_events) == 1

    # The downstream stage became eligible as a result of the reconciliation.
    assert harness.agent_statuses(run["id"], "IMPLEMENTATION") != []

    # Re-delivering the same external event is a pure duplicate: no second
    # stage transition and no duplicated downstream AgentRun.
    agent_runs_before = len(harness.agent_runs(run["id"]))
    stages_before = harness.stages(run["id"])
    duplicate = _deliver(harness, replace(event, id=EventId.new()))

    assert duplicate.persisted is False
    assert duplicate.duplicate is True
    assert duplicate.state_changed is False

    assert len(harness.agent_runs(run["id"])) == agent_runs_before
    assert harness.stages(run["id"]) == stages_before
    assert (
        len(
            [
                e
                for e in harness.events(run["id"])
                if e["event_type"] == "stage.completed" and e["payload"]["stage_key"] == "DISCOVERY"
            ]
        )
        == 1
    )


def test_reconciliation_never_regresses_a_terminal_stage_or_run(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    assert harness.client.get(f"/api/runs/{run['id']}").json()["status"] == "COMPLETED"
    agent_run = harness.agent_runs(run["id"])[0]

    stages_before = harness.stages(run["id"])

    result = _deliver(
        harness,
        _inbound_event(
            harness,
            run_id=run["id"],
            agent_run_id=agent_run["id"],
            event_type=EventType.AGENT_WAITING,
            external_event_id="late-waiting-after-completion",
        ),
    )

    assert result.persisted is True
    assert result.state_changed is False
    assert result.ignored_for_state_reason == "terminal_state_preserved"

    assert harness.client.get(f"/api/runs/{run['id']}").json()["status"] == "COMPLETED"
    assert harness.stages(run["id"]) == stages_before


def test_late_activity_after_reconciliation_remains_historical_only(
    harness_factory: HarnessFactory,
) -> None:
    from agent_office.infrastructure.executors import ReferenceScenario

    harness = harness_factory(ReferenceScenario.WAITING)
    run = _waiting_run(harness)

    for agent_run in harness.agent_runs(run["id"]):
        _deliver(
            harness,
            _inbound_event(
                harness,
                run_id=run["id"],
                agent_run_id=agent_run["id"],
                event_type=EventType.AGENT_COMPLETED,
                external_event_id=f"complete-{agent_run['id']}",
            ),
        )

    assert harness.stage_status(run["id"], "DISCOVERY") == "COMPLETED"

    agent_run = harness.agent_runs(run["id"])[0]
    stages_before = harness.stages(run["id"])

    late = _deliver(
        harness,
        _inbound_event(
            harness,
            run_id=run["id"],
            agent_run_id=agent_run["id"],
            event_type=EventType.AGENT_ACTIVITY,
            external_event_id="activity-after-completion",
        ),
    )

    # The historical event is preserved, but nothing changes state.
    assert late.persisted is True
    assert late.state_changed is False
    assert late.ignored_for_state_reason == "no_state_mapping"

    assert harness.stage_status(run["id"], "DISCOVERY") == "COMPLETED"
    assert harness.stages(run["id"]) == stages_before
    assert len([e for e in harness.events(run["id"]) if e["event_type"] == "agent.activity"]) == 1
