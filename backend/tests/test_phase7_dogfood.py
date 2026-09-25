"""Phase 7 multi-project and second-project dogfood acceptance.

The production Codex adapter is exercised with a deterministic local CLI stand-in
so CI proves the same ExecutorAdapter, Workspace, Event, and verification paths
without consuming network access, credentials, or provider quota.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient

from agent_office.config import Settings
from agent_office.domain import ExecutionStatus
from agent_office.infrastructure.executors.codex import CODEX_EXECUTOR_ID
from agent_office.main import create_app
from conftest import ScriptedExecutor, registry_for as make_test_registry


def _git(repository: Path, *arguments: str) -> str:
    return subprocess.run(
        ["git", *arguments],
        cwd=repository,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def _repository(path: Path, files: dict[str, str]) -> Path:
    path.mkdir(parents=True)
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=path, check=True)
    _git(path, "config", "user.name", "Agent Office Phase 7 Test")
    _git(path, "config", "user.email", "phase7@example.invalid")

    for relative, source in files.items():
        target = path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(source)

    _git(path, "add", ".")
    _git(path, "commit", "-q", "-m", "initial")
    return path


def _fake_codex(path: Path) -> Path:
    executable = path / "codex"
    executable.write_text(
        """#!/usr/bin/env python3
import hashlib
import json
import os
import pathlib
import sys

args = sys.argv[1:]

if args == ["--version"]:
    print("codex-cli phase7-dogfood-test")
    raise SystemExit(0)

if args == ["login", "status"]:
    print("Logged in")
    raise SystemExit(0)

if not args or args[0] != "exec":
    raise SystemExit(2)

prompt = sys.stdin.read()
stage = next(
    (
        line.split(":", 1)[1].strip()
        for line in prompt.splitlines()
        if line.startswith("Workflow stage:")
    ),
    "",
)

if stage == "IMPLEMENTATION":
    if "phase7-docs.md" in prompt:
        pathlib.Path("phase7-docs.md").write_text(
            "# Phase 7 dogfood\\n\\nSecond-project isolation verified.\\n"
        )
    elif "calculator.py" in prompt:
        calculator = pathlib.Path("calculator.py")
        source = calculator.read_text()
        if "return a - b" not in source:
            raise SystemExit(4)
        calculator.write_text(source.replace("return a - b", "return a + b"))

