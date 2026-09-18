"""Phase 4B: durable Findings and remediation ownership.

A reviewer's blocking verdict is a successful execution with a blocking outcome.
That observation becomes a durable Finding, is attributed to the implementation
owner that must fix it, and is only resolved by evidence: an independent
re-review or an attributable human risk acceptance. None of these tests need a
real AI service.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from conftest import Harness, HarnessFactory

from agent_office.domain import (
    AgentAccessMode,
    ChangeArea,
    FindingCategory,
    FindingResolutionType,
    FindingSeverity,
    FindingStatus,
    ReviewVerdict,
)
from agent_office.infrastructure.executors import ReferenceScenario

#: Keys that would expose repository location if they ever appeared in a DTO.
FORBIDDEN_DTO_KEYS = ("repository_path", "canonical_path", "git_common_dir", "worktree_path")


def findings(harness: Harness, run_id: str) -> list[dict[str, Any]]:
    """Return the Run's Findings through the public API."""

    response = harness.client.get(f"/api/runs/{run_id}/findings")
    assert response.status_code == 200, response.text

    return response.json()["findings"]


def run_review_loop(
    harness_factory: HarnessFactory,
    scenario: ReferenceScenario,
    *,
    changed_areas: list[ChangeArea] | None = None,
) -> tuple[Harness, dict[str, Any]]:
    """Drive the bug-fix review loop and return the harness and final Run."""

    harness = harness_factory(scenario)
    run, _ = harness.start_workflow(
        "bug-fix",
        changed_areas=changed_areas if changed_areas is not None else [ChangeArea.BACKEND],
    )

    return harness, harness.run_by_id(run["id"])


# ----------------------------------------------------------------------
# Creation
# ----------------------------------------------------------------------


def test_blocking_review_creates_a_durable_finding(
    harness_factory: HarnessFactory,
) -> None:
    """A blocking verdict produces a Finding carrying its own provenance."""

    harness, run = run_review_loop(harness_factory, ReferenceScenario.REMEDIATION_SUCCESS)
    recorded = findings(harness, run["id"])

    # Both reviewers of the review stage report the same observation, and each
    # Finding stays traceable to the reviewer that raised it.
    assert len(recorded) == 2
    finding = recorded[0]

    assert finding["run_id"] == run["id"]
    assert finding["project_id"] == run["project_id"]
    assert finding["severity"] == FindingSeverity.BLOCKER
    assert finding["category"] == FindingCategory.SECURITY
    assert finding["blocks_completion"] is False  # resolved by the re-review
    assert finding["status"] == FindingStatus.RESOLVED
    assert finding["resolved_at"] is not None

    # Every Finding is traceable to a reviewers of this Run's review stage.
    reviewers = {agent["id"]: agent for agent in harness.agent_runs(run["id"])}

    for item in recorded:
        reviewer = reviewers[item["reviewer_agent_run_id"]]
        assert reviewer["stage_key"] == "REVIEW"
        assert reviewer["agent_profile_key"] in {"qa-reviewer", "security-reviewer"}

    assert all(item["reviewer_agent_run_id"] in reviewers for item in recorded)


def test_clean_review_creates_no_finding(harness_factory: HarnessFactory) -> None:
    """A clear review records no Finding at all — absence is the signal."""

    harness = harness_factory(ReferenceScenario.SUCCESS)
    run, _ = harness.start_workflow("bug-fix", changed_areas=[ChangeArea.BACKEND])

    assert findings(harness, run["id"]) == []
    assert harness.run_by_id(run["id"])["status"] == "COMPLETED"


def test_finding_events_are_recorded_once_per_observation(
    harness_factory: HarnessFactory,
) -> None:
    """Each Finding lifecycle change is an event, and none is duplicated."""

    harness, run = run_review_loop(harness_factory, ReferenceScenario.REMEDIATION_SUCCESS)
    names = [event["event_type"] for event in harness.events(run["id"], limit=200)]

    assert names.count("review.finding.created") == 2
    assert names.count("review.finding.remediating") == 2
    assert names.count("review.finding.resolved") == 2
    # The initial review and the independent re-review each started and resolved.
    assert names.count("review.started") == 2
    assert names.count("review.completed") == 2


# ----------------------------------------------------------------------
# Ownership
# ----------------------------------------------------------------------


def test_finding_is_attributed_to_the_implementation_owner(
    harness_factory: HarnessFactory,
) -> None:
    """The owner is the write-capable implementation AgentRun, never a reviewer."""

    harness, run = run_review_loop(harness_factory, ReferenceScenario.REMEDIATION_SUCCESS)
    finding = findings(harness, run["id"])[0]

    owner_id = finding["remediation_owner_agent_run_id"]
    assert owner_id is not None

    owner = next(agent for agent in harness.agent_runs(run["id"]) if agent["id"] == owner_id)

    assert owner["stage_key"] == "IMPLEMENTATION"
    assert owner["access_mode"] in {AgentAccessMode.WRITE, AgentAccessMode.BOUNDED_WRITE}
    assert owner["agent_profile_key"] == "backend-developer"

    # The reviewer that raised the Finding is never the owner.
    assert owner_id != finding["reviewer_agent_run_id"]


