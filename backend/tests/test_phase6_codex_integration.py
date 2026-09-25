"""Phase 6 integration coverage for the real Codex adapter boundary.

The executable used here is a deterministic local stand-in for Codex CLI. It
exercises the production CodexExecutor, execution-context resolver, orchestrator,
Workspace allocation, Events, and result persistence without network access or
provider quota.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from fastapi.testclient import TestClient

from agent_office.config import Settings
from agent_office.infrastructure.executors.codex import CODEX_EXECUTOR_ID
from agent_office.main import create_app


def _git(repo: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def _repository(path: Path) -> Path:
    path.mkdir(parents=True)
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=path, check=True)
    _git(path, "config", "user.name", "Agent Office Phase 6 Test")
    _git(path, "config", "user.email", "phase6@example.invalid")
    (path / "README.md").write_text("# Phase 6 test\n")
    _git(path, "add", "README.md")
    _git(path, "commit", "-q", "-m", "initial")
    return path


def _fake_codex(path: Path) -> Path:
    executable = path / "codex"
    executable.write_text(
        """#!/usr/bin/env python3
import json
import pathlib
import sys

args = sys.argv[1:]

if args == ["--version"]:
    print("codex-cli phase6-integration-test")
    raise SystemExit(0)

if args == ["login", "status"]:
    print("Logged in")
    raise SystemExit(0)

if not args or args[0] != "exec":
    raise SystemExit(2)

prompt = sys.stdin.read()
if "phase6-integration.txt" not in prompt:
    raise SystemExit(3)

pathlib.Path("phase6-integration.txt").write_text("codex isolated workspace\\n")
print(json.dumps({"type": "thread.started", "thread_id": "phase6-integration-thread"}), flush=True)
print(json.dumps({"type": "turn.started"}), flush=True)
print(json.dumps({"type": "turn.completed"}), flush=True)
raise SystemExit(0)
"""
    )
    executable.chmod(0o755)
    return executable


def _json(response):
    assert response.status_code < 300, response.text
    return response.json()


def test_codex_run_is_bound_to_an_isolated_workspace_and_canonical_state(
    tmp_path: Path,
) -> None:
    repository = _repository(tmp_path / "project")
    executable = _fake_codex(tmp_path)
    original_head = _git(repository, "rev-parse", "HEAD")
    original_status = _git(repository, "status", "--porcelain")

    data_root = tmp_path / "agent-office"
    app = create_app(
        Settings(
            data_root=data_root,
            artifact_root=data_root / "artifacts",
            workspace_root=data_root / "workspaces",
            database_path=data_root / "agent-office.sqlite",
            codex_enabled=True,
            codex_cli_path=str(executable),
            codex_probe_timeout_seconds=1.0,
            codex_start_timeout_seconds=1.0,
            codex_cancel_timeout_seconds=1.0,
        )
    )

    with TestClient(app) as client:
        project = _json(
            client.post(
                "/api/projects",
                json={
                    "name": "Phase 6 Project",
                    "repository_path": str(repository),
                },
            )
        )

        workflow = _json(
            client.post(
                "/api/workflows",
                json={
                    "key": "phase6-codex-integration",
                    "name": "Phase 6 Codex Integration",
                    "description": "Single bounded write assignment for adapter integration.",
                    "status": "ACTIVE",
                    "stages": [
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
                    "verification_checks": [],
                },
            )
        )

        task = _json(
            client.post(
                f"/api/projects/{project['id']}/tasks",
                json={
                    "title": "Phase 6 bounded write",
                    "objective": (
                        "Create phase6-integration.txt containing exactly "
                        "'codex isolated workspace' followed by a newline."
                    ),
                    "requested_workflow_id": workflow["id"],
                    "requested_executor_id": str(CODEX_EXECUTOR_ID),
                },
            )
        )
        run = _json(
            client.post(
                f"/api/tasks/{task['id']}/runs",
                json={"requested_executor_id": str(CODEX_EXECUTOR_ID)},
            )
        )

        started = _json(client.post(f"/api/runs/{run['id']}/start", json={}))

        if started["status"] not in {"COMPLETED", "FAILED", "BLOCKED", "CANCELLED"}:
            started = _json(client.post(f"/api/runs/{run['id']}/reconcile"))

        assert started["status"] == "COMPLETED"

        agents = _json(client.get(f"/api/runs/{run['id']}/agents"))
        assert len(agents) == 1
        assert agents[0]["executor_id"] == str(CODEX_EXECUTOR_ID)
        assert agents[0]["status"] == "COMPLETED"
        assert agents[0]["result_outcome"] == "SUCCESS"

        workspaces = _json(client.get(f"/api/runs/{run['id']}/workspaces"))
        assert len(workspaces) == 1
        assert workspaces[0]["kind"] == "GIT_WORKTREE"
        workspace_status = _json(client.get(f"/api/workspaces/{workspaces[0]['id']}/status"))
        summary = workspace_status["change_summary"]
        assert summary is not None
        assert "phase6-integration.txt" in summary["untracked_paths"]

        events = _json(client.get(f"/api/runs/{run['id']}/events"))
        event_types = {event["event_type"] for event in events["events"]}
        assert "agent.started" in event_types
        assert "agent.completed" in event_types
        assert "run.completed" in event_types

    assert not (repository / "phase6-integration.txt").exists()
    assert _git(repository, "rev-parse", "HEAD") == original_head
    assert _git(repository, "status", "--porcelain") == original_status
