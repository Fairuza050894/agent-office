"""Phase 3A orchestration semantics: fan-out, fan-in, conditions, completion."""

from __future__ import annotations

from typing import Any

from conftest import Harness, HarnessFactory

from agent_office.domain import ChangeArea
from agent_office.infrastructure.executors import ReferenceScenario


def _create_workflow(
    harness: Harness,
    *,
    key: str,
    stages: list[dict[str, Any]],
) -> dict[str, Any]:
    response = harness.client.post(
        "/api/workflows",
        json={"key": key, "name": key.title(), "stages": stages},
    )
    assert response.status_code == 201, response.text

    return response.json()


def test_discovery_fan_out_creates_separate_agent_runs(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])

    harness.start_run(run["id"])

    discovery = [
        agent_run
        for agent_run in harness.agent_runs(run["id"])
        if agent_run["stage_key"] == "DISCOVERY"
    ]

    assert {agent_run["agent_profile_key"] for agent_run in discovery} == {
        "architect",
        "explorer",
    }
    assert len({agent_run["id"] for agent_run in discovery}) == 2
    assert all(agent_run["status"] == "COMPLETED" for agent_run in discovery)


def test_fan_in_holds_downstream_stage_until_all_upstream_stages_complete(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])

    harness.start_run(run["id"])

    event_types = [event["event_type"] for event in harness.events(run["id"])]
    stages = {
        event["payload"].get("stage_key"): event["event_type"]
        for event in harness.events(run["id"])
        if event["event_type"] in {"stage.ready", "stage.completed", "stage.started"}
    }

    assert event_types.index("stage.ready") < event_types.index("stage.started")
    assert stages["DISCOVERY"] in {"stage.completed", "stage.started"}

    discovery_completed = next(
        index
        for index, event in enumerate(harness.events(run["id"]))
        if event["event_type"] == "stage.completed" and event["payload"]["stage_key"] == "DISCOVERY"
    )
    implementation_ready = next(
        index
        for index, event in enumerate(harness.events(run["id"]))
        if event["event_type"] == "stage.ready"
        and event["payload"]["stage_key"] == "IMPLEMENTATION"
    )

    assert discovery_completed < implementation_ready

    # No downstream assignment existed before the upstream stage completed.
    first_implementation_agent = next(
        index
        for index, event in enumerate(harness.events(run["id"]))
        if event["event_type"] == "agent.created"
        and event["payload"]["stage_key"] == "IMPLEMENTATION"
    )
    assert discovery_completed < first_implementation_agent

    assert harness.agent_statuses(run["id"], "IMPLEMENTATION") == ["COMPLETED", "COMPLETED"]


def test_conditional_stage_is_skipped_with_a_durable_reason(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    workflow = harness.workflow_by_key("bug-fix")
    project = harness.register_project()
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])

    started = harness.start_run(run["id"], changed_areas=[ChangeArea.BACKEND])

    assert started["status"] == "COMPLETED"

    documentation = next(
        stage for stage in harness.stages(run["id"]) if stage["stage_key"] == "DOCUMENTATION"
    )
    assert documentation["status"] == "SKIPPED"
    assert documentation["reason_code"] == "CONDITION_FALSE"
    assert documentation["reason_summary"]
    assert documentation["completed_at"] is not None

    assert harness.agent_statuses(run["id"], "DOCUMENTATION") == []

    skipped = {
        event["payload"]["stage_key"]: event
        for event in harness.events(run["id"])
        if event["event_type"] == "stage.skipped"
    }
    assert skipped["DOCUMENTATION"]["payload"]["condition"] == "IF_UI_CHANGED"

    # Remediation is likewise validly skipped when review reports no blocker.
    remediation = next(
        stage for stage in harness.stages(run["id"]) if stage["stage_key"] == "REMEDIATION"
    )
    assert remediation["status"] == "SKIPPED"
    assert remediation["reason_code"] == "NOT_APPLICABLE"


def test_conditional_stage_executes_when_its_condition_is_true(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    workflow = harness.workflow_by_key("bug-fix")
    project = harness.register_project()
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])

    started = harness.start_run(run["id"], changed_areas=[ChangeArea.UI])

    assert started["status"] == "COMPLETED"
    assert harness.stage_status(run["id"], "DOCUMENTATION") == "COMPLETED"
    assert harness.agent_statuses(run["id"], "DOCUMENTATION") == ["COMPLETED"]


def test_unevaluable_condition_blocks_instead_of_silently_skipping(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    workflow = harness.workflow_by_key("bug-fix")
    project = harness.register_project()
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])

    started = harness.start_run(run["id"])

    assert started["status"] == "BLOCKED"
    assert started["failure_code"] == "CONDITION_UNKNOWN"

    documentation = next(
        stage for stage in harness.stages(run["id"]) if stage["stage_key"] == "DOCUMENTATION"
    )
    assert documentation["status"] == "BLOCKED"
    assert documentation["reason_code"] == "CONDITION_UNKNOWN"