def test_resolution_is_attributed_to_the_re_review(
    harness_factory: HarnessFactory,
) -> None:
    """Resolution is attributed to the re-review, never to the fixing agent."""

    harness, run = run_review_loop(harness_factory, ReferenceScenario.REMEDIATION_SUCCESS)
    finding = findings(harness, run["id"])[0]

    assert finding["resolution_type"] == FindingResolutionType.REMEDIATED
    assert finding["resolution_summary"]

    resolver_id = finding["resolver_agent_run_id"]
    assert resolver_id is not None
    assert resolver_id != finding["remediation_owner_agent_run_id"]

    resolver = next(agent for agent in harness.agent_runs(run["id"]) if agent["id"] == resolver_id)
    assert resolver["stage_key"] == "REVIEW"
    assert resolver["review_verdict"] == ReviewVerdict.CLEAR


def test_ambiguous_ownership_blocks_instead_of_guessing(
    harness_factory: HarnessFactory,
) -> None:
    """Two required writers and a Finding naming neither leaves ownership unknown."""

    harness = harness_factory(ReferenceScenario.REMEDIATION_SUCCESS)
    workflow = create_workflow(
        harness,
        stages=[
            stage_request("DISCOVERY", 0, "explorer", AgentAccessMode.READ_ONLY),
            stage_request(
                "IMPLEMENTATION",
                1,
                "backend-developer",
                AgentAccessMode.WRITE,
                extra_assignments=[("frontend-developer", AgentAccessMode.WRITE)],
                depends_on=["DISCOVERY"],
            ),
        ],
        extra_stages=review_loop_requests(),
    )
    run = start_custom(harness, workflow)

    # Both writers are required, and the SECURITY category names neither, so the
    # Finding is left unowned.
    recorded = findings(harness, run["id"])
    assert len(recorded) == 1
    assert recorded[0]["remediation_owner_agent_run_id"] is None

    final = harness.run_by_id(run["id"])
    assert final["status"] == "BLOCKED"
    assert final["failure_code"] == "REMEDIATION_OWNER_UNKNOWN"


# ----------------------------------------------------------------------
# Resolution and completion
# ----------------------------------------------------------------------


def test_unresolved_blocker_prevents_completion(
    harness_factory: HarnessFactory,
) -> None:
    """A Run with an open blocking Finding cannot complete."""

    harness, run = run_review_loop(harness_factory, ReferenceScenario.REMEDIATION_FAILURE)

    # The failed remediation stage fails the Run; the obligation is never
    # satisfied by a Run that did not complete.
    assert run["status"] == "FAILED"
    assert run["status"] != "COMPLETED"

    open_findings = [item for item in findings(harness, run["id"]) if item["blocks_completion"]]
    assert len(open_findings) == 2
    assert open_findings[0]["status"] in {
        FindingStatus.OPEN,
        FindingStatus.REMEDIATING,
    }
    assert open_findings[0]["resolved_at"] is None


def test_resolved_finding_is_no_longer_blocking(
    harness_factory: HarnessFactory,
) -> None:
    """After the re-review clears it, the Run completes."""

    harness, run = run_review_loop(harness_factory, ReferenceScenario.REMEDIATION_SUCCESS)

    assert run["status"] == "COMPLETED"
    assert all(not item["blocks_completion"] for item in findings(harness, run["id"]))


# ----------------------------------------------------------------------
# Risk acceptance
# ----------------------------------------------------------------------


def test_accept_risk_is_an_attributable_operator_action(
    harness_factory: HarnessFactory,
) -> None:
    """Only the operator route can accept risk, and it is recorded as a user act."""

    harness, run = run_review_loop(harness_factory, ReferenceScenario.REMEDIATION_FAILURE)
    blocking = [item for item in findings(harness, run["id"]) if item["blocks_completion"]]
    assert len(blocking) == 2
    finding = blocking[0]

    response = harness.client.post(
        f"/api/findings/{finding['id']}/accept-risk",
        json={"reason": "Accepted for the MVP dogfood window by the operator."},
    )
    assert response.status_code == 200, response.text

    accepted = response.json()
    assert accepted["status"] == FindingStatus.ACCEPTED_RISK
    assert accepted["resolution_type"] == FindingResolutionType.ACCEPTED_RISK
    assert accepted["blocks_completion"] is False
    assert accepted["resolved_at"] is not None

    # The decision is attributable to a human control-plane action.
    audit = [
        record
        for record in harness.operator_audit(run["id"])
        if record["action"] == "FINDING_ACCEPTED_RISK"
    ]
    assert len(audit) == 1
    assert audit[0]["actor_type"] == "USER"


def test_accept_risk_requires_a_reason(harness_factory: HarnessFactory) -> None:
    """An unexplained risk acceptance is refused at the boundary."""

    harness, run = run_review_loop(harness_factory, ReferenceScenario.REMEDIATION_FAILURE)
    finding = findings(harness, run["id"])[0]

    response = harness.client.post(
        f"/api/findings/{finding['id']}/accept-risk",
        json={"reason": ""},
    )
    assert response.status_code == 422


