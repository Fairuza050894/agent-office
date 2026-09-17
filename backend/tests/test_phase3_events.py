"""Phase 3A acceptance: normalized Event durability, idempotency, ordering.

The event store must tolerate duplicate delivery and late arrival without ever
duplicating a workflow effect or regressing terminal state.
"""

from __future__ import annotations

import asyncio
from dataclasses import replace
from typing import Any
from uuid import uuid4

from conftest import Harness, HarnessFactory

from agent_office.api.events import _event_stream
from agent_office.domain import (
    EVENT_SCHEMA_VERSION,
    AgentRunId,
    Event,
    EventId,
    EventPayloadValue,
    EventSource,
    EventType,
    ExecutorId,
    ProjectId,
    RunId,
    build_payload,
    utc_now,
)

REFERENCE_EXECUTOR_ID = "00000000-0000-4000-8000-000000000001"


def _agent_run(harness: Harness, run_id: str, profile_key: str) -> dict[str, Any]:
    for agent_run in harness.agent_runs(run_id):
        if agent_run["agent_profile_key"] == profile_key:
            return agent_run

    raise AssertionError(f"agent run {profile_key} is missing")


def _external_event(
    harness: Harness,
    *,
    run_id: str,
    agent_run_id: str,
    event_type: EventType,
    external_event_id: str,
    payload: tuple[tuple[str, EventPayloadValue], ...] = (),
) -> Event:
    """Build a canonical event exactly as an adapter would deliver it."""

    run = harness.client.get(f"/api/runs/{run_id}").json()
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
        source_ref="reference-session-000001",
        occurred_at=now,
        recorded_at=now,
        payload=retained,
        redacted_keys=redacted,
        external_event_id=external_event_id,
        executor_id=ExecutorId.parse(REFERENCE_EXECUTOR_ID),
        created_at=now,
    )


def test_events_are_durable_for_a_completed_run(harness_factory: HarnessFactory) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    events = harness.events(run["id"])

    assert events
    assert events[0]["event_type"] == "run.created"
    assert events[-1]["event_type"] == "run.completed"

    for event in events:
        assert event["project_id"] == project["id"]
        assert event["run_id"] == run["id"]
        assert event["schema_version"] == EVENT_SCHEMA_VERSION
        assert event["source"]
        assert event["recorded_at"]
        assert event["occurred_at"]


def test_agent_scoped_events_reference_their_agent_run(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    agent_run_ids = {agent_run["id"] for agent_run in harness.agent_runs(run["id"])}

    for event in harness.events(run["id"]):
        if event["event_type"].startswith("agent."):
            assert event["agent_run_id"] in agent_run_ids


def test_duplicate_external_event_creates_one_durable_record_and_no_extra_effect(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])

    # Reach a stable state where one assignment is waiting on the executor.
    harness.start_run(run["id"])
    agent_run = _agent_run(harness, run["id"], "architect")

    events_before = len(harness.events(run["id"]))
    stages_before = harness.stages(run["id"])
    agent_runs_before = harness.agent_runs(run["id"])

    orchestrator = harness.app.state.orchestrator
    original = _external_event(
        harness,
        run_id=run["id"],
        agent_run_id=agent_run["id"],
        event_type=EventType.AGENT_COMPLETED,
        external_event_id="provider-event-shared-1",
        payload=(("summary", "Reference execution completed successfully."),),
    )
    # Same external identity, different Agent Office event id.
    duplicate = replace(original, id=EventId.new(), recorded_at=utc_now(), created_at=utc_now())

    first = asyncio.run(orchestrator.apply_external_event(original))
    second = asyncio.run(orchestrator.apply_external_event(duplicate))

    assert first.persisted is True
    assert first.duplicate is False
    assert second.persisted is False
    assert second.duplicate is True
    assert second.state_changed is False
    assert second.diagnostics == ("duplicate_event",)

    # One durable record, and no duplicated downstream work.
    assert len(harness.events(run["id"])) == events_before + 1
    assert harness.stages(run["id"]) == stages_before
    assert len(harness.agent_runs(run["id"])) == len(agent_runs_before)


