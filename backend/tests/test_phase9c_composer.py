"""Phase 9C acceptance tests for Universal Composer and Dynamic Team Formation."""

from __future__ import annotations

from conftest import Harness, HarnessFactory

from agent_office.domain import (
    BUILT_IN_AGENT_PROFILES,
    ComposerIntent,
    ComposerThreadId,
    TeamMemberDisposition,
    TeamPhase,
)


def _new_thread(
    harness: Harness,
    project_id: str,
    *,
    intent: str = "AUTO",
    title: str = "Phase 9C planning",
) -> dict[str, object]:
    response = harness.client.post(
        "/api/composer/threads",
        json={
            "project_id": project_id,
            "requested_intent": intent,
            "timezone": "Asia/Jakarta",
            "title": title,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _prepare(
    harness: Harness,
    thread_id: str,
    instruction: str,
) -> dict[str, object]:
    message = harness.client.post(
        f"/api/composer/threads/{thread_id}/messages",
        json={"content": instruction},
    )
    assert message.status_code == 201, message.text

    response = harness.client.post(f"/api/composer/threads/{thread_id}/prepare")
    assert response.status_code == 200, response.text
    return response.json()


def _member_map(preparation: dict[str, object]) -> dict[str, dict[str, object]]:
    proposal = preparation["team_proposal"]
    assert isinstance(proposal, dict)
    members = proposal["members"]
    assert isinstance(members, list)
    return {str(member["role_key"]): member for member in members if isinstance(member, dict)}


def test_auto_project_reentry_stops_at_plan_with_small_planning_cell(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project("TDP")
    thread = _new_thread(harness, project["id"])

    prepared = _prepare(
        harness,
        str(thread["id"]),
        (
            "Lanjutkan project TDP yang sudah lama tidak kita handle. "
            "Rumuskan requirement baru sebelum coding."
        ),
    )

    assert prepared["resolution"]["resolved_intent"] == "PLAN"
    assert prepared["resolution"]["requires_user_action"] is False
    assert prepared["thread"]["status"] == "ACTIVE"

    members = _member_map(prepared)
    assert members["product-manager"]["disposition"] == "INCLUDED"
    assert members["system-analyst"]["disposition"] == "INCLUDED"
    assert members["principal-engineer"]["disposition"] == "INCLUDED"
    assert members["backend-engineer"]["disposition"] == "DEFERRED"
    assert members["frontend-engineer"]["disposition"] == "DEFERRED"
    assert members["qa-engineer"]["disposition"] == "EXCLUDED"
    assert members["product-designer"]["disposition"] == "EXCLUDED"
    assert members["security-reviewer"]["disposition"] == "EXCLUDED"
    assert members["technical-writer"]["disposition"] == "EXCLUDED"

    artifacts = prepared["artifacts"]
    assert [artifact["artifact_type"] for artifact in artifacts] == ["BRIEF", "ACTION"]
    brief = artifacts[0]
    assert brief["title"] == "Project re-entry brief"
    assert brief["content"]["project"] == "TDP"
    assert brief["content"]["repository_state"] == "NOT_INSPECTED_IN_PHASE_9C"
    assert brief["content"]["architecture_dependencies"] == "NOT_INSPECTED_IN_PHASE_9C"
    assert brief["content"]["observed_gaps"] == "NOT_INSPECTED_IN_PHASE_9C"
    assert brief["content"]["relevant_technical_debt"] == "NOT_INSPECTED_IN_PHASE_9C"
    assert brief["content"]["requirement_candidates"] == (
        "NONE_PROPOSED_UNTIL_READ_ONLY_PROJECT_CONTEXT_IS_AVAILABLE"
    )
    assert brief["content"]["proposed_implementation_scope"] == (
        "NOT_PROPOSED_UNTIL_REQUIREMENTS_ARE_GROUNDED_AND_APPROVED"
    )
    assert brief["content"]["execution_state"] == "NOT_STARTED"
    assert "Phase 9D" in brief["content"]["verification_plan"]
    assert brief["content"]["prior_planning_threads"] == 0

    database = harness.app.state.project_database
    with database.connection() as connection:
        assert connection.execute("SELECT COUNT(*) FROM runs").fetchone()[0] == 0
        assert connection.execute("SELECT COUNT(*) FROM agent_runs").fetchone()[0] == 0
        assert connection.execute("SELECT COUNT(*) FROM events").fetchone()[0] == 0


def test_brainstorm_adds_only_relevant_conditional_review_roles(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project("UI Security")
    thread = _new_thread(harness, project["id"], intent="BRAINSTORM")

    prepared = _prepare(
        harness,
        str(thread["id"]),
        (
            "Brainstorm redesign login dashboard UI dan auth permission. "
            "Kita juga perlu acceptance test yang jelas."
        ),
    )

    assert prepared["resolution"]["resolved_intent"] == "BRAINSTORM"
    members = _member_map(prepared)
    for role in (
        "product-manager",
        "system-analyst",
        "principal-engineer",
        "product-designer",
        "qa-engineer",
        "security-reviewer",
    ):
        assert members[role]["disposition"] == "INCLUDED"

    assert members["frontend-engineer"]["disposition"] == "DEFERRED"


def test_explicit_run_is_recorded_but_execution_stays_blocked(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project("Execution Boundary")
    thread = _new_thread(harness, project["id"], intent="RUN")

    prepared = _prepare(
        harness,
        str(thread["id"]),
        "Implement the approved feature now.",
    )

    assert prepared["resolution"]["resolved_intent"] == "RUN"
    assert prepared["resolution"]["requires_user_action"] is True
    assert prepared["thread"]["status"] == "AWAITING_USER"

    questions = [
        artifact for artifact in prepared["artifacts"] if artifact["artifact_type"] == "QUESTION"
    ]
    assert len(questions) == 1
    assert questions[0]["content"]["option_a"] == "Continue in read-only planning mode."
    assert "recommendation" in questions[0]["content"]

    database = harness.app.state.project_database
    with database.connection() as connection:
        assert connection.execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 0
        assert connection.execute("SELECT COUNT(*) FROM runs").fetchone()[0] == 0
        assert connection.execute("SELECT COUNT(*) FROM workspaces").fetchone()[0] == 0


def test_auto_read_only_question_resolves_to_ask(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project("Architecture Question")
    thread = _new_thread(harness, project["id"])

    prepared = _prepare(
        harness,
        str(thread["id"]),
        "Bagaimana arsitektur dan dependency service project ini?",
    )

    assert prepared["resolution"]["resolved_intent"] == "ASK"
    members = _member_map(prepared)
    assert members["system-analyst"]["disposition"] == "INCLUDED"
    assert members["principal-engineer"]["disposition"] == "INCLUDED"
    assert members["backend-engineer"]["disposition"] == "EXCLUDED"
    assert members["frontend-engineer"]["disposition"] == "EXCLUDED"
    assert members["product-manager"]["disposition"] == "EXCLUDED"


def test_team_formation_is_deterministic_for_same_facts(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project("Deterministic Team")
    instruction = "Plan backend API schema change and regression testing."

    first = _prepare(
        harness,
        str(_new_thread(harness, project["id"])["id"]),
        instruction,
    )
    second = _prepare(
        harness,
        str(_new_thread(harness, project["id"])["id"]),
        instruction,
    )

    def normalized(preparation: dict[str, object]) -> list[tuple[str, str, str, int]]:
        proposal = preparation["team_proposal"]
        assert isinstance(proposal, dict)
        members = proposal["members"]
        assert isinstance(members, list)
        return [
            (
                str(member["role_key"]),
                str(member["disposition"]),
                str(member["reason"]),
                int(member["order_hint"]),
            )
            for member in members
            if isinstance(member, dict)
        ]

    assert normalized(first) == normalized(second)


def test_project_reentry_brief_references_prior_planning_history(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project("Persistent Planning")

    first = _new_thread(harness, project["id"], title="Initial planning")
    _prepare(harness, str(first["id"]), "Plan the first bounded change.")

    second = _new_thread(harness, project["id"], title="Return to project")
    prepared = _prepare(
        harness,
        str(second["id"]),
        "Continue the existing project after a break.",
    )

    brief = next(
        artifact for artifact in prepared["artifacts"] if artifact["artifact_type"] == "BRIEF"
    )
    assert brief["content"]["prior_planning_threads"] == 1
    assert brief["content"]["latest_prior_thread"] == "Initial planning"
    assert brief["content"]["latest_prior_status"] == "ACTIVE"

    history = harness.client.get(f"/api/projects/{project['id']}/composer/threads")
    assert history.status_code == 200
    assert [thread["title"] for thread in history.json()] == [
        "Return to project",
        "Initial planning",
    ]


def test_prepare_is_idempotent_after_first_team_proposal(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project("Idempotent Planning")
    thread = _new_thread(harness, project["id"])
    _prepare(harness, str(thread["id"]), "Plan a UI improvement.")

    second = harness.client.post(f"/api/composer/threads/{thread['id']}/prepare")
    assert second.status_code == 200

    database = harness.app.state.project_database
    with database.connection() as connection:
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM team_proposals WHERE thread_id = ?",
                (str(thread["id"]),),
            ).fetchone()[0]
            == 1
        )
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM planning_artifacts WHERE thread_id = ?",
                (str(thread["id"]),),
            ).fetchone()[0]
            == 2
        )
        assert (
            connection.execute(
                """
                SELECT COUNT(*)
                FROM planning_events
                WHERE thread_id = ? AND event_type = 'intent.resolved'
                """,
                (str(thread["id"]),),
            ).fetchone()[0]
            == 1
        )


def test_prepare_recovers_missing_artifacts_after_partial_planning_write(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project("Recovery Planning")
    thread = _new_thread(harness, project["id"])
    thread_id = ComposerThreadId.parse(str(thread["id"]))

    message = harness.client.post(
        f"/api/composer/threads/{thread['id']}/messages",
        json={"content": "Plan backend API work before implementation."},
    )
    assert message.status_code == 201

    harness.app.state.composer_thread_service.resolve_intent(
        thread_id,
        resolved_intent=ComposerIntent.PLAN,
        reason_summary="Simulated partial preparation.",
        requires_user_action=False,
    )
    harness.app.state.team_proposal_service.propose(
        thread_id,
        phase=TeamPhase.PLANNING,
        rationale_summary="Simulated persisted team before artifact creation.",
        members=(
            (
                "product-manager",
                TeamMemberDisposition.INCLUDED,
                "Own planning scope.",
            ),
            (
                "backend-engineer",
                TeamMemberDisposition.DEFERRED,
                "Wait for approved requirements.",
            ),
        ),
    )

    response = harness.client.post(f"/api/composer/threads/{thread['id']}/prepare")
    assert response.status_code == 200, response.text
    artifacts = response.json()["artifacts"]

    assert {artifact["title"] for artifact in artifacts} == {
        "Project re-entry brief",
        "Deferred implementation",
    }

    database = harness.app.state.project_database
    with database.connection() as connection:
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM team_proposals WHERE thread_id = ?",
                (str(thread["id"]),),
            ).fetchone()[0]
            == 1
        )
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM planning_artifacts WHERE thread_id = ?",
                (str(thread["id"]),),
            ).fetchone()[0]
            == 2
        )


def test_phase9c_adds_vnext_roles_without_removing_legacy_profiles() -> None:
    keys = {profile.key for profile in BUILT_IN_AGENT_PROFILES}

    assert {
        "architect",
        "explorer",
        "backend-developer",
        "frontend-developer",
        "qa-reviewer",
        "security-reviewer",
        "verifier",
        "documentation-writer",
    } <= keys

    assert {
        "product-manager",
        "system-analyst",
        "principal-engineer",
        "product-designer",
        "backend-engineer",
        "frontend-engineer",
        "qa-engineer",
        "technical-writer",
    } <= keys


def test_decision_queue_resolution_is_durable_audited_and_non_operational(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project("Decision Queue")
    thread = _new_thread(harness, project["id"], intent="RUN")

    prepared = _prepare(
        harness,
        str(thread["id"]),
        "Implement the approved feature now.",
    )

    question = next(
        artifact for artifact in prepared["artifacts"] if artifact["artifact_type"] == "QUESTION"
    )

    response = harness.client.post(
        f"/api/planning-artifacts/{question['id']}/resolve",
        json={"selected_option": "option_a"},
    )
    assert response.status_code == 200, response.text
    resolved = response.json()

    assert resolved["question"]["status"] == "RESOLVED"
    assert resolved["decision"]["artifact_type"] == "DECISION"
    assert resolved["decision"]["status"] == "RESOLVED"
    assert resolved["decision"]["content"]["question_artifact_id"] == question["id"]
    assert resolved["decision"]["content"]["selected_option"] == "option_a"
    assert resolved["decision"]["content"]["selected_value"] == (
        "Continue in read-only planning mode."
    )

    thread_after = harness.client.get(f"/api/composer/threads/{thread['id']}")
    assert thread_after.status_code == 200
    assert thread_after.json()["status"] == "ACTIVE"

    artifacts = harness.client.get(f"/api/composer/threads/{thread['id']}/artifacts")
    assert artifacts.status_code == 200
    assert {(artifact["artifact_type"], artifact["status"]) for artifact in artifacts.json()} >= {
        ("QUESTION", "RESOLVED"),
        ("DECISION", "RESOLVED"),
    }

    events = harness.client.get(f"/api/composer/threads/{thread['id']}/events")
    assert events.status_code == 200
    assert "planning.artifact.resolved" in {
        event["event_type"] for event in events.json()["events"]
    }

    database = harness.app.state.project_database
    with database.connection() as connection:
        audit = connection.execute(
            """
            SELECT action, target_type, target_id
            FROM audit_records
            WHERE action = 'PLANNING_DECISION_RECORDED'
            """
        ).fetchone()
        assert audit is not None
        assert audit["target_type"] == "PLANNING_ARTIFACT"
        assert audit["target_id"] == question["id"]

        assert connection.execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 0
        assert connection.execute("SELECT COUNT(*) FROM runs").fetchone()[0] == 0
        assert connection.execute("SELECT COUNT(*) FROM agent_runs").fetchone()[0] == 0
        assert connection.execute("SELECT COUNT(*) FROM workspaces").fetchone()[0] == 0
        assert connection.execute("SELECT COUNT(*) FROM events").fetchone()[0] == 0

    second = harness.client.post(
        f"/api/planning-artifacts/{question['id']}/resolve",
        json={"selected_option": "option_b"},
    )
    assert second.status_code == 409


def test_decision_queue_rejects_undeclared_option(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project("Decision Validation")
    thread = _new_thread(harness, project["id"], intent="RUN")
    prepared = _prepare(harness, str(thread["id"]), "Run the change now.")

    question = next(
        artifact for artifact in prepared["artifacts"] if artifact["artifact_type"] == "QUESTION"
    )

    response = harness.client.post(
        f"/api/planning-artifacts/{question['id']}/resolve",
        json={"selected_option": "option_z"},
    )
    assert response.status_code == 409