def test_risk_cannot_be_accepted_twice(harness_factory: HarnessFactory) -> None:
    """A terminal Finding is not re-accepted."""

    harness, run = run_review_loop(harness_factory, ReferenceScenario.REMEDIATION_FAILURE)
    finding = findings(harness, run["id"])[0]

    body = {"reason": "First and only acceptance."}
    first = harness.client.post(f"/api/findings/{finding['id']}/accept-risk", json=body)
    assert first.status_code == 200

    second = harness.client.post(f"/api/findings/{finding['id']}/accept-risk", json=body)
    assert second.status_code == 409


def test_unknown_finding_is_not_found(harness_factory: HarnessFactory) -> None:
    harness = harness_factory(ReferenceScenario.SUCCESS)

    response = harness.client.get(f"/api/findings/{uuid4()}")
    assert response.status_code == 404


# ----------------------------------------------------------------------
# Durability and disclosure
# ----------------------------------------------------------------------


def test_findings_survive_a_restart(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """Findings are durable records, not execution-time projections."""

    database = tmp_path / "findings-restart.sqlite"

    first = harness_factory(
        ReferenceScenario.REMEDIATION_SUCCESS,
        database_path=database,
    )
    run, _ = first.start_workflow("bug-fix", changed_areas=[ChangeArea.BACKEND])
    original = findings(first, run["id"])

    second = harness_factory(
        ReferenceScenario.REMEDIATION_SUCCESS,
        database_path=database,
    )
    restored = findings(second, run["id"])

    assert restored == original


def test_finding_dto_discloses_no_filesystem_location(
    harness_factory: HarnessFactory,
) -> None:
    """A Finding names a repository-relative path at most, never a host path."""

    harness, run = run_review_loop(harness_factory, ReferenceScenario.REMEDIATION_SUCCESS)
    response = harness.client.get(f"/api/runs/{run['id']}/findings")
    payload = json.dumps(response.json())

    for key in FORBIDDEN_DTO_KEYS:
        assert key not in payload

    assert harness.tmp_path.as_posix() not in payload


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


def stage_request(
    key: str,
    order_hint: int,
    profile_key: str,
    access_mode: AgentAccessMode,
    *,
    extra_assignments: list[tuple[str, AgentAccessMode]] | None = None,
    depends_on: list[str] | None = None,
) -> dict[str, Any]:
    assignments = [{"profile_key": profile_key, "access_mode": access_mode.value, "required": True}]

    for extra_key, extra_mode in extra_assignments or []:
        assignments.append(
            {"profile_key": extra_key, "access_mode": extra_mode.value, "required": True}
        )

    return {
        "key": key,
        "name": key.title(),
        "order_hint": order_hint,
        "assignments": assignments,
        "depends_on": depends_on or [],
    }


def review_loop_requests() -> list[dict[str, Any]]:
    """The standard review/remediation pair of the bug-fix loop."""

    return [
        stage_request(
            "REVIEW",
            2,
            "qa-reviewer",
            AgentAccessMode.READ_ONLY,
            depends_on=["IMPLEMENTATION"],
        ),
        stage_request(
            "REMEDIATION",
            3,
            "backend-developer",
            AgentAccessMode.WRITE,
            depends_on=["REVIEW"],
        ),
    ]


def create_workflow(
    harness: Harness,
    *,
    stages: list[dict[str, Any]],
    extra_stages: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Create a custom WorkflowDefinition through the public API."""

    body = {
        "key": f"phase4b-{uuid4().hex[:8]}",
        "name": "Phase 4B Flow",
        "stages": [*stages, *(extra_stages or [])],
    }

    response = harness.client.post("/api/workflows", json=body)
    assert response.status_code == 201, response.text

    return response.json()


def start_custom(harness: Harness, workflow: dict[str, Any]) -> dict[str, Any]:
    """Start a Run for a custom workflow and return the final Run."""

    project = harness.register_project("Phase 4B Project")
    task = harness.create_task(
        project["id"],
        title="Phase 4B Task",
        requested_workflow_id=workflow["id"],
    )
    run = harness.create_run(task["id"])
    harness.start_run(run["id"], changed_areas=[ChangeArea.BACKEND])

    return harness.run_by_id(run["id"])


def test_custom_workflow_declares_no_checks(harness_factory: HarnessFactory) -> None:
    """The helper above declares no verification checks, so nothing is run."""

    harness = harness_factory(ReferenceScenario.SUCCESS)
    workflow = create_workflow(
        harness,
        stages=[
            stage_request("DISCOVERY", 0, "explorer", AgentAccessMode.READ_ONLY),
            stage_request(
                "IMPLEMENTATION",
                1,
                "backend-developer",
                AgentAccessMode.WRITE,
                depends_on=["DISCOVERY"],
            ),
        ],
    )

    assert workflow["verification_checks"] == []
