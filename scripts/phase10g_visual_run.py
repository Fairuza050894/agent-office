#!/usr/bin/env python3
"""Create or clean up a canonical non-terminal Run for Phase 10G rendered review.

The running Agent Office backend must be started explicitly with:

    AGENT_OFFICE_REFERENCE_SCENARIO=WAITING

The script talks only to the public local HTTP API. It does not edit SQLite,
create fake AgentRuns, or bypass orchestration.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

REFERENCE_EXECUTOR_ID = "00000000-0000-4000-8000-000000000001"
TERMINAL_RUN_STATUSES = {"COMPLETED", "FAILED", "CANCELLED"}


def request_json(
    base_url: str,
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
) -> Any:
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        urllib.parse.urljoin(base_url.rstrip("/") + "/", path.lstrip("/")),
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"{method} {path} failed with HTTP {exc.code}: {detail}"
        ) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(
            f"Unable to reach Agent Office at {base_url}: {exc.reason}"
        ) from exc


def select_project(
    projects: list[dict[str, Any]],
    *,
    project_id: str | None,
    project_name: str | None,
) -> dict[str, Any]:
    active = [project for project in projects if project.get("status") == "ACTIVE"]

    if project_id:
        match = next((project for project in active if project["id"] == project_id), None)
        if match is None:
            raise RuntimeError(f"Active Project {project_id} was not found.")
        return match

    if project_name:
        normalized = project_name.casefold()
        matches = [
            project
            for project in active
            if str(project.get("name", "")).casefold() == normalized
        ]
        if len(matches) != 1:
            raise RuntimeError(
                f"Expected one active Project named {project_name!r}; observed {len(matches)}."
            )
        return matches[0]

    repo_matches = [
        project
        for project in active
        if str(project.get("repository", {}).get("name", "")).casefold()
        == "agent-office"
    ]
    if len(repo_matches) == 1:
        return repo_matches[0]

    if len(active) == 1:
        return active[0]

    choices = [
        {
            "id": project["id"],
            "name": project["name"],
            "repository": project.get("repository", {}).get("name"),
        }
        for project in active
    ]
    raise RuntimeError(
        "Project selection is ambiguous. Re-run with --project-id or "
        "--project-name. Active Projects: " + json.dumps(choices)
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--project-id")
    parser.add_argument("--project-name")
    parser.add_argument("--workflow-key", default="bug-fix")
    parser.add_argument("--cancel-run")
    args = parser.parse_args()

    if args.cancel_run:
        cancelled = request_json(
            args.base_url,
            "POST",
            f"/api/runs/{args.cancel_run}/cancel",
            {},
        )
        print(
            json.dumps(
                {
                    "action": "cancel",
                    "run_id": args.cancel_run,
                    "status": cancelled["status"],
                },
                indent=2,
                sort_keys=True,
            )
        )
        return 0

    projects = request_json(args.base_url, "GET", "/api/projects")
    project = select_project(
        projects,
        project_id=args.project_id,
        project_name=args.project_name,
    )

    workflows = request_json(args.base_url, "GET", "/api/workflows")
    workflow = next(
        (item for item in workflows if item.get("key") == args.workflow_key),
        None,
    )
    if workflow is None:
        raise RuntimeError(
            f"Workflow {args.workflow_key!r} was not found. Available keys: "
            + json.dumps(sorted(item.get("key") for item in workflows))
        )

    task = request_json(
        args.base_url,
        "POST",
        f"/api/projects/{project['id']}/tasks",
        {
            "title": "Phase 10G visual verification · waiting work",
            "objective": (
                "Exercise canonical Task, Run, and AgentRun work-presence projection "
                "for rendered Agent Office verification. No repository change is requested."
            ),
            "constraints": (
                "ReferenceExecutor only. Keep execution non-terminal for rendered review. "
                "Do not commit, merge, push, or modify the registered repository."
            ),
            "requested_workflow_id": workflow["id"],
            "requested_executor_id": REFERENCE_EXECUTOR_ID,
        },
    )

    run = request_json(
        args.base_url,
        "POST",
        f"/api/tasks/{task['id']}/runs",
        {"requested_executor_id": REFERENCE_EXECUTOR_ID},
    )
    started = request_json(
        args.base_url,
        "POST",
        f"/api/runs/{run['id']}/start",
        {"changed_areas": []},
    )
    agents = request_json(
        args.base_url,
        "GET",
        f"/api/runs/{run['id']}/agents",
    )

    waiting = [agent for agent in agents if agent.get("status") == "WAITING"]
    if started["status"] in TERMINAL_RUN_STATUSES or not waiting:
        raise RuntimeError(
            "The verification Run did not retain WAITING AgentRuns. "
            "Restart the backend with AGENT_OFFICE_REFERENCE_SCENARIO=WAITING "
            "before running this helper. "
            f"Run status={started['status']!r}; "
            f"AgentRun statuses={sorted({agent.get('status') for agent in agents})!r}"
        )

    result = {
        "status": "READY",
        "project_id": project["id"],
        "project_name": project["name"],
        "task_id": task["id"],
        "run_id": run["id"],
        "run_status": started["status"],
        "agent_run_count": len(agents),
        "waiting_agent_run_count": len(waiting),
        "agent_run_statuses": sorted({agent["status"] for agent in agents}),
        "workspace_url": (
            "http://localhost:5173/office?"
            + urllib.parse.urlencode(
                {"project": project["id"], "floor": "strategy"}
            )
        ),
        "run_office_url": f"http://localhost:5173/runs/{run['id']}/office",
        "cleanup_command": (
            "python scripts/phase10g_visual_run.py "
            f"--cancel-run {run['id']}"
        ),
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, indent=2))
        raise SystemExit(1)
