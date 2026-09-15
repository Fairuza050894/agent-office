"""HTTP integration tests for Project Registry."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from agent_office.config import Settings
from agent_office.main import create_app


def _git(repository: Path, *arguments: str) -> None:
    subprocess.run(
        ["git", "-C", str(repository), *arguments],
        check=True,
        capture_output=True,
        text=True,
    )


@pytest.fixture
def git_repository(tmp_path: Path) -> Path:
    repository = tmp_path / "api project"
    repository.mkdir()

    subprocess.run(
        ["git", "init", "-b", "main", str(repository)],
        check=True,
        capture_output=True,
        text=True,
    )

    _git(repository, "config", "user.name", "Agent Office Tests")
    _git(
        repository,
        "config",
        "user.email",
        "agent-office@example.invalid",
    )

    (repository / "README.md").write_text("# API Project\n")
    _git(repository, "add", "README.md")
    _git(repository, "commit", "-m", "initial")

    return repository


def _client(tmp_path: Path) -> tuple[TestClient, Path]:
    database_path = tmp_path / "api.sqlite"

    settings = Settings(
        database_path=database_path,
    )

    return TestClient(create_app(settings)), database_path


def test_health_does_not_create_project_database(
    tmp_path: Path,
) -> None:
    client, database_path = _client(tmp_path)

    response = client.get("/health")

    assert response.status_code == 200
    assert not database_path.exists()


def test_register_project_returns_safe_dto(
    tmp_path: Path,
    git_repository: Path,
) -> None:
    client, database_path = _client(tmp_path)

    response = client.post(
        "/api/projects",
        json={
            "name": "API Project",
            "repository_path": str(git_repository),
        },
    )

    assert response.status_code == 201
    assert database_path.exists()

    payload = response.json()

    assert payload["name"] == "API Project"
    assert payload["repository"] == {
        "name": git_repository.name,
    }
    assert payload["default_branch"] == "main"
    assert payload["status"] == "ACTIVE"
    assert payload["preferred_executor_id"] is None
    assert payload["default_workflow_id"] is None
    assert payload["archived_at"] is None

    assert "repository_path" not in payload
    assert "canonical_path" not in payload
    assert "git_common_dir" not in payload

    assert str(git_repository.resolve()) not in response.text


def test_list_and_get_project(
    tmp_path: Path,
    git_repository: Path,
) -> None:
    client, _ = _client(tmp_path)

    created = client.post(
        "/api/projects",
        json={
            "name": "API Project",
            "repository_path": str(git_repository),
        },
    )
    project_id = created.json()["id"]

    listed = client.get("/api/projects")
    loaded = client.get(f"/api/projects/{project_id}")

    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == project_id

    assert loaded.status_code == 200
    assert loaded.json()["id"] == project_id


def test_archive_project(
    tmp_path: Path,
    git_repository: Path,
) -> None:
    client, _ = _client(tmp_path)

    created = client.post(
        "/api/projects",
        json={
            "name": "Archive Project",
            "repository_path": str(git_repository),
        },
    )
    project_id = created.json()["id"]

    archived = client.post(f"/api/projects/{project_id}/archive")

    assert archived.status_code == 200
    assert archived.json()["status"] == "ARCHIVED"
    assert archived.json()["archived_at"] is not None

    loaded = client.get(f"/api/projects/{project_id}")

    assert loaded.json()["status"] == "ARCHIVED"


def test_duplicate_repository_returns_conflict(
    tmp_path: Path,
    git_repository: Path,
) -> None:
    client, _ = _client(tmp_path)

    payload = {
        "name": "First",
        "repository_path": str(git_repository),
    }

    first = client.post("/api/projects", json=payload)
    duplicate = client.post(
        "/api/projects",
        json={
            **payload,
            "name": "Duplicate",
        },
    )

    assert first.status_code == 201
    assert duplicate.status_code == 409


def test_invalid_repository_returns_bad_request(
    tmp_path: Path,
) -> None:
    client, _ = _client(tmp_path)
    missing = tmp_path / "does-not-exist"

    response = client.post(
        "/api/projects",
        json={
            "name": "Invalid",
            "repository_path": str(missing),
        },
    )

    assert response.status_code == 400
    assert str(missing) not in response.text


def test_unknown_project_returns_not_found(
    tmp_path: Path,
) -> None:
    client, _ = _client(tmp_path)

    response = client.get("/api/projects/55555555-5555-4555-8555-555555555555")

    assert response.status_code == 404


def test_malformed_project_id_returns_validation_error(
    tmp_path: Path,
) -> None:
    client, _ = _client(tmp_path)

    response = client.get("/api/projects/not-a-uuid")

    assert response.status_code == 422


def test_projects_persist_across_app_recreation(
    tmp_path: Path,
    git_repository: Path,
) -> None:
    database_path = tmp_path / "persistent-api.sqlite"
    settings = Settings(database_path=database_path)

    first_client = TestClient(create_app(settings))

    created = first_client.post(
        "/api/projects",
        json={
            "name": "Persistent Project",
            "repository_path": str(git_repository),
        },
    )

    assert created.status_code == 201

    second_client = TestClient(create_app(settings))
    listed = second_client.get("/api/projects")

    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["name"] == "Persistent Project"


def test_project_routes_are_present_in_openapi(
    tmp_path: Path,
) -> None:
    client, _ = _client(tmp_path)

    response = client.get("/openapi.json")
    paths = response.json()["paths"]

    assert "/api/projects" in paths
    assert "/api/projects/{project_id}" in paths
    assert "/api/projects/{project_id}/archive" in paths


def test_project_query_responses_do_not_leak_absolute_paths(
    tmp_path: Path,
    git_repository: Path,
) -> None:
    client, _ = _client(tmp_path)

    created = client.post(
        "/api/projects",
        json={
            "name": "Safe Project",
            "repository_path": str(git_repository),
        },
    )
    project_id = created.json()["id"]

    listed = client.get("/api/projects")
    loaded = client.get(f"/api/projects/{project_id}")

    absolute_path = str(git_repository.resolve())

    assert absolute_path not in listed.text
    assert absolute_path not in loaded.text
    assert "canonical_path" not in listed.text
    assert "canonical_path" not in loaded.text
    assert "git_common_dir" not in listed.text
    assert "git_common_dir" not in loaded.text
