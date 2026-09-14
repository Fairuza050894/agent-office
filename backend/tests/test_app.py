from fastapi.testclient import TestClient

from agent_office.main import create_app


def test_health_endpoint() -> None:
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_version_endpoint() -> None:
    client = TestClient(create_app())

    response = client.get("/version")

    assert response.status_code == 200

    payload = response.json()

    assert payload["name"] == "Agent Office"
    assert isinstance(payload["version"], str)
    assert payload["version"]


def test_openapi_metadata() -> None:
    client = TestClient(create_app())

    response = client.get("/openapi.json")

    assert response.status_code == 200

    payload = response.json()

    assert payload["info"]["title"] == "Agent Office"
