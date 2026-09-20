"""Phase 4B: verification checks and Evidence.

A Run's verification obligation comes from its frozen workflow snapshot. The
check runs through the controlled command boundary inside the Run's isolated
workspace — never in the Project's main working tree — and its factual outcome is
recorded as Evidence. A declined command is a policy decision, never a test
result, and a Run that never checked anything reports that honestly.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from conftest import Harness, HarnessFactory, create_git_repository

from agent_office.domain import (
    AgentAccessMode,
    ChangeArea,
    CommandStatus,
    DomainInvariantError,
    EvidenceKind,
    EvidenceStatus,
    VerificationCheckDefinition,
    VerificationCheckType,
)
from agent_office.infrastructure.commands import CommandRunner
from agent_office.infrastructure.executors import ReferenceScenario

#: Repository-relative scripts the declared checks invoke.
CHECK_SCRIPTS = {
    ".agent-office-checks/pass.py": "print('checks passed')\n",
    ".agent-office-checks/fail.py": (
        "import sys\nprint('assertion failed', file=sys.stderr)\nsys.exit(1)\n"
    ),
}


def git(repository: Path, *arguments: str) -> str:
    """Run one Git command with an argument array and no shell."""

    return subprocess.run(
        ["git", "-C", str(repository), *arguments],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def register_repository(
    harness: Harness,
    name: str = "Verification Project",
) -> tuple[dict[str, Any], Path]:
    """Register a temp Git repository that carries runnable check scripts."""

    repository = create_git_repository(Path(harness.tmp_path) / f"verify-repo-{uuid4().hex[:8]}")

    checks = repository / ".agent-office-checks"
    checks.mkdir()

    for relative, content in CHECK_SCRIPTS.items():
        (repository / relative).write_text(content)

    git(repository, "add", ".agent-office-checks")
    git(repository, "commit", "-q", "-m", "add check scripts")

    response = harness.client.post(
        "/api/projects",
        json={"name": name, "repository_path": str(repository)},
    )
    assert response.status_code == 201, response.text

    return response.json(), repository


def check_request(
    key: str = "unit-tests",
    *,
    script: str = ".agent-office-checks/pass.py",
    executable: str = "python3",
    arguments: list[str] | None = None,
    check_type: VerificationCheckType = VerificationCheckType.TEST,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "key": key,
        "check_type": check_type.value,
        "executable": executable,
        "required": True,
    }

    if arguments is not None:
        body["arguments"] = arguments
    else:
        body["arguments"] = [script]

    return body


def create_workflow(
    harness: Harness,
    *,
    checks: list[dict[str, Any]],
    multi_writer: bool = False,
) -> dict[str, Any]:
    """Create a workflow whose implementation stage runs in a real worktree."""

    body = {
        "key": f"phase4b-verify-{uuid4().hex[:8]}",
        "name": "Phase 4B Verification Flow",
        "stages": [
            {
                "key": "DISCOVERY",
                "name": "Discovery",
                "order_hint": 0,
                "assignments": [
                    {
                        "profile_key": "explorer",
                        "access_mode": AgentAccessMode.READ_ONLY.value,
                    }
                ],
            },
            {
                "key": "IMPLEMENTATION",
                "name": "Implementation",
                "order_hint": 1,
                "depends_on": ["DISCOVERY"],
                "assignments": [
                    {
                        "profile_key": "backend-developer",
                        "access_mode": AgentAccessMode.WRITE.value,
                    },
                    *(
                        [
                            {
                                "profile_key": "frontend-developer",
                                "access_mode": AgentAccessMode.WRITE.value,
                            }
                        ]
                        if multi_writer
                        else []
                    ),
                ],
            },
        ],
        "verification_checks": checks,
    }

    response = harness.client.post("/api/workflows", json=body)
    assert response.status_code == 201, response.text

    return response.json()


def execute(
    harness: Harness,
    workflow: dict[str, Any],
    *,
    project: dict[str, Any] | None = None,
    changed_areas: list[ChangeArea] | None = None,
) -> dict[str, Any]:
    """Start a Run for a custom workflow and return the final Run."""

    resolved = project or harness.register_project("Verification Project")
    task = harness.create_task(
        resolved["id"],
        title="Verification Task",
        requested_workflow_id=workflow["id"],
    )
    run = harness.create_run(task["id"])
    harness.start_run(
        run["id"],
        changed_areas=changed_areas or [ChangeArea.BACKEND],
    )

    return harness.run_by_id(run["id"])


def evidence_of(harness: Harness, run_id: str) -> list[dict[str, Any]]:
    response = harness.client.get(f"/api/runs/{run_id}/evidence")
    assert response.status_code == 200, response.text

    return response.json()


def verification_of(harness: Harness, run_id: str) -> dict[str, Any]:
    response = harness.client.get(f"/api/runs/{run_id}/verification")
    assert response.status_code == 200, response.text

    return response.json()


# ----------------------------------------------------------------------
# Execution and evidence
# ----------------------------------------------------------------------


def test_declared_check_runs_and_records_evidence(
    harness_factory: HarnessFactory,
) -> None:
    """A declared check runs in the workspace and its outcome becomes Evidence."""

    harness = harness_factory(ReferenceScenario.SUCCESS)
    project, repository = register_repository(harness)
    workflow = create_workflow(harness, checks=[check_request()])

    run = execute(harness, workflow, project=project)
    assert run["status"] == "COMPLETED"

    recorded = evidence_of(harness, run["id"])
    assert len(recorded) == 1

    evidence = recorded[0]
    # A TEST-type check records a test result whose collection succeeded.
    assert evidence["kind"] == EvidenceKind.TEST_RESULT
    assert evidence["status"] == EvidenceStatus.AVAILABLE
    assert evidence["run_id"] == run["id"]
    assert evidence["project_id"] == project["id"]

    metadata = evidence["metadata"]
    assert metadata["check_key"] == "unit-tests"
    assert metadata["command_status"] == CommandStatus.PASSED
    assert metadata["exit_code"] == "0"
    # The check was one command, so there is no test count to report and none is
    # invented: the observable fact is the command status.
    assert "passed" not in metadata
    assert "failed" not in metadata

    # The recording names the revision the check actually ran against.
    assert len(metadata["base_revision"]) == 40
    assert metadata["base_revision"] == git(repository, "rev-parse", "main")

    status = verification_of(harness, run["id"])
    assert status["checked"] is True
    assert status["evidence_count"] == 1
    assert status["checks"] == [
        {
            "check_key": "unit-tests",
            "check_type": VerificationCheckType.TEST.value,
            "required": True,
            "command_status": CommandStatus.PASSED.value,
            "evidence_id": evidence["id"],
            "satisfied": True,
        }
    ]


def test_check_runs_inside_the_isolated_workspace_not_the_main_tree(
    harness_factory: HarnessFactory,
) -> None:
    """The check executes in a managed worktree; the main tree is untouched."""

    harness = harness_factory(ReferenceScenario.SUCCESS)
    project, repository = register_repository(harness)
    workflow = create_workflow(harness, checks=[check_request()])

    before = git(repository, "status", "--porcelain")
    head_before = git(repository, "rev-parse", "HEAD")

    run = execute(harness, workflow, project=project)
    assert run["status"] == "COMPLETED"

    assert git(repository, "status", "--porcelain") == before
    assert git(repository, "rev-parse", "HEAD") == head_before
    assert git(repository, "branch", "--list", "main")

    metadata = evidence_of(harness, run["id"])[0]["metadata"]
    workspace_ref = metadata["workspace_id"]

    # The workspace a check ran in is a managed location, not the Project tree.
    assert str(repository) not in json.dumps(metadata)
    assert workspace_ref


def test_failing_check_blocks_completion(
    harness_factory: HarnessFactory,
) -> None:
    """A failed check is a factual failure, and the Run cannot complete."""

    harness = harness_factory(ReferenceScenario.SUCCESS)
    project, _ = register_repository(harness)
    workflow = create_workflow(
        harness,
        checks=[check_request(script=".agent-office-checks/fail.py")],
    )

    run = execute(harness, workflow, project=project)

    assert run["status"] == "BLOCKED"
    assert run["failure_code"] == "VERIFICATION_EVIDENCE_MISSING"

    evidence = evidence_of(harness, run["id"])[0]
    # Evidence collection succeeded; the check it recorded failed. Those are
    # different facts and both are reported.
    assert evidence["status"] == EvidenceStatus.AVAILABLE
    assert evidence["metadata"]["command_status"] == CommandStatus.FAILED
    assert evidence["metadata"]["exit_code"] == "1"

    # There is no TestResult passed anywhere: the failure is recorded as one.
    assert verification_of(harness, run["id"])["checks"][0]["satisfied"] is False


def test_check_output_is_bounded_and_path_redacted(
    harness_factory: HarnessFactory,
) -> None:
    """Only a bounded, redacted excerpt is persisted — never raw output."""

    harness = harness_factory(ReferenceScenario.SUCCESS)
    project, repository = register_repository(harness)

    # A check that writes a secret and a host path to stderr, then fails. The
    # path is produced by the script itself: an absolute path may not be declared
    # as an argument, because a check only ever runs inside its own workspace.
    script = repository / ".agent-office-checks" / "leak.py"
    script.write_text(
        "import os, sys\n"
        "print('token=supersecretvalue', file=sys.stderr)\n"
        "print('path=' + os.getcwd() + '/nested/file.py', file=sys.stderr)\n"
        "sys.exit(1)\n"
    )
    git(repository, "add", ".agent-office-checks/leak.py")
    git(repository, "commit", "-q", "-m", "add leak script")

    workflow = create_workflow(
        harness,
        checks=[check_request(key="leak-check", arguments=[".agent-office-checks/leak.py"])],
    )

    run = execute(harness, workflow, project=project)
    payload = harness.client.get(f"/api/runs/{run['id']}/evidence").text

    assert "supersecretvalue" not in payload
    assert str(repository) not in payload

    excerpt = evidence_of(harness, run["id"])[0]["metadata"]["output_excerpt"]

    # The secret is redacted, and the workspace location is reduced to a token
    # rather than the host path it was.
    assert "<redacted>" in excerpt
    assert "<workspace>" in excerpt
    assert str(repository) not in excerpt


def test_multiple_checks_are_all_required(
    harness_factory: HarnessFactory,
) -> None:
    """Every required check must pass; one failure refuses completion."""

    harness = harness_factory(ReferenceScenario.SUCCESS)
    project, _ = register_repository(harness)
    workflow = create_workflow(
        harness,
        checks=[
            check_request(key="unit-tests"),
            check_request(key="lint", script=".agent-office-checks/fail.py"),
        ],
    )

    run = execute(harness, workflow, project=project)

    assert run["status"] == "BLOCKED"

    status = verification_of(harness, run["id"])
    satisfied = {check["check_key"]: check["satisfied"] for check in status["checks"]}

    assert satisfied == {"unit-tests": True, "lint": False}
    assert len(evidence_of(harness, run["id"])) == 2


def test_run_without_declared_checks_reports_unchecked(
    harness_factory: HarnessFactory,
) -> None:
    """No declared obligation means 'not checked', never an implied pass."""

    harness = harness_factory(ReferenceScenario.SUCCESS)
    run, _ = harness.start_workflow("bug-fix", changed_areas=[ChangeArea.BACKEND])

    status = verification_of(harness, run["id"])

    # No declared check means "not checked" — never an implied pass.
    assert status["checked"] is False
    assert status["checks"] == []

    # The only Evidence a Run without checks can hold is the review handoff's
    # repository change summary, which is not a verification result.
    assert {item["kind"] for item in evidence_of(harness, run["id"])} <= {EvidenceKind.DIFF_SUMMARY}


def test_evidence_survives_a_restart(
    harness_factory: HarnessFactory,
    tmp_path: Path,
) -> None:
    """Evidence is durable, not a projection of the last execution."""

    database = tmp_path / "evidence-restart.sqlite"

    first = harness_factory(ReferenceScenario.SUCCESS, database_path=database)
    project, _ = register_repository(first)
    workflow = create_workflow(first, checks=[check_request()])
    run = execute(first, workflow, project=project)

    original = evidence_of(first, run["id"])
    assert original

    second = harness_factory(ReferenceScenario.SUCCESS, database_path=database)
    assert evidence_of(second, run["id"]) == original
    assert verification_of(second, run["id"])["checks"][0]["satisfied"] is True


def test_evidence_records_the_workspace_and_the_verified_revision(
    harness_factory: HarnessFactory,
) -> None:
    """Evidence identifies what was verified, not merely that something was.

    The three facts a later staleness decision needs are recorded: which
    Workspace, the revision it was created from, and the revision the command
    actually ran against.
    """

    harness = harness_factory(ReferenceScenario.SUCCESS)
    project, repository = register_repository(harness)
    workflow = create_workflow(harness, checks=[check_request()])
    run = execute(harness, workflow, project=project)

    metadata = [
        item for item in evidence_of(harness, run["id"]) if item["kind"] == EvidenceKind.TEST_RESULT
    ][0]["metadata"]

    assert metadata["workspace_id"]

    # The worktree was created from HEAD and checked out at HEAD, so both
    # revisions name the same commit here.
    assert len(metadata["base_revision"]) == 40
    assert metadata["current_revision"] == metadata["base_revision"]
    assert metadata["base_revision"] == git(repository, "rev-parse", "main")
    assert len(metadata["candidate_state_fingerprint"]) == 64


def test_evidence_for_a_mutated_workspace_no_longer_satisfies_the_gate(
    harness_factory: HarnessFactory,
) -> None:
    """A pass established against a revision that has since changed is stale."""

    harness = harness_factory(ReferenceScenario.SUCCESS)
    project, _ = register_repository(harness)
    workflow = create_workflow(harness, checks=[check_request()])
    run = execute(harness, workflow, project=project)

    service = harness.app.state.workspace_service
    manager = service._worktrees  # noqa: SLF001 - deliberate audit seam

    from agent_office.domain import WorkspaceId

    workspace_id = next(
        item
        for item in harness.client.get(f"/api/runs/{run['id']}/workspaces").json()
        if item["writable"]
    )["id"]

    location = manager.resolve_workspace_path(service.get(WorkspaceId.parse(workspace_id)).path_ref)

    # Mutate the verified worktree after the check passed.
    (location / "post-verification-change.py").write_text("# changed after verification\n")

    assert service.capture_changes(WorkspaceId.parse(workspace_id)).is_dirty

    status = verification_of(harness, run["id"])

    assert status["checks"][0]["satisfied"] is False

    gates = harness.client.get(f"/api/runs/{run['id']}/completion-gates").json()
    assert "VERIFICATION_EVIDENCE_MISSING" in gates["failures"]


def test_read_only_view_targets_a_writable_candidate(
    harness_factory: HarnessFactory,
) -> None:
    """The handoff view names the Workspace it observes, and it is a worktree."""

    harness = harness_factory(ReferenceScenario.SUCCESS)
    run, _ = harness.start_workflow("bug-fix", changed_areas=[ChangeArea.BACKEND])

    observed = {
        event["payload"]["observed_workspace_id"]
        for event in harness.events(run["id"], limit=200)
        if event["event_type"] == "workspace.created"
        and event["payload"].get("observed_workspace_id")
    }

    writable = {
        item["id"]
        for item in harness.client.get(f"/api/runs/{run['id']}/workspaces").json()
        if item["writable"]
    }

    assert observed
    assert observed <= writable

    persisted = harness.run_by_id(run["id"])
    assert persisted["candidate_workspace_id"] in writable
    assert {persisted["candidate_workspace_id"]} == observed


def test_multi_writer_verification_runs_in_an_integration_candidate(
    harness_factory: HarnessFactory,
) -> None:
    """Several relevant writers are verified only after explicit integration."""

    harness = harness_factory(ReferenceScenario.SUCCESS)
    project, repository = register_repository(harness, "Multi Writer Verification")
    workflow = create_workflow(
        harness,
        checks=[check_request()],
        multi_writer=True,
    )
    run = execute(
        harness,
        workflow,
        project=project,
        changed_areas=[ChangeArea.BACKEND, ChangeArea.UI],
    )

    implementation = {
        agent["workspace_id"]
        for agent in harness.agent_runs(run["id"])
        if agent["stage_key"] == "IMPLEMENTATION"
    }
    assert len(implementation) > 1, "this scenario must have several writers"

    persisted = harness.run_by_id(run["id"])
    candidate_id = persisted["candidate_workspace_id"]
    assert candidate_id is not None
    assert candidate_id not in implementation

    workspaces = harness.client.get(f"/api/runs/{run['id']}/workspaces").json()
    candidate = next(item for item in workspaces if item["id"] == candidate_id)
    assert candidate["kind"] == "INTEGRATION_WORKTREE"
    assert candidate["status"] in {"READY", "RELEASED"}

    verified_in = {
        item["metadata"]["workspace_id"]
        for item in evidence_of(harness, run["id"])
        if item["kind"] == EvidenceKind.TEST_RESULT
    }

    assert verified_in == {candidate_id}
    assert git(repository, "branch", "--show-current") == "main"


# ----------------------------------------------------------------------
# Policy
# ----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        # A state-changing program is not a verification check.
        (check_request(executable="rm", arguments=["README.md"]), 422),
        # An absolute path would let a caller choose which binary runs.
        (check_request(executable="/usr/bin/python3"), 422),
        # A path-qualified program is refused for the same reason.
        (check_request(executable=".agent-office-checks/pass.py"), 422),
        # Shell logic is refused: no shell is ever used, so a declaration that
        # looks like shell must not silently mean something else.
        (check_request(arguments=["README.md", "&&", "rm"]), 422),
        # Flags that change a tool's effect are refused.
        (check_request(executable="npm", arguments=["install"]), 422),
    ],
)
def test_unsafe_check_declarations_are_refused(
    harness_factory: HarnessFactory,
    body: dict[str, Any],
    expected: int,
) -> None:
    """A declaration that is not safely runnable is refused before a Run exists."""

    harness = harness_factory(ReferenceScenario.SUCCESS)

    response = harness.client.post(
        "/api/workflows",
        json={
            "key": f"unsafe-{uuid4().hex[:8]}",
            "name": "Unsafe Flow",
            "stages": [
                {
                    "key": "DISCOVERY",
                    "name": "Discovery",
                    "order_hint": 0,
                    "assignments": [
                        {
                            "profile_key": "explorer",
                            "access_mode": AgentAccessMode.READ_ONLY.value,
                        }
                    ],
                }
            ],
            "verification_checks": [body],
        },
    )

    assert response.status_code == expected, response.text


@pytest.mark.parametrize(
    ("executable", "arguments"),
    [
        # Interpreter inline-code and stream execution: the program is not a file
        # in the workspace, so no evidence about it can exist.
        ("python3", ["-c", "print(1)"]),
        ("python3", ["-cprint(1)"]),
        ("python", ["-c", "import os"]),
        ("python3", ["-m", "http.server"]),
        ("python3", ["-mhttp.server"]),
        ("python3", ["-"]),
        ("node", ["-e", "require('fs')"]),
        ("node", ["--eval=1"]),
        ("node", ["-p", "1+1"]),
        ("node", ["-r", "workspace/module.js"]),
        ("node", ["--require", "workspace/module.js"]),
        # Interpreters that are not verification tools at all.
        ("ruby", ["-e", "puts 1"]),
        ("perl", ["-e", "print 1"]),
        ("sh", ["-c", "echo hi"]),
        ("bash", ["-c", "echo hi"]),
        # Package-manager mutation cannot become ALLOWED just because the tool is
        # allowlisted.
        ("npm", ["install"]),
        ("npm", ["ci"]),
        ("npm", ["link"]),
        ("npm", ["unpublish"]),
        ("npm", ["exec", "whatever"]),
        ("go", ["install", "./..."]),
        ("go", ["get", "./..."]),
        ("go", ["generate", "./..."]),
        ("cargo", ["install", "crate"]),
        ("cargo", ["publish"]),
        ("cargo", ["add", "crate"]),
        # A check runs inside one workspace, so a path outside it is refused even
        # for a tool that is otherwise permitted.
        ("python3", ["/etc/passwd"]),
        ("python3", ["../../etc/passwd"]),
        ("pytest", ["../outside_test.py"]),
        ("pytest", ["--rootdir=/tmp"]),
        ("mypy", ["/elsewhere/src"]),
    ],
)
def test_inline_code_and_out_of_workspace_invocations_are_refused(
    harness_factory: HarnessFactory,
    executable: str,
    arguments: list[str],
) -> None:
    """Classification considers the executable *and* its arguments.

    Allowlisting a tool must never be enough on its own: ``python3`` is a
    permitted verification tool and ``python3 -c`` is arbitrary program
    execution. Phase 4B has no command-approval subsystem, so an operation whose
    effect cannot be established is denied rather than allowed.
    """

    harness = harness_factory(ReferenceScenario.SUCCESS)

    response = harness.client.post(
        "/api/workflows",
        json={
            "key": f"escape-{uuid4().hex[:8]}",
            "name": "Escape Flow",
            "stages": [
                {
                    "key": "DISCOVERY",
                    "name": "Discovery",
                    "order_hint": 0,
                    "assignments": [
                        {
                            "profile_key": "explorer",
                            "access_mode": AgentAccessMode.READ_ONLY.value,
                        }
                    ],
                }
            ],
            "verification_checks": [check_request(executable=executable, arguments=arguments)],
        },
    )

    assert response.status_code == 422, response.text


@pytest.mark.parametrize(
    ("executable", "arguments"),
    [
        # The declared tool, named directly.
        ("pytest", ["-q", "tests"]),
        ("pytest", ["tests", "-k", "smoke"]),
        ("ruff", ["check", "."]),
        ("ruff", ["format", "--check", "src"]),
        ("mypy", ["src/agent_office"]),
        # A script inside the workspace is the supported interpreter form.
        ("python3", [".agent-office-checks/pass.py"]),
        ("python3", ["-X", "dev", "script.py"]),
        # Package-manager subcommands that only read or run declared scripts.
        ("npm", ["test"]),
        ("npm", ["run", "build"]),
        ("go", ["test", "./..."]),
        ("cargo", ["test"]),
        ("make", ["test"]),
    ],
)
def test_declared_safe_verification_invocations_remain_permitted(
    harness_factory: HarnessFactory,
    executable: str,
    arguments: list[str],
) -> None:
    """Hardening must not remove the verification tools the milestone needs."""

    harness = harness_factory(ReferenceScenario.SUCCESS)

    response = harness.client.post(
        "/api/workflows",
        json={
            "key": f"safe-{uuid4().hex[:8]}",
            "name": "Safe Flow",
            "stages": [
                {
                    "key": "DISCOVERY",
                    "name": "Discovery",
                    "order_hint": 0,
                    "assignments": [
                        {
                            "profile_key": "explorer",
                            "access_mode": AgentAccessMode.READ_ONLY.value,
                        }
                    ],
                }
            ],
            "verification_checks": [check_request(executable=executable, arguments=arguments)],
        },
    )

    assert response.status_code == 201, response.text
    assert response.json()["verification_checks"][0]["arguments"] == arguments


def test_denial_happens_before_the_process_boundary(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """A refused command cannot reach the OS, and the check is falsifiable.

    Denial is a domain decision taken while the declaration is built, so no
    argument vector ever reaches the process boundary. The permitted control
    proves the observation is real: without it, an empty list could just mean the
    spy never worked.
    """

    spawns: list[list[str]] = []
    real_popen = subprocess.Popen

    def spy(argv: Any, **kwargs: Any) -> Any:
        spawns.append(list(argv))
        return real_popen(argv, **kwargs)

    monkeypatch.setattr(subprocess, "Popen", spy)

    # Refused at declaration: there is no definition to hand to a runner.
    with pytest.raises(DomainInvariantError):
        VerificationCheckDefinition(
            key="inline",
            check_type=VerificationCheckType.TEST,
            executable="python3",
            arguments=("-c", "print('x')"),
        )

    assert spawns == []

    # Positive control: the same runner does spawn a permitted, workspace-contained
    # script, so the empty list above means "denied" rather than "unobserved".
    (tmp_path / "check_ok.py").write_text("print('ok')\n")

    permitted = VerificationCheckDefinition(
        key="workspace-script",
        check_type=VerificationCheckType.TEST,
        executable="python3",
        arguments=("check_ok.py",),
    )

    outcome = CommandRunner().run(permitted, working_directory=tmp_path)

    assert spawns == [["python3", "check_ok.py"]]
    assert outcome.status is CommandStatus.PASSED


def test_a_refused_declaration_leaves_no_definition_behind(
    harness_factory: HarnessFactory,
) -> None:
    """The refusal is complete: nothing is persisted that a Run could freeze."""

    harness = harness_factory(ReferenceScenario.SUCCESS)
    key = f"refused-{uuid4().hex[:8]}"

    response = harness.client.post(
        "/api/workflows",
        json={
            "key": key,
            "name": "Refused Flow",
            "stages": [
                {
                    "key": "DISCOVERY",
                    "name": "Discovery",
                    "order_hint": 0,
                    "assignments": [
                        {
                            "profile_key": "explorer",
                            "access_mode": AgentAccessMode.READ_ONLY.value,
                        }
                    ],
                }
            ],
            "verification_checks": [
                check_request(executable="python3", arguments=["-c", "print(1)"])
            ],
        },
    )

    assert response.status_code == 422

    listed = harness.client.get("/api/workflows").json()
    assert key not in {workflow["key"] for workflow in listed}


def test_verification_evidence_dto_discloses_no_host_path(
    harness_factory: HarnessFactory,
) -> None:
    """Evidence names a check and a result, never a host location."""

    harness = harness_factory(ReferenceScenario.SUCCESS)
    project, repository = register_repository(harness)
    workflow = create_workflow(harness, checks=[check_request()])
    run = execute(harness, workflow, project=project)

    payload = harness.client.get(f"/api/runs/{run['id']}/evidence").text

    for key in ("repository_path", "canonical_path", "git_common_dir"):
        assert key not in payload

    assert str(repository) not in payload
    assert str(harness.tmp_path) not in payload


def test_unknown_evidence_is_not_found(harness_factory: HarnessFactory) -> None:
    harness = harness_factory(ReferenceScenario.SUCCESS)

    response = harness.client.get(f"/api/evidence/{uuid4()}")
    assert response.status_code == 404


def test_unknown_run_has_no_evidence(harness_factory: HarnessFactory) -> None:
    harness = harness_factory(ReferenceScenario.SUCCESS)

    assert harness.client.get(f"/api/runs/{uuid4()}/evidence").status_code == 404
    assert harness.client.get(f"/api/runs/{uuid4()}/verification").status_code == 404
    assert harness.client.get(f"/api/runs/{uuid4()}/findings").status_code == 404
