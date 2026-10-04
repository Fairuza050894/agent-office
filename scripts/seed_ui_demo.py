#!/usr/bin/env python3
"""Seed truthful target-UI demo data through Agent Office's public HTTP API.

The script creates Agent Office records only through HTTP. The Git repository is
local demo infrastructure used by the Project registration endpoint; the script
never deletes an existing path and refuses to reuse a non-empty destination.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

TERMINAL_RUN_STATES = {"COMPLETED", "FAILED", "BLOCKED", "CANCELLED"}


def request_json(base_url: str, method: str, path: str, body: object | None = None) -> Any:
    request = urllib.request.Request(
        base_url.rstrip("/") + path,
        data=None if body is None else json.dumps(body).encode(),
        method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = response.read()
            return json.loads(payload or b"null")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:500]
        raise RuntimeError(f"HTTP {exc.code} {method} {path}: {detail}") from exc


def git(cwd: Path, *args: str) -> None:
    subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
    )


def prepare_demo_repository(repo: Path) -> None:
    if repo.exists() and any(repo.iterdir()):
        raise RuntimeError(
            f"Refusing to replace non-empty demo repository: {repo}. "
            "Choose a new empty path."
        )

    repo.mkdir(parents=True, exist_ok=True)
    (repo / "src").mkdir(exist_ok=True)
    git(repo, "init", "-q", "-b", "main")
    git(repo, "config", "user.email", "demo@example.invalid")
    git(repo, "config", "user.name", "Agent Office Demo")
    (repo / "README.md").write_text("# ReserveHub demo\n")
    (repo / "src" / "index.ts").write_text("export const a = 1\n")
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "initial demo repository")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--repo", default="/tmp/agent-office-target-ui-demo")
    args = parser.parse_args()

    repo = Path(args.repo).expanduser().resolve()
    prepare_demo_repository(repo)

    project = request_json(
        args.base_url,
        "POST",
        "/api/projects",
        {"name": "ReserveHub", "repository_path": str(repo)},
    )

    workflows = request_json(args.base_url, "GET", "/api/workflows")
    workflow = next(
        (item for item in workflows if item["name"] == "Enterprise Engineering"),
        None,
    )
    if workflow is None:
        raise RuntimeError("Enterprise Engineering workflow is not registered")

    def create_task(title: str, objective: str) -> dict[str, Any]:
        return request_json(
            args.base_url,
            "POST",
            f"/api/projects/{project['id']}/tasks",
            {
                "title": title,
                "objective": objective,
                "requested_workflow_id": workflow["id"],
            },
        )

    def create_run(task: dict[str, Any], *, start: bool = True) -> dict[str, Any]:
        run = request_json(
            args.base_url,
            "POST",
            f"/api/tasks/{task['id']}/runs",
            {},
        )
        if not start:
            return run

        request_json(args.base_url, "POST", f"/api/runs/{run['id']}/start", {})
        for _ in range(90):
            current = request_json(args.base_url, "GET", f"/api/runs/{run['id']}")
            if current["status"] in TERMINAL_RUN_STATES:
                return current
            time.sleep(1)

        raise RuntimeError(f"Run {run['id']} did not reach a terminal state in time")

    for title, objective in (
        (
            "Add per-order cashback campaign",
            "Earn cashback from a store campaign.",
        ),
        (
            "Fix memory leak in scene manager",
            "Dispose WebGL resources and listeners.",
        ),
    ):
        run = create_run(create_task(title, objective))
        if run["status"] != "COMPLETED":
            raise RuntimeError(f"Expected completed demo Run for {title}, got {run['status']}")
        request_json(
            args.base_url,
            "POST",
            f"/api/runs/{run['id']}/result-review/approve-and-deliver",
            {"note": "Accepted demo result."},
        )

    create_run(
        create_task(
            "Implement project settings API",
            "Add project configuration endpoints with validation and tests.",
        )
    )
    create_run(
        create_task("Refactor auth middleware", "Centralize token checks."),
        start=False,
    )
    create_task(
        "User onboarding flow",
        "Guide a new merchant through the first booking.",
    )

    print(f"seeded project {project['id']}")
    print(f"demo repository {repo}")


if __name__ == "__main__":
    main()