session_seed = f"{os.getcwd()}|{stage}|{prompt}".encode()
thread_id = "phase7-" + hashlib.sha256(session_seed).hexdigest()[:24]
print(json.dumps({"type": "thread.started", "thread_id": thread_id}), flush=True)
print(json.dumps({"type": "turn.started"}), flush=True)
print(json.dumps({"type": "turn.completed"}), flush=True)
raise SystemExit(0)
"""
    )
    executable.chmod(0o755)
    return executable


def _json(response: Any) -> Any:
    assert response.status_code < 300, response.text
    return response.json()


def _register_project(client: TestClient, *, name: str, repository: Path) -> dict[str, Any]:
    return _json(
        client.post(
            "/api/projects",
            json={"name": name, "repository_path": str(repository)},
        )
    )


def _create_workflow(
    client: TestClient,
    *,
    key: str,
    stages: list[dict[str, Any]],
    checks: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return _json(
        client.post(
            "/api/workflows",
            json={
                "key": key,
                "name": key.replace("-", " ").title(),
                "description": "Phase 7 dogfood workflow.",
                "status": "ACTIVE",
                "stages": stages,
                "verification_checks": checks or [],
            },
        )
    )


def _run(
    client: TestClient,
    *,
    project_id: str,
    workflow_id: str,
    title: str,
    objective: str,
    executor_id: str,
) -> dict[str, Any]:
    task = _json(
        client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": title,
                "objective": objective,
                "requested_workflow_id": workflow_id,
                "requested_executor_id": executor_id,
            },
        )
    )
    run = _json(
        client.post(
            f"/api/tasks/{task['id']}/runs",
            json={"requested_executor_id": executor_id},
        )
    )
    started = _json(client.post(f"/api/runs/{run['id']}/start", json={}))

    terminal_statuses = {"COMPLETED", "FAILED", "BLOCKED", "CANCELLED"}
    for _ in range(20):
        if started["status"] in terminal_statuses:
            break
        started = _json(client.post(f"/api/runs/{run['id']}/reconcile"))

    return started


def _workspace_evidence(
    client: TestClient,
    run_id: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    workspaces = _json(client.get(f"/api/runs/{run_id}/workspaces"))
    statuses = [
        _json(client.get(f"/api/workspaces/{workspace['id']}/status"))
        for workspace in workspaces
    ]
    return workspaces, statuses


def test_two_unrelated_projects_dogfood_through_reference_and_codex_configuration(
    tmp_path: Path,
) -> None:
    docs_repository = _repository(
        tmp_path / "docs-project",
        {"README.md": "# Unrelated docs repository\n"},
    )
    app_repository = _repository(
        tmp_path / "app-project",
        {
            "calculator.py": "def add(a: int, b: int) -> int:\n    return a - b\n",
            "test_calculator.py": (
                "from calculator import add\n\n"
                "if add(2, 3) != 5:\n"
                "    raise SystemExit(1)\n"
            ),
        },
    )
    fake_codex = _fake_codex(tmp_path)
    docs_head = _git(docs_repository, "rev-parse", "HEAD")
    app_head = _git(app_repository, "rev-parse", "HEAD")

    data_root = tmp_path / "agent-office"
    app = create_app(
        Settings(
            data_root=data_root,
            artifact_root=data_root / "artifacts",
            workspace_root=data_root / "workspaces",
            database_path=data_root / "agent-office.sqlite",
            codex_enabled=True,
            codex_cli_path=str(fake_codex),
            codex_probe_timeout_seconds=1.0,
            codex_start_timeout_seconds=1.0,
            codex_cancel_timeout_seconds=1.0,
        )
    )

    with TestClient(app) as client:
        executors = _json(client.get("/api/executors"))
        executor_kinds = {item["kind"] for item in executors}
        assert {"REFERENCE", "CODEX"} <= executor_kinds

        docs_project = _register_project(
            client,
            name="Phase 7 Docs Dogfood",
            repository=docs_repository,
        )
        app_project = _register_project(
            client,
            name="Phase 7 App Dogfood",
            repository=app_repository,
        )
        assert docs_project["id"] != app_project["id"]

        docs_workflow = _create_workflow(
            client,
            key=f"phase7-docs-{uuid4().hex[:8]}",
            stages=[
                {
                    "key": "IMPLEMENTATION",
                    "name": "Documentation change",
                    "order_hint": 0,
                    "assignments": [
                        {
                            "profile_key": "documentation-writer",
                            "access_mode": "BOUNDED_WRITE",
                            "required": True,
                        }
                    ],
                    "depends_on": [],
                    "execution_mode": "SEQUENTIAL",
                    "required": True,
                    "condition": "ALWAYS",
                }
            ],
        )
        app_workflow = _create_workflow(
            client,
            key=f"phase7-app-{uuid4().hex[:8]}",
            stages=[
                {
                    "key": "DISCOVERY",
                    "name": "Explorer",
                    "order_hint": 0,
                    "assignments": [
                        {
                            "profile_key": "explorer",
                            "access_mode": "READ_ONLY",
                            "required": True,
                        }
                    ],
                    "depends_on": [],
                    "execution_mode": "SEQUENTIAL",
                    "required": True,
                    "condition": "ALWAYS",
                },
                {
                    "key": "IMPLEMENTATION",
                    "name": "Developer",
                    "order_hint": 1,
                    "assignments": [
                        {
                            "profile_key": "backend-developer",
                            "access_mode": "WRITE",
                            "required": True,
                        }
                    ],
                    "depends_on": ["DISCOVERY"],
                    "execution_mode": "SEQUENTIAL",
                    "required": True,
                    "condition": "ALWAYS",
                },
                {
                    "key": "REVIEW",
                    "name": "QA",
                    "order_hint": 2,
                    "assignments": [
                        {
                            "profile_key": "qa-reviewer",
                            "access_mode": "READ_ONLY",
                            "required": True,
                        }
                    ],
                    "depends_on": ["IMPLEMENTATION"],
                    "execution_mode": "SEQUENTIAL",
                    "required": True,
                    "condition": "ALWAYS",
                },
                {
                    "key": "VERIFICATION",
                    "name": "Verification",
                    "order_hint": 3,
                    "assignments": [
                        {
                            "profile_key": "verifier",
                            "access_mode": "READ_ONLY",
                            "required": True,
                        }
                    ],
                    "depends_on": ["REVIEW"],
                    "execution_mode": "SEQUENTIAL",
                    "required": True,
                    "condition": "ALWAYS",
                },
            ],
            checks=[
                {
                    "key": "calculator-regression",
                    "check_type": "TEST",
                    "executable": "python3",
                    "arguments": ["-B", "test_calculator.py"],
                    "required": True,
                }
            ],
        )

        docs_run = _run(
            client,
            project_id=docs_project["id"],
            workflow_id=docs_workflow["id"],
            title="Phase 7 docs-only dogfood",
            objective=(
                "Create phase7-docs.md containing a concise Phase 7 dogfood note. "
                "Do not modify any other file."
            ),
            executor_id=str(CODEX_EXECUTOR_ID),
        )
        app_run = _run(
            client,
            project_id=app_project["id"],
            workflow_id=app_workflow["id"],
            title="Phase 7 unrelated application bug fix",
            objective=(
                "Fix calculator.py so add(2, 3) returns 5. Preserve test_calculator.py "
                "and let Agent Office verification execute it."
            ),
            executor_id=str(CODEX_EXECUTOR_ID),
        )

        assert docs_run["status"] == "COMPLETED"
        assert app_run["status"] == "COMPLETED"
        assert docs_run["project_id"] == docs_project["id"]
        assert app_run["project_id"] == app_project["id"]
        assert docs_run["id"] != app_run["id"]

        docs_agents = _json(client.get(f"/api/runs/{docs_run['id']}/agents"))
        app_agents = _json(client.get(f"/api/runs/{app_run['id']}/agents"))
        assert {agent["project_id"] for agent in docs_agents} == {docs_project["id"]}
        assert {agent["project_id"] for agent in app_agents} == {app_project["id"]}
        assert {agent["executor_id"] for agent in docs_agents + app_agents} == {
            str(CODEX_EXECUTOR_ID)
        }
        assert {agent["stage_key"] for agent in app_agents} == {
            "DISCOVERY",
            "IMPLEMENTATION",
            "REVIEW",
            "VERIFICATION",
        }

        docs_events = _json(client.get(f"/api/runs/{docs_run['id']}/events"))["events"]
        app_events = _json(client.get(f"/api/runs/{app_run['id']}/events"))["events"]
        assert {event["project_id"] for event in docs_events} == {docs_project["id"]}
        assert {event["project_id"] for event in app_events} == {app_project["id"]}
        assert not {event["id"] for event in docs_events} & {event["id"] for event in app_events}

        docs_workspaces, docs_statuses = _workspace_evidence(client, docs_run["id"])
        app_workspaces, app_statuses = _workspace_evidence(client, app_run["id"])
        assert docs_workspaces and app_workspaces
        assert {workspace["project_id"] for workspace in docs_workspaces} == {
            docs_project["id"]
        }
        assert {workspace["project_id"] for workspace in app_workspaces} == {
            app_project["id"]
        }
        assert not {workspace["id"] for workspace in docs_workspaces} & {
            workspace["id"] for workspace in app_workspaces
        }

        docs_changed = {
            path
            for item in docs_statuses
            for path in (
                (item["change_summary"] or {}).get("added_paths", [])
                + (item["change_summary"] or {}).get("modified_paths", [])
                + (item["change_summary"] or {}).get("untracked_paths", [])
            )
        }
        app_changed = {
            path
            for item in app_statuses
            for path in (
                (item["change_summary"] or {}).get("added_paths", [])
                + (item["change_summary"] or {}).get("modified_paths", [])
                + (item["change_summary"] or {}).get("untracked_paths", [])
            )
        }
        assert "phase7-docs.md" in docs_changed
        assert "calculator.py" in app_changed

        evidence = _json(client.get(f"/api/runs/{app_run['id']}/evidence"))
        regression = next(
            item
            for item in evidence
            if item["metadata"].get("check_key") == "calculator-regression"
        )
        assert regression["kind"] == "TEST_RESULT"
        assert regression["status"] == "AVAILABLE"
        assert regression["metadata"]["command_status"] == "PASSED"

        findings = _json(client.get(f"/api/runs/{app_run['id']}/findings"))
        assert findings["open_blockers"] == 0

        with app.state.project_database.connection() as connection:
            rows = connection.execute(
                """
                SELECT run_id, executor_session_ref_json
                FROM agent_runs
                WHERE run_id IN (?, ?)
                  AND executor_session_ref_json IS NOT NULL
                """,
                (docs_run["id"], app_run["id"]),
            ).fetchall()

        sessions: dict[str, set[str]] = {docs_run["id"]: set(), app_run["id"]: set()}
        for row in rows:
            document = json.loads(row["executor_session_ref_json"])
            sessions[row["run_id"]].add(document["opaque_session_id"])

        assert sessions[docs_run["id"]]
        assert sessions[app_run["id"]]
        assert sessions[docs_run["id"]].isdisjoint(sessions[app_run["id"]])

    assert _git(docs_repository, "rev-parse", "HEAD") == docs_head
    assert _git(app_repository, "rev-parse", "HEAD") == app_head
    assert _git(docs_repository, "status", "--porcelain") == ""
    assert _git(app_repository, "status", "--porcelain") == ""
    assert not (docs_repository / "phase7-docs.md").exists()
    assert "return a - b" in (app_repository / "calculator.py").read_text()


def test_project_b_can_complete_while_project_a_remains_active(
    tmp_path: Path,
) -> None:
    executor_a = ScriptedExecutor(
        executor_id="00000000-0000-4000-8000-000000000071",
        session_status=ExecutionStatus.WAITING,
    )
    executor_b = ScriptedExecutor(
        executor_id="00000000-0000-4000-8000-000000000072",
        session_status=ExecutionStatus.COMPLETED,
    )
    data_root = tmp_path / "concurrent-agent-office"
    app = create_app(
        Settings(
            data_root=data_root,
            artifact_root=data_root / "artifacts",
            workspace_root=data_root / "workspaces",
            database_path=data_root / "agent-office.sqlite",
        ),
        executor_registry=make_test_registry(executor_a, executor_b),
    )

    repository_a = _repository(tmp_path / "concurrent-a", {"README.md": "# A\n"})
    repository_b = _repository(tmp_path / "concurrent-b", {"README.md": "# B\n"})

    with TestClient(app) as client:
        workflow = _create_workflow(
            client,
            key=f"phase7-concurrent-{uuid4().hex[:8]}",
            stages=[
                {
                    "key": "IMPLEMENTATION",
                    "name": "Implementation",
                    "order_hint": 0,
                    "assignments": [
                        {
                            "profile_key": "backend-developer",
                            "access_mode": "WRITE",
                            "required": True,
                        }
                    ],
                    "depends_on": [],
                    "execution_mode": "SEQUENTIAL",
                    "required": True,
                    "condition": "ALWAYS",
                }
            ],
        )
        project_a = _register_project(client, name="Concurrent A", repository=repository_a)
        project_b = _register_project(client, name="Concurrent B", repository=repository_b)

        task_a = _json(
            client.post(
                f"/api/projects/{project_a['id']}/tasks",
                json={
                    "title": "A active",
                    "objective": "Remain active for isolation proof.",
                    "requested_workflow_id": workflow["id"],
                    "requested_executor_id": str(executor_a.descriptor().id),
                },
            )
        )
        task_b = _json(
            client.post(
                f"/api/projects/{project_b['id']}/tasks",
                json={
                    "title": "B completes",
                    "objective": "Complete while A remains active.",
                    "requested_workflow_id": workflow["id"],
                    "requested_executor_id": str(executor_b.descriptor().id),
                },
            )
        )
        run_a = _json(
            client.post(
                f"/api/tasks/{task_a['id']}/runs",
                json={"requested_executor_id": str(executor_a.descriptor().id)},
            )
        )
        run_b = _json(
            client.post(
                f"/api/tasks/{task_b['id']}/runs",
                json={"requested_executor_id": str(executor_b.descriptor().id)},
            )
        )

        active_a = _json(client.post(f"/api/runs/{run_a['id']}/start", json={}))
        completed_b = _json(client.post(f"/api/runs/{run_b['id']}/start", json={}))

        assert active_a["status"] not in {"COMPLETED", "FAILED", "CANCELLED"}
        assert completed_b["status"] == "COMPLETED"
        assert _json(client.get(f"/api/runs/{run_a['id']}"))["status"] == active_a["status"]

        workspaces_a = _json(client.get(f"/api/runs/{run_a['id']}/workspaces"))
        workspaces_b = _json(client.get(f"/api/runs/{run_b['id']}/workspaces"))
        assert workspaces_a and workspaces_b
        assert {item["project_id"] for item in workspaces_a} == {project_a["id"]}
        assert {item["project_id"] for item in workspaces_b} == {project_b["id"]}
        assert not {item["id"] for item in workspaces_a} & {
            item["id"] for item in workspaces_b
        }
