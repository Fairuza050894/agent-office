from __future__ import annotations

import sqlite3
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from agent_office.application.runs import OwnershipError
from agent_office.config import Settings
from agent_office.domain import ProjectId, RunId
from agent_office.main import create_app
from agent_office.persistence import SQLiteDatabase


def _create_git_repository(path: Path) -> None:
    path.mkdir(parents=True)
    subprocess.run(
        ["git", "init", "-q", "-b", "main"],
        cwd=path,
        check=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Agent Office Test"],
        cwd=path,
        check=True,
    )
    subprocess.run(
        ["git", "config", "user.email", "agent-office@example.invalid"],
        cwd=path,
        check=True,
    )
    (path / "README.md").write_text("# Test Repository\n")
    subprocess.run(
        ["git", "add", "README.md"],
        cwd=path,
        check=True,
    )
    subprocess.run(
        ["git", "commit", "-q", "-m", "initial"],
        cwd=path,
        check=True,
    )


def _settings(tmp_path: Path) -> Settings:
    return Settings(database_path=tmp_path / "agent-office.sqlite")


def _register_project(
    client: TestClient,
    tmp_path: Path,
    *,
    name: str,
) -> dict[str, object]:
    repository_path = tmp_path / f"repo-{name.lower().replace(' ', '-')}"
    _create_git_repository(repository_path)

    response = client.post(
        "/api/projects",
        json={
            "name": name,
            "repository_path": str(repository_path),
        },
    )

    assert response.status_code == 201
    return response.json()


def _create_task(
    client: TestClient,
    project_id: str,
    *,
    title: str = "Implement durable task",
) -> dict[str, object]:
    response = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": title,
            "objective": "Persist task ownership safely.",
            "constraints": "Do not modify unrelated repositories.",
        },
    )

    assert response.status_code == 201
    return response.json()


def _create_run(
    client: TestClient,
    task_id: str,
) -> dict[str, object]:
    response = client.post(
        f"/api/tasks/{task_id}/runs",
        json={},
    )

    assert response.status_code == 201
    return response.json()


def test_schema_v3_contains_task_and_run_ownership_constraints(
    tmp_path: Path,
) -> None:
    database = SQLiteDatabase(tmp_path / "schema.sqlite")
    database.initialize()

    assert database.current_schema_version() == 3

    with database.connection() as connection:
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }
        run_foreign_keys = connection.execute("PRAGMA foreign_key_list(runs)").fetchall()

    assert {"projects", "tasks", "runs"} <= tables

    task_ownership_pairs = {
        (row["from"], row["to"]) for row in run_foreign_keys if row["table"] == "tasks"
    }
    assert ("project_id", "project_id") in task_ownership_pairs
    assert ("task_id", "id") in task_ownership_pairs


def test_task_create_get_and_list_are_project_scoped_and_safe(
    tmp_path: Path,
) -> None:
    with TestClient(create_app(_settings(tmp_path))) as client:
        project_a = _register_project(client, tmp_path, name="Project A")
        project_b = _register_project(client, tmp_path, name="Project B")

        task = _create_task(client, str(project_a["id"]))

        assert task["project_id"] == project_a["id"]
        assert task["title"] == "Implement durable task"
        assert task["objective"] == "Persist task ownership safely."
        assert task["constraints"] == "Do not modify unrelated repositories."

        forbidden_fields = {
            "repository_path",
            "canonical_path",
            "git_common_dir",
        }
        assert forbidden_fields.isdisjoint(task)

        get_response = client.get(f"/api/tasks/{task['id']}")
        assert get_response.status_code == 200
        assert get_response.json() == task

        list_a = client.get(f"/api/projects/{project_a['id']}/tasks")
        list_b = client.get(f"/api/projects/{project_b['id']}/tasks")

        assert list_a.status_code == 200
        assert [item["id"] for item in list_a.json()] == [task["id"]]
        assert list_b.status_code == 200
        assert list_b.json() == []


def test_task_validation_unknown_and_malformed_resources_are_controlled(
    tmp_path: Path,
) -> None:
    with TestClient(create_app(_settings(tmp_path))) as client:
        project = _register_project(client, tmp_path, name="Validation Project")

        whitespace = client.post(
            f"/api/projects/{project['id']}/tasks",
            json={
                "title": "   ",
                "objective": "Valid objective",
            },
        )
        assert whitespace.status_code == 422

        unknown_project = client.post(
            f"/api/projects/{uuid4()}/tasks",
            json={
                "title": "Task",
                "objective": "Objective",
            },
        )
        assert unknown_project.status_code == 404

        assert client.get("/api/tasks/not-a-uuid").status_code == 422
        assert client.get(f"/api/tasks/{uuid4()}").status_code == 404