def test_required_conditional_stage_skip_does_not_block_completion(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    workflow = _create_workflow(
        harness,
        key="required-conditional-flow",
        stages=[
            {
                "key": "DISCOVERY",
                "name": "Discovery",
                "order_hint": 0,
                "assignments": [{"profile_key": "explorer"}],
            },
            {
                "key": "DOCUMENTATION",
                "name": "Conditional Documentation",
                "order_hint": 1,
                "depends_on": ["DISCOVERY"],
                "required": True,
                "condition": "IF_UI_CHANGED",
                "assignments": [{"profile_key": "documentation-writer"}],
            },
        ],
    )
    project = harness.register_project()
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])

    started = harness.start_run(run["id"], changed_areas=[ChangeArea.BACKEND])

    # A required node that was validly skipped by workflow condition still
    # satisfies the completion gate.
    assert started["status"] == "COMPLETED"
    assert harness.stage_status(run["id"], "DOCUMENTATION") == "SKIPPED"


def test_completed_agent_run_does_not_by_itself_complete_the_run(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    workflow = _create_workflow(
        harness,
        key="two-stage-flow",
        stages=[
            {
                "key": "DISCOVERY",
                "name": "Discovery",
                "order_hint": 0,
                "assignments": [{"profile_key": "explorer"}],
            },
            {
                "key": "DOCUMENTATION",
                "name": "Documentation",
                "order_hint": 1,
                "depends_on": ["DISCOVERY"],
                "condition": "IF_UI_CHANGED",
                "assignments": [{"profile_key": "documentation-writer"}],
            },
        ],
    )
    project = harness.register_project()
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])

    started = harness.start_run(run["id"])

    assert harness.agent_statuses(run["id"], "DISCOVERY") == ["COMPLETED"]
    assert harness.stage_status(run["id"], "DISCOVERY") == "COMPLETED"

    # A completed AgentRun never implies a completed Run.
    assert started["status"] == "BLOCKED"
    assert started["status"] != "COMPLETED"


def test_optional_assignment_failure_does_not_fail_the_run(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory(ReferenceScenario.RUN_FAILURE)
    workflow = _create_workflow(
        harness,
        key="optional-only-flow",
        stages=[
            {
                "key": "DISCOVERY",
                "name": "Discovery",
                "order_hint": 0,
                "assignments": [{"profile_key": "explorer", "required": False}],
            }
        ],
    )
    project = harness.register_project()
    task = harness.create_task(project["id"], requested_workflow_id=workflow["id"])
    run = harness.create_run(task["id"])

    started = harness.start_run(run["id"])

    # The optional assignment genuinely failed and is recorded as such, but a
    # non-required assignment failure is not a Run failure.
    assert harness.agent_statuses(run["id"], "DISCOVERY") == ["FAILED"]
    assert harness.stage_status(run["id"], "DISCOVERY") == "COMPLETED"
    assert started["status"] == "COMPLETED"


def test_run_phase_projection_follows_active_stages(harness_factory: HarnessFactory) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])

    harness.start_run(run["id"])

    event_types = [event["event_type"] for event in harness.events(run["id"])]

    assert "run.planning.started" in event_types
    assert "run.ready" in event_types
    assert "run.started" in event_types
    assert "run.reviewing" in event_types
    assert event_types[-1] == "run.completed"


def test_run_completion_event_records_completion_mode(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])

    harness.start_run(run["id"])

    completed = [
        event for event in harness.events(run["id"]) if event["event_type"] == "run.completed"
    ]

    assert len(completed) == 1
    payload = completed[0]["payload"]
    assert payload["completion_mode"] == "READY_FOR_REVIEW"
    # Remediation is validly skipped because review reported no blocker.
    assert payload["skipped_stages"] == 1
    assert payload["completed_stages"] == 5

    # No merge or deploy status is claimed anywhere.
    assert "merge_status" not in payload
    assert "deployed" not in str(payload).lower()


def test_orchestration_is_deterministic_for_the_same_inputs(
    harness_factory: HarnessFactory,
) -> None:
    def event_sequence() -> list[str]:
        harness = harness_factory()
        project = harness.register_project()
        task = harness.create_task(project["id"])
        run = harness.create_run(task["id"])
        harness.start_run(run["id"])

        return [
            f"{event['event_type']}:{event['payload'].get('stage_key', '')}"
            for event in harness.events(run["id"])
        ]

    first = event_sequence()
    second = event_sequence()

    assert first == second
    assert len(first) > 10


def test_agent_profile_and_executor_remain_distinct_concepts(
    harness_factory: HarnessFactory,
) -> None:
    harness = harness_factory()
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])

    harness.start_run(run["id"])

    created = [
        event for event in harness.events(run["id"]) if event["event_type"] == "agent.created"
    ]

    assert created
    for event in created:
        assert event["payload"]["agent_profile_key"] in {
            "architect",
            "explorer",
            "backend-developer",
            "frontend-developer",
            "qa-reviewer",
            "security-reviewer",
            "ux-reviewer",
            "verifier",
            "documentation-writer",
        }
        # Executor identity is a separate dimension from the agent role.
        assert event["payload"]["executor_id"]
        assert event["payload"]["agent_profile_key"] != event["payload"]["executor_id"]
