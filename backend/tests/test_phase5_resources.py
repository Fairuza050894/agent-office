from fastapi.testclient import TestClient

from agent_office.main import create_app


def test_operational_agent_profiles_are_exposed_without_executor_conflation() -> None:
    client = TestClient(create_app())

    response = client.get("/api/agent-profiles")

    assert response.status_code == 200
    profiles = response.json()
    assert profiles
    assert {"key", "name", "default_access_mode", "version", "status"} <= profiles[0].keys()
    assert "executor_id" not in profiles[0]


def test_registered_executor_detail_is_factual() -> None:
    client = TestClient(create_app())

    response = client.get("/api/executors")

    assert response.status_code == 200
    executors = response.json()
    assert len(executors) == 1

    executor = executors[0]
    assert executor["kind"] == "REFERENCE"
    assert executor["status"] == "AVAILABLE"
    assert executor["runtime_version"] == "1"
    assert executor["last_check"]
    assert executor["capabilities"]
    assert any(
        item["capability"] == "START_EXECUTION" and item["support"] == "SUPPORTED"
        for item in executor["capabilities"]
    )
    assert "FILE_WRITE: UNSUPPORTED" in executor["security_limitations"]