def test_multiple_runs_remain_independent_historical_records(
    tmp_path: Path,
) -> None:
    with TestClient(create_app(_settings(tmp_path))) as client:
        project = _register_project(client, tmp_path, name="Run History")
        task = _create_task(client, str(project["id"]))

        first = _create_run(client, str(task["id"]))
        second = _create_run(client, str(task["id"]))

        assert first["id"] != second["id"]
        assert first["task_id"] == task["id"]
        assert second["task_id"] == task["id"]
        assert first["project_id"] == project["id"]
        assert second["project_id"] == project["id"]
        assert first["status"] == "CREATED"
        assert second["status"] == "CREATED"

        response = client.get(f"/api/tasks/{task['id']}/runs")
        assert response.status_code == 200

        runs = response.json()
        assert len(runs) == 2
        assert {run["id"] for run in runs} == {first["id"], second["id"]}

        assert client.get(f"/api/runs/{first['id']}").json() == first
        assert client.get(f"/api/runs/{second['id']}").json() == second


def test_run_creation_is_denied_after_project_archive(
    tmp_path: Path,
) -> None:
    with TestClient(create_app(_settings(tmp_path))) as client:
        project = _register_project(client, tmp_path, name="Archived Project")
        task = _create_task(client, str(project["id"]))

        archive = client.post(
            f"/api/projects/{project['id']}/archive",
        )
        assert archive.status_code == 200
        assert archive.json()["status"] == "ARCHIVED"

        response = client.post(
            f"/api/tasks/{task['id']}/runs",
            json={},
        )
        assert response.status_code == 409

        historical_task = client.get(f"/api/tasks/{task['id']}")
        assert historical_task.status_code == 200


def test_run_unknown_and_malformed_resources_are_controlled(
    tmp_path: Path,
) -> None:
    with TestClient(create_app(_settings(tmp_path))) as client:
        assert client.post(f"/api/tasks/{uuid4()}/runs", json={}).status_code == 404
        assert client.get(f"/api/tasks/{uuid4()}/runs").status_code == 404
        assert client.get("/api/runs/not-a-uuid").status_code == 422
        assert client.get(f"/api/runs/{uuid4()}").status_code == 404


def test_application_rejects_cross_project_run_ownership(
    tmp_path: Path,
) -> None:
    app = create_app(_settings(tmp_path))

    with TestClient(app) as client:
        project_a = _register_project(client, tmp_path, name="Owner A")
        project_b = _register_project(client, tmp_path, name="Owner B")
        task = _create_task(client, str(project_a["id"]))
        run = _create_run(client, str(task["id"]))

        with pytest.raises(OwnershipError):
            app.state.run_service.validate_run_ownership(
                RunId.parse(str(run["id"])),
                ProjectId.parse(str(project_b["id"])),
            )


def test_database_rejects_cross_project_task_run_pair(
    tmp_path: Path,
) -> None:
    app = create_app(_settings(tmp_path))

    with TestClient(app) as client:
        project_a = _register_project(client, tmp_path, name="Database Owner A")
        project_b = _register_project(client, tmp_path, name="Database Owner B")
        task = _create_task(client, str(project_a["id"]))

        assert project_a["id"] != project_b["id"]

        now = datetime.now(UTC).isoformat()

        with pytest.raises(sqlite3.IntegrityError):
            with app.state.project_database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO runs (
                        id,
                        project_id,
                        task_id,
                        status,
                        requested_executor_id,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(uuid4()),
                        str(project_b["id"]),
                        str(task["id"]),
                        "CREATED",
                        None,
                        now,
                        now,
                    ),
                )


def test_task_and_run_survive_application_reopen(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)

    with TestClient(create_app(settings)) as client:
        project = _register_project(client, tmp_path, name="Restart Project")
        task = _create_task(client, str(project["id"]))
        first_run = _create_run(client, str(task["id"]))
        second_run = _create_run(client, str(task["id"]))

    with TestClient(create_app(settings)) as reopened:
        task_response = reopened.get(f"/api/tasks/{task['id']}")
        assert task_response.status_code == 200
        assert task_response.json()["project_id"] == project["id"]

        runs_response = reopened.get(f"/api/tasks/{task['id']}/runs")
        assert runs_response.status_code == 200

        reopened_runs = runs_response.json()
        assert len(reopened_runs) == 2
        assert {run["id"] for run in reopened_runs} == {
            first_run["id"],
            second_run["id"],
        }

        assert reopened.get(f"/api/runs/{first_run['id']}").status_code == 200
        assert reopened.get(f"/api/runs/{second_run['id']}").status_code == 200