def test_repeated_semantic_event_does_not_duplicate_downstream_work(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    workflow = harness.workflow_by_key("bug-fix")
    project = harness.register_project()
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    agent_run = _agent_run(harness, run["id"], "explorer")
    orchestrator = harness.app.state.orchestrator

    agent_runs_before = len(harness.agent_runs(run["id"]))
    stages_before = harness.stages(run["id"])

    # A distinct external identity carrying an already-applied semantic fact.
    late = _external_event(
        harness,
        run_id=run["id"],
        agent_run_id=agent_run["id"],
        event_type=EventType.AGENT_COMPLETED,
        external_event_id="provider-event-distinct-2",
    )
    result = asyncio.run(orchestrator.apply_external_event(late))

    assert result.persisted is True
    assert result.duplicate is False
    assert result.state_changed is False
    assert result.ignored_for_state_reason == "already_in_target_state"

    assert len(harness.agent_runs(run["id"])) == agent_runs_before
    assert harness.stages(run["id"]) == stages_before


def test_late_activity_event_never_regresses_terminal_state(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    agent_run = _agent_run(harness, run["id"], "architect")
    assert agent_run["status"] == "COMPLETED"

    orchestrator = harness.app.state.orchestrator

    late = _external_event(
        harness,
        run_id=run["id"],
        agent_run_id=agent_run["id"],
        event_type=EventType.AGENT_ACTIVITY,
        external_event_id="provider-activity-late-1",
        payload=(("activity", "Applying patch"),),
    )
    result = asyncio.run(orchestrator.apply_external_event(late))

    # The historical event is preserved...
    assert result.persisted is True
    assert result.state_changed is False
    assert result.ignored_for_state_reason == "no_state_mapping"

    # ...and the terminal AgentRun state does not regress.
    assert _agent_run(harness, run["id"], "architect")["status"] == "COMPLETED"
    assert harness.client.get(f"/api/runs/{run['id']}").json()["status"] == "COMPLETED"

    persisted = [
        event for event in harness.events(run["id"]) if event["event_type"] == "agent.activity"
    ]
    assert len(persisted) == 1


def test_contradictory_terminal_event_is_recorded_without_overwriting_truth(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    agent_run = _agent_run(harness, run["id"], "architect")

    orchestrator = harness.app.state.orchestrator

    contradiction = _external_event(
        harness,
        run_id=run["id"],
        agent_run_id=agent_run["id"],
        event_type=EventType.AGENT_FAILED,
        external_event_id="provider-event-contradiction-1",
        payload=(("failure_code", "EXECUTION_FAILED"),),
    )
    result = asyncio.run(orchestrator.apply_external_event(contradiction))

    assert result.persisted is True
    assert result.state_changed is False
    assert result.ignored_for_state_reason == "terminal_state_preserved"
    assert result.diagnostics == ("provider_contradiction",)

    # Both facts remain durable and the AgentRun is not silently overwritten.
    assert _agent_run(harness, run["id"], "architect")["status"] == "COMPLETED"
    failures = [
        event for event in harness.events(run["id"]) if event["event_type"] == "agent.failed"
    ]
    assert len(failures) == 1


def test_secret_bearing_payload_is_redacted_before_persistence(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    agent_run = _agent_run(harness, run["id"], "architect")
    orchestrator = harness.app.state.orchestrator

    secret = _external_event(
        harness,
        run_id=run["id"],
        agent_run_id=agent_run["id"],
        event_type=EventType.AGENT_ACTIVITY,
        external_event_id="provider-activity-secret-1",
        payload=(
            ("activity", "Applying patch"),
            ("api_token", "super-secret-value"),
        ),
    )
    asyncio.run(orchestrator.apply_external_event(secret))

    stored = next(
        event for event in harness.events(run["id"]) if event["event_type"] == "agent.activity"
    )

    assert stored["payload"] == {"activity": "Applying patch"}
    assert stored["redacted_keys"] == ["api_token"]
    assert "super-secret-value" not in harness.client.get(f"/api/runs/{run['id']}/events").text


def test_event_history_is_cursor_paginated_without_gaps_or_repeats(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    all_events = harness.events(run["id"])
    assert len(all_events) > 5

    collected: list[str] = []
    cursor: str | None = None

    for _ in range(50):
        params: dict[str, Any] = {"limit": 5}

        if cursor is not None:
            params["cursor"] = cursor

        response = harness.client.get(f"/api/runs/{run['id']}/events", params=params)
        assert response.status_code == 200, response.text
        page = response.json()

        collected.extend(event["id"] for event in page["events"])
        cursor = page["next_cursor"]

        if cursor is None:
            break

    assert collected == [event["id"] for event in all_events]
    assert len(set(collected)) == len(collected)


def test_malformed_cursor_is_rejected_with_controlled_status(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    response = harness.client.get(
        f"/api/runs/{run['id']}/events",
        params={"cursor": "not-a-real-cursor"},
    )

    assert response.status_code == 400


def test_event_dto_exposes_no_internal_executor_details(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    response = harness.client.get(f"/api/runs/{run['id']}/events")
    body = response.text

    assert "dedupe_key" not in body
    assert "executor_session" not in body
    assert "reference-session" not in body
    assert str(harness.tmp_path) not in body
    assert "Traceback" not in body


def test_run_event_stream_replays_durable_history_and_closes(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    response = harness.client.get(
        f"/api/runs/{run['id']}/events/stream",
        params={"follow": "false"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")

    frames = [
        line
        for line in response.text.splitlines()
        if line.startswith("id: ") or line.startswith("event: ")
    ]

    assert frames
    event_ids = [line.removeprefix("id: ") for line in frames if line.startswith("id: ")]
    assert event_ids == [event["id"] for event in harness.events(run["id"])]


def test_run_event_stream_resumes_from_the_actual_emitted_sse_id(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    events = harness.events(run["id"])
    assert len(events) > 5

    def stream(last_event_id: str | None) -> tuple[int, list[str]]:
        headers = {} if last_event_id is None else {"Last-Event-ID": last_event_id}
        response = harness.client.get(
            f"/api/runs/{run['id']}/events/stream",
            params={"follow": "false"},
            headers=headers,
        )

        return response.status_code, [
            line.removeprefix("id: ")
            for line in response.text.splitlines()
            if line.startswith("id: ")
        ]

    # 1/2. Obtain the real SSE response and read an emitted id exactly as a
    # browser would.
    status, ids = stream(None)
    assert status == 200
    assert ids == [event["id"] for event in events]

    resume_after = ids[2]

    # 3/4. Send that exact emitted value back and confirm only later durable
    # events resume.
    status, resumed = stream(resume_after)
    assert status == 200
    assert resumed == ids[3:]

    # 5. No gap and no duplicate across the reconnect boundary.
    assert len(set(resumed)) == len(resumed)
    assert resume_after not in resumed

    # Resuming from the final event yields nothing further.
    status, tail = stream(ids[-1])
    assert status == 200
    assert tail == []


def test_run_event_stream_rejects_unknown_last_event_id(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    unknown = harness.client.get(
        f"/api/runs/{run['id']}/events/stream",
        params={"follow": "false"},
        headers={"Last-Event-ID": str(uuid4())},
    )
    assert unknown.status_code == 400

    malformed = harness.client.get(
        f"/api/runs/{run['id']}/events/stream",
        params={"follow": "false"},
        headers={"Last-Event-ID": "not-an-event-id"},
    )
    assert malformed.status_code == 400


def test_run_event_stream_rejects_a_last_event_id_from_another_run(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project()

    task_a = harness.create_task(project["id"], title="Task A")
    run_a = harness.create_run(task_a["id"])
    harness.start_run(run_a["id"])

    task_b = harness.create_task(project["id"], title="Task B")
    run_b = harness.create_run(task_b["id"])
    harness.start_run(run_b["id"])

    foreign_event_id = harness.events(run_b["id"])[0]["id"]

    response = harness.client.get(
        f"/api/runs/{run_a['id']}/events/stream",
        params={"follow": "false"},
        headers={"Last-Event-ID": foreign_event_id},
    )

    assert response.status_code == 400


class _DisconnectingRequest:
    """Minimal stand-in for a Starlette Request that disconnects promptly."""

    def __init__(self, disconnect_after: int) -> None:
        self._remaining = disconnect_after
        self.calls = 0

    async def is_disconnected(self) -> bool:
        self.calls += 1

        return self.calls > self._remaining


async def _collect_frames(
    request: _DisconnectingRequest,
    service: Any,
    run_id: RunId,
    *,
    limit: int = 500,
) -> list[str]:
    frames: list[str] = []

    async for frame in _event_stream(
        request=request,  # type: ignore[arg-type]
        event_service=service,
        run_id=run_id,
        after=None,
        follow=True,
    ):
        frames.append(frame)

        if len(frames) >= limit:
            break

    return frames


def test_follow_stream_emits_durable_events_and_stops_on_disconnect(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    harness.start_run(run["id"])

    request = _DisconnectingRequest(disconnect_after=1)
    frames = asyncio.run(
        _collect_frames(request, harness.app.state.event_service, RunId.parse(run["id"]))
    )

    event_ids = [
        line.removeprefix("id: ")
        for frame in frames
        for line in frame.splitlines()
        if line.startswith("id: ")
    ]

    # Follow mode streams only real persisted events and terminates once the
    # client is gone; it never fabricates an operational event.
    assert event_ids == [event["id"] for event in harness.events(run["id"])]
    assert request.calls >= 2
