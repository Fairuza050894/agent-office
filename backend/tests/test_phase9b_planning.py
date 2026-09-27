"""Phase 9B acceptance tests for persistent planning truth."""

from __future__ import annotations

import asyncio
from pathlib import Path

from conftest import HarnessFactory

from agent_office.application.planning import ReferencePlanningRuntime
from agent_office.domain import (
    ComposerThreadId,
    PlanningArtifactType,
    TeamMemberDisposition,
    TeamPhase,
)


def _create_thread(harness: object, project_id: str) -> dict[str, object]:
    client = getattr(harness, "client")
    response = client.post(
        "/api/composer/threads",
        json={
            "project_id": project_id,
            "requested_intent": "PLAN",
            "timezone": "Asia/Jakarta",
            "title": "Project re-entry",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_composer_thread_message_and_planning_events_are_durable(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "phase9b-restart.sqlite"
    first = harness_factory(database_path=database_path)
    project = first.register_project("Planning Project")
    thread = _create_thread(first, project["id"])

    posted = first.client.post(
        f"/api/composer/threads/{thread['id']}/messages",
        json={"content": "Review the project before implementation."},
    )
    assert posted.status_code == 201, posted.text
    assert posted.json()["actor_type"] == "USER"

    events = first.client.get(f"/api/composer/threads/{thread['id']}/events")
    assert events.status_code == 200
    assert [event["event_type"] for event in events.json()["events"]] == [
        "composer.thread.created",
        "composer.message.received",
    ]

    second = harness_factory(database_path=database_path)
    loaded = second.client.get(f"/api/composer/threads/{thread['id']}")
    messages = second.client.get(f"/api/composer/threads/{thread['id']}/messages")

    assert loaded.status_code == 200
    assert loaded.json()["title"] == "Project re-entry"
    assert messages.status_code == 200
    assert [item["content"] for item in messages.json()] == [
        "Review the project before implementation."
    ]


def test_planning_history_is_separate_from_run_event_truth(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project("Separate Truth")
    thread = _create_thread(harness, project["id"])

    harness.client.post(
        f"/api/composer/threads/{thread['id']}/messages",
        json={"content": "Plan only; do not run."},
    )

    database = harness.app.state.project_database
    with database.connection() as connection:
        operational_count = connection.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        planning_count = connection.execute(
            "SELECT COUNT(*) FROM planning_events"
        ).fetchone()[0]
        run_count = connection.execute("SELECT COUNT(*) FROM runs").fetchone()[0]
        agent_count = connection.execute("SELECT COUNT(*) FROM agent_runs").fetchone()[0]

    assert operational_count == 0
    assert planning_count == 2
    assert run_count == 0
    assert agent_count == 0


def test_requirement_decision_is_persisted_and_audited(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project("Requirements")
    thread = _create_thread(harness, project["id"])

    service = harness.app.state.requirement_service
    candidate = service.propose(
        ComposerThreadId.parse(str(thread["id"])),
        title="Service catalog relation view",
        problem="Cross-service dependencies are hard to inspect.",
        requirement="Show repository-backed service relations.",
        rationale="Make architecture impact visible before implementation.",
        acceptance_hint="The relation view is derived from registered project data.",
        source_roles=("product-manager", "principal-engineer"),
    )

    approved = harness.client.post(f"/api/requirements/{candidate.id}/approve")
    assert approved.status_code == 200, approved.text
    payload = approved.json()
    assert payload["status"] == "APPROVED"
    assert payload["approved_at"] == payload["decided_at"]

    duplicate = harness.client.post(f"/api/requirements/{candidate.id}/approve")
    assert duplicate.status_code == 409

    database = harness.app.state.project_database
    with database.connection() as connection:
        audit = connection.execute(
            """
            SELECT action, target_type, target_id, run_id
            FROM audit_records
            WHERE target_id = ?
            """,
            (str(candidate.id),),
        ).fetchone()

    assert audit is not None
    assert audit["action"] == "REQUIREMENT_APPROVED"
    assert audit["target_type"] == "REQUIREMENT"
    assert audit["target_id"] == str(candidate.id)
    assert audit["run_id"] is None


def test_team_and_artifact_services_round_trip_through_http_reads(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project("Planning Artifacts")
    thread = _create_thread(harness, project["id"])
    thread_id = ComposerThreadId.parse(str(thread["id"]))

    proposal, _ = harness.app.state.team_proposal_service.propose(
        thread_id,
        phase=TeamPhase.PLANNING,
        rationale_summary="Start with the smallest useful planning cell.",
        members=(
            (
                "product-manager",
                TeamMemberDisposition.INCLUDED,
                "Requirement scope needs product framing.",
            ),
            (
                "system-analyst",
                TeamMemberDisposition.INCLUDED,
                "Current repository truth must be inspected.",
            ),
            (
                "backend-engineer",
                TeamMemberDisposition.DEFERRED,
                "Implementation scope is not approved.",
            ),
        ),
    )
    harness.app.state.planning_artifact_service.create(
        thread_id,
        artifact_type=PlanningArtifactType.BRIEF,
        title="Project re-entry brief",
        content=(("summary", "Current state inspected."),),
        author_role_key="system-analyst",
    )

    proposals = harness.client.get(
        f"/api/composer/threads/{thread['id']}/team-proposals"
    )
    artifacts = harness.client.get(f"/api/composer/threads/{thread['id']}/artifacts")

    assert proposals.status_code == 200
    assert proposals.json()[0]["id"] == str(proposal.id)
    assert len(proposals.json()[0]["members"]) == 3
    assert artifacts.status_code == 200
    assert artifacts.json()[0]["artifact_type"] == "BRIEF"

    accepted = harness.client.post(f"/api/team-proposals/{proposal.id}/accept")
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "ACCEPTED"


def test_planning_event_sse_replays_durable_history(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project("Planning Stream")
    thread = _create_thread(harness, project["id"])
    harness.client.post(
        f"/api/composer/threads/{thread['id']}/messages",
        json={"content": "Create a bounded planning record."},
    )

    response = harness.client.get(
        f"/api/composer/threads/{thread['id']}/events/stream",
        params={"follow": "false"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    ids = [
        line.removeprefix("id: ")
        for line in response.text.splitlines()
        if line.startswith("id: ")
    ]
    events = harness.client.get(
        f"/api/composer/threads/{thread['id']}/events"
    ).json()["events"]
    assert ids == [event["id"] for event in events]


def test_reference_planning_runtime_is_deterministic_and_read_only() -> None:
    runtime = ReferencePlanningRuntime()

    capabilities = asyncio.run(runtime.describe_capabilities())
    first = asyncio.run(
        runtime.contribute(
            role_key="system-analyst",
            instruction="Inspect current project state.",
        )
    )
    second = asyncio.run(
        runtime.contribute(
            role_key="system-analyst",
            instruction="Inspect current project state.",
        )
    )

    assert capabilities.read_only is True
    assert capabilities.structured_output is True
    assert first == second
    assert first.summary == "Reference planning contribution for system-analyst."
    assert asyncio.run(runtime.cancel()) is True


def test_unknown_project_cannot_scope_composer_thread(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()

    response = harness.client.post(
        "/api/composer/threads",
        json={
            "project_id": "55555555-5555-4555-8555-555555555555",
            "requested_intent": "PLAN",
            "timezone": "UTC",
        },
    )

    assert response.status_code == 404
