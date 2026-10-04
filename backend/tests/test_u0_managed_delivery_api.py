"""HTTP regression coverage for real managed Git delivery."""

from __future__ import annotations

from conftest import HarnessFactory

from agent_office.domain import ChangeArea
from agent_office.infrastructure.executors import ReferenceScenario


def test_approve_and_deliver_api_uses_real_git_repository(
    harness_factory: HarnessFactory,
) -> None:
    """The public API must reach the real GitManagedResultDelivery adapter."""

    harness = harness_factory(ReferenceScenario.SUCCESS)
    project = harness.register_project("Managed Delivery API")
    run, started = harness.start_workflow(
        "bug-fix",
        changed_areas=[ChangeArea.BACKEND],
        project=project,
        task_title="Deliver verified candidate",
    )

    assert started["status"] == "COMPLETED"
    assert harness.run_by_id(run["id"])["status"] == "COMPLETED"

    response = harness.client.post(
        f"/api/runs/{run['id']}/result-review/approve-and-deliver",
        json={"note": "Accepted through the public result-review API."},
    )

    assert response.status_code == 200, response.text
    delivered = response.json()
    assert delivered["state"] == "DELIVERED"
    assert delivered["delivered_branch"].startswith(f"agent-office/{run['id']}/accepted-")
    assert len(delivered["delivered_commit"]) == 40

    repeated = harness.client.post(
        f"/api/runs/{run['id']}/result-review/approve-and-deliver",
        json={},
    )
    assert repeated.status_code == 200, repeated.text
    assert repeated.json()["delivered_branch"] == delivered["delivered_branch"]
    assert repeated.json()["delivered_commit"] == delivered["delivered_commit"]
