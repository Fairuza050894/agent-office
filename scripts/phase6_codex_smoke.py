#!/usr/bin/env python3
"""Opt-in live Phase 6 smoke using the authenticated local Codex CLI.

This script consumes real provider quota. It creates its own temporary Git
repository and Agent Office data root, asks one Codex AgentRun for a bounded
single-file edit in an isolated Workspace, and retains the smoke root for
inspection. It never uses the Agent Office source repository as the target.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from agent_office.config import Settings
from agent_office.infrastructure.executors.codex import CODEX_EXECUTOR_ID
from agent_office.main import create_app

TERMINAL_RUN_STATUSES = {"COMPLETED", "FAILED", "BLOCKED", "CANCELLED"}
EXPECTED_CONTENT = "agent-office phase 6 live codex smoke\n"


def git(repo: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def checked_json(response: Any, operation: str) -> Any:
    if response.status_code >= 300:
        raise RuntimeError(
            f"{operation} failed with HTTP {response.status_code}: {response.text}"
        )
    return response.json()


def create_repository(path: Path) -> Path:
    path.mkdir(parents=True)
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=path, check=True)
    git(path, "config", "user.name", "Agent Office Live Smoke")
    git(path, "config", "user.email", "phase6-smoke@example.invalid")
    (path / "README.md").write_text("# Agent Office Phase 6 live smoke\n")
    git(path, "add", "README.md")
    git(path, "commit", "-q", "-m", "initial")
    return path


def main() -> int:
    smoke_root = Path(tempfile.mkdtemp(prefix="agent-office-phase6-smoke-")).resolve()
    repository = create_repository(smoke_root / "target-repository")
    data_root = smoke_root / "agent-office-data"

    original_head = git(repository, "rev-parse", "HEAD")
    original_status = git(repository, "status", "--porcelain")

    app = create_app(
        Settings(
            data_root=data_root,
            artifact_root=data_root / "artifacts",
            workspace_root=data_root / "workspaces",
            database_path=data_root / "agent-office.sqlite",
            codex_enabled=True,
            codex_cli_path="codex",
            codex_start_timeout_seconds=20.0,
            codex_cancel_timeout_seconds=5.0,
            codex_probe_timeout_seconds=5.0,
        )
    )

    report: dict[str, Any] = {
        "smoke_root": str(smoke_root),
        "executor_id": str(CODEX_EXECUTOR_ID),
        "quota_usage": "Unavailable; Agent Office does not fabricate provider usage.",
    }

    try:
        with TestClient(app) as client:
            executors = checked_json(client.get("/api/executors"), "executor inspection")
            codex = next(
                (item for item in executors if item["id"] == str(CODEX_EXECUTOR_ID)),
                None,
            )
            if codex is None:
                raise RuntimeError("Codex executor was not registered.")
            if codex["status"] != "AVAILABLE":
                raise RuntimeError(
                    "Codex executor is not available: "
                    + str(codex.get("health_summary") or codex["status"])
                )

            report["codex_runtime_version"] = codex["runtime_version"]
            report["codex_health"] = codex["status"]

            project = checked_json(
                client.post(
                    "/api/projects",
                    json={
                        "name": "Phase 6 Live Smoke",
                        "repository_path": str(repository),
                    },
                ),
                "project registration",
            )

            workflow = checked_json(
                client.post(
                    "/api/workflows",
                    json={
                        "key": "phase6-live-codex-smoke",
                        "name": "Phase 6 Live Codex Smoke",
                        "description": "One real bounded Codex write assignment.",
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
                ),
                "workflow creation",
            )

            task = checked_json(
                client.post(
                    f"/api/projects/{project['id']}/tasks",
                    json={
                        "title": "Create the Phase 6 live smoke marker",
                        "objective": (
                            "Create a file named phase6-live-smoke.txt in the assigned "
                            "working directory. Its complete contents must be exactly: "
                            "agent-office phase 6 live codex smoke followed by one newline. "
                            "Do not modify any other file. Do not commit."
                        ),
                        "constraints": (
                            "No network access. No Git mutation beyond reading status. "
                            "Only phase6-live-smoke.txt may be created."
                        ),
                        "requested_workflow_id": workflow["id"],
                        "requested_executor_id": str(CODEX_EXECUTOR_ID),
                    },
                ),
                "task creation",
            )

            run = checked_json(
                client.post(
                    f"/api/tasks/{task['id']}/runs",
                    json={"requested_executor_id": str(CODEX_EXECUTOR_ID)},
                ),
                "run creation",
            )
            run_id = run["id"]

            current = checked_json(
                client.post(f"/api/runs/{run_id}/start", json={}),
                "run start",
            )

            deadline = time.monotonic() + 180.0
            while current["status"] not in TERMINAL_RUN_STATUSES:
                if time.monotonic() >= deadline:
                    raise RuntimeError("Live Codex run did not settle within 180 seconds.")
                time.sleep(0.5)
                current = checked_json(
                    client.post(f"/api/runs/{run_id}/reconcile"),
                    "run reconciliation",
                )

            report["run_id"] = run_id
            report["run_status"] = current["status"]
            report["run_failure_code"] = current.get("failure_code")

            if current["status"] != "COMPLETED":
                raise RuntimeError(
                    "Live Codex run did not complete: "
                    f"{current['status']} / {current.get('failure_code')} / "
                    f"{current.get('failure_summary')}"
                )

            agents = checked_json(
                client.get(f"/api/runs/{run_id}/agents"),
                "AgentRun inspection",
            )
            if len(agents) != 1:
                raise RuntimeError(f"Expected one AgentRun, observed {len(agents)}.")

            agent = agents[0]
            if agent["executor_id"] != str(CODEX_EXECUTOR_ID):
                raise RuntimeError("AgentRun was not bound to Codex.")
            if agent["status"] != "COMPLETED" or agent["result_outcome"] != "SUCCESS":
                raise RuntimeError(
                    "Codex AgentRun did not produce a proven successful result."
                )

            report["agent_run_id"] = agent["id"]
            report["agent_run_status"] = agent["status"]
            report["result_outcome"] = agent["result_outcome"]

            workspaces = checked_json(
                client.get(f"/api/runs/{run_id}/workspaces"),
                "Workspace inspection",
            )
            writable = [
                workspace
                for workspace in workspaces
                if workspace["kind"] in {"AGENT_WORKTREE", "INTEGRATION_WORKTREE"}
                and workspace["writable"]
            ]
            if len(writable) != 1:
                raise RuntimeError(
                    f"Expected one writable isolated Workspace, observed {len(writable)}."
                )

            workspace = writable[0]
            workspace_status = checked_json(
                client.get(f"/api/workspaces/{workspace['id']}/status"),
                "Workspace change inspection",
            )
            summary = workspace_status["change_summary"]
            if summary is None:
                raise RuntimeError("Workspace Git change summary is unavailable.")

            changed_paths = set(summary["added_paths"])
            changed_paths.update(summary["modified_paths"])
            changed_paths.update(summary["deleted_paths"])
            changed_paths.update(summary["untracked_paths"])
            if changed_paths != {"phase6-live-smoke.txt"}:
                raise RuntimeError(
                    "Codex changed an unexpected path set: " + json.dumps(sorted(changed_paths))
                )

            workspace_service = app.state.workspace_service
            workspace_domain = workspace_service.get(workspace["id"])
            workspace_path = app.state.workspace_service._worktree_manager.resolve_workspace_path(
                workspace_domain.path_ref
            )
            marker = workspace_path / "phase6-live-smoke.txt"
            if not marker.exists() or marker.read_text() != EXPECTED_CONTENT:
                raise RuntimeError("Workspace marker contents do not match the bounded task.")

            events = checked_json(
                client.get(f"/api/runs/{run_id}/events"),
                "event inspection",
            )
            event_types = {event["event_type"] for event in events["events"]}
            for required in {"agent.started", "agent.completed", "run.completed"}:
                if required not in event_types:
                    raise RuntimeError(f"Missing canonical event {required}.")

            report["workspace_id"] = workspace["id"]
            report["changed_paths"] = sorted(changed_paths)
            report["canonical_events"] = sorted(
                event_types & {"agent.started", "agent.completed", "run.completed"}
            )

        if (repository / "phase6-live-smoke.txt").exists():
            raise RuntimeError("Main target repository was modified by Codex.")
        if git(repository, "rev-parse", "HEAD") != original_head:
            raise RuntimeError("Main target repository HEAD changed.")
        if git(repository, "status", "--porcelain") != original_status:
            raise RuntimeError("Main target repository working tree changed.")

        report["main_repository_preserved"] = True
        report["workspace_retained"] = True
        report["status"] = "PASS"
        print(json.dumps(report, indent=2, sort_keys=True))
        return 0
    except Exception as exc:
        report["status"] = "FAIL"
        report["error"] = str(exc)
        report["workspace_retained"] = True
        print(json.dumps(report, indent=2, sort_keys=True))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
