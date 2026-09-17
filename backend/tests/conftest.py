"""Shared fixtures for Agent Office backend tests.

Phase 3 tests need a real temporary Git repository, a temporary SQLite
database, and an explicitly injected deterministic executor scenario. Fixtures
are provided here so no test mutates a real user repository or database.
"""

from __future__ import annotations

import asyncio
import subprocess
import tempfile
from collections.abc import Callable, Iterator
from contextlib import ExitStack
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from agent_office.config import Settings
from agent_office.domain import (
    AgentProfileCatalog,
    CancelExecutionResult,
    CancellationOutcome,
    CapabilityRecord,
    CapabilityReport,
    CapabilitySupport,
    ChangeArea,
    ExecutionOutcome,
    ExecutionResult,
    ExecutionStatus,
    ExecutorCapability,
    ExecutorDescriptor,
    ExecutorHealth,
    ExecutorId,
    ExecutorKind,
    ExecutorSessionRef,
    ExecutorStatus,
    ReconciliationResult,
    StartExecutionOutcome,
    StartExecutionRequest,
    StartExecutionResult,
    utc_now,
)
from agent_office.infrastructure.executors import (
    ExecutorRegistry,
    ReferenceExecutor,
    ReferenceScenario,
    RegisteredExecutor,
)
from agent_office.main import create_app


def create_git_repository(path: Path) -> Path:
    """Create a real, minimal Git repository with one committed file."""

    path.mkdir(parents=True, exist_ok=True)

    for command in (
        ["git", "init", "-q", "-b", "main"],
        ["git", "config", "user.name", "Agent Office Test"],
        ["git", "config", "user.email", "agent-office@example.invalid"],
    ):
        subprocess.run(command, cwd=path, check=True)

    (path / "README.md").write_text("# Test Repository\n")
    subprocess.run(["git", "add", "README.md"], cwd=path, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "initial"], cwd=path, check=True)

    return path


def reference_registry(scenario: ReferenceScenario) -> ExecutorRegistry:
    """Build a registry holding one deterministic ReferenceExecutor."""

    executor = ReferenceExecutor(scenario=scenario)
    registered = RegisteredExecutor(descriptor=executor.descriptor(), adapter=executor)

    return ExecutorRegistry((registered,))


def registry_for(*adapters: Any) -> ExecutorRegistry:
    """Build a registry over arbitrary test adapters.

    Used to prove orchestration behavior (capability gating, concurrency,
    resolution) without a real provider.
    """

    return ExecutorRegistry(
        tuple(
            RegisteredExecutor(descriptor=adapter.descriptor(), adapter=adapter)
            for adapter in adapters
        )
    )


class ScriptedExecutor:
    """Deterministic in-process Executor used to observe orchestrator behavior.

    It is not an AI runtime: it returns configured canonical results and records
    how the orchestrator called it.
    """

    def __init__(
        self,
        *,
        executor_id: str = "00000000-0000-4000-8000-0000000000aa",
        unsupported_capabilities: frozenset[ExecutorCapability] = frozenset(),
        unknown_capabilities: frozenset[ExecutorCapability] = frozenset(),
        session_status: ExecutionStatus = ExecutionStatus.COMPLETED,
        result_outcome: ExecutionOutcome = ExecutionOutcome.SUCCESS,
        yield_on_start: bool = True,
    ) -> None:
        self._executor_id = ExecutorId.parse(executor_id)
        self._unsupported = unsupported_capabilities
        self._unknown = unknown_capabilities
        self._session_status = session_status
        self._result_outcome = result_outcome
        self._yield_on_start = yield_on_start

        self.start_calls = 0
        self.capability_calls = 0
        self.active_starts = 0
        self.max_concurrent_starts = 0
        self._sessions: dict[str, ExecutionStatus] = {}
        self._sequence = 0

    def descriptor(self) -> ExecutorDescriptor:
        return ExecutorDescriptor(
            id=self._executor_id,
            kind=ExecutorKind.REFERENCE,
            name="Scripted Executor",
            status=ExecutorStatus.AVAILABLE,
            runtime_version="test",
        )

    async def describe(self) -> ExecutorDescriptor:
        return self.descriptor()

    async def capabilities(self) -> CapabilityReport:
        self.capability_calls += 1

        records = tuple(
            CapabilityRecord(
                capability=capability,
                support=(
                    CapabilitySupport.UNSUPPORTED
                    if capability in self._unsupported
                    else (
                        CapabilitySupport.UNKNOWN
                        if capability in self._unknown
                        else CapabilitySupport.SUPPORTED
                    )
                ),
                source="scripted-executor",
            )
            for capability in ExecutorCapability
        )

        return CapabilityReport(executor_id=self._executor_id, capabilities=records)

    async def health(self) -> ExecutorHealth:
        return ExecutorHealth(status=ExecutorStatus.AVAILABLE, checked_at=utc_now())

    async def start(self, request: StartExecutionRequest) -> StartExecutionResult:
        self.start_calls += 1
        self.active_starts += 1
        self.max_concurrent_starts = max(self.max_concurrent_starts, self.active_starts)

        try:
            if self._yield_on_start:
                # Yield to the event loop so a genuinely concurrent call can
                # enter this method while this one is still in flight.
                await asyncio.sleep(0)

            self._sequence += 1
            session = ExecutorSessionRef(
                executor_id=self._executor_id,
                opaque_session_id=f"scripted-session-{self._sequence:06d}",
                created_at=utc_now(),
            )
            self._sessions[session.opaque_session_id] = self._session_status
        finally:
            self.active_starts -= 1

        return StartExecutionResult(
            outcome=StartExecutionOutcome.STARTED,
            session_ref=session,
            safe_summary="Scripted execution started.",
            retryable=False,
        )

    async def get_status(self, session: ExecutorSessionRef) -> ExecutionStatus:
        return self._sessions.get(session.opaque_session_id, ExecutionStatus.UNKNOWN)

    async def cancel(self, session: ExecutorSessionRef) -> CancelExecutionResult:
        if session.opaque_session_id not in self._sessions:
            return CancelExecutionResult(outcome=CancellationOutcome.UNKNOWN)

        self._sessions[session.opaque_session_id] = ExecutionStatus.CANCELLED

        return CancelExecutionResult(outcome=CancellationOutcome.CONFIRMED_CANCELLED)

    async def reconcile(self, session: ExecutorSessionRef) -> ReconciliationResult:
        return ReconciliationResult(
            status=self._sessions.get(session.opaque_session_id, ExecutionStatus.UNKNOWN)
        )

    async def fetch_result(self, session: ExecutorSessionRef) -> ExecutionResult:
        return ExecutionResult(outcome=self._result_outcome, summary="Scripted execution result.")


@dataclass
class Harness:
    """Small HTTP-level harness over the composed Agent Office application."""

    client: TestClient
    app: Any
    tmp_path: Path
    repo_sequence: int = 0

    def register_project(self, name: str = "Project A") -> dict[str, Any]:
        self.repo_sequence += 1
        slug = name.lower().replace(" ", "-")
        # A unique directory per registration keeps repeated registrations of
        # the same display name from colliding on repository identity.
        repository = create_git_repository(
            Path(
                tempfile.mkdtemp(
                    dir=self.tmp_path,
                    prefix=f"repo-{slug}-{self.repo_sequence}-",
                )
            )
        )
        response = self.client.post(
            "/api/projects",
            json={"name": name, "repository_path": str(repository)},
        )
        assert response.status_code == 201, response.text

        return response.json()

    def create_task(
        self,
        project_id: str,
        *,
        title: str = "Task",
        requested_workflow_id: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"title": title, "objective": f"{title} objective"}

        if requested_workflow_id is not None:
            body["requested_workflow_id"] = requested_workflow_id

        response = self.client.post(f"/api/projects/{project_id}/tasks", json=body)
        assert response.status_code == 201, response.text

        return response.json()

    def create_run(self, task_id: str, **body: Any) -> dict[str, Any]:
        response = self.client.post(f"/api/tasks/{task_id}/runs", json=body)
        assert response.status_code == 201, response.text

        return response.json()

    def start_run(
        self,
        run_id: str,
        *,
        changed_areas: list[ChangeArea] | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {}

        if changed_areas is not None:
            body["changed_areas"] = [area.value for area in changed_areas]

        response = self.client.post(f"/api/runs/{run_id}/start", json=body)
        assert response.status_code == 200, response.text

        return response.json()

    def stages(self, run_id: str) -> list[dict[str, Any]]:
        response = self.client.get(f"/api/runs/{run_id}/stages")
        assert response.status_code == 200, response.text

        return response.json()

    def agent_runs(self, run_id: str) -> list[dict[str, Any]]:
        response = self.client.get(f"/api/runs/{run_id}/agents")
        assert response.status_code == 200, response.text

        return response.json()

    def events(self, run_id: str, **params: Any) -> list[dict[str, Any]]:
        params.setdefault("limit", 200)
        response = self.client.get(f"/api/runs/{run_id}/events", params=params)
        assert response.status_code == 200, response.text

        return response.json()["events"]

    def workflow_by_key(self, key: str) -> dict[str, Any]:
        response = self.client.get("/api/workflows")
        assert response.status_code == 200, response.text

        for workflow in response.json():
            if workflow["key"] == key:
                return workflow

        raise AssertionError(f"workflow {key} is not registered")

    def stage_status(self, run_id: str, stage_key: str) -> str:
        for stage in self.stages(run_id):
            if stage["stage_key"] == stage_key:
                return str(stage["status"])

        raise AssertionError(f"stage {stage_key} is missing from run {run_id}")

    def agent_statuses(self, run_id: str, stage_key: str) -> list[str]:
        return [
            str(agent_run["status"])
            for agent_run in self.agent_runs(run_id)
            if agent_run["stage_key"] == stage_key
        ]


HarnessFactory = Callable[..., Harness]


@pytest.fixture
def harness_factory(tmp_path: Path) -> Iterator[HarnessFactory]:
    """Return a factory that builds isolated Agent Office harnesses."""

    with ExitStack() as stack:
        created = 0

        def build(
            scenario: ReferenceScenario = ReferenceScenario.SUCCESS,
            *,
            registry: ExecutorRegistry | None = None,
            database_path: Path | None = None,
            agent_profiles: AgentProfileCatalog | None = None,
        ) -> Harness:
            nonlocal created
            created += 1

            resolved = registry if registry is not None else reference_registry(scenario)
            app = create_app(
                Settings(
                    database_path=(
                        database_path
                        if database_path is not None
                        else tmp_path / f"agent-office-{created}.sqlite"
                    )
                ),
                executor_registry=resolved,
                agent_profiles=agent_profiles,
            )
            client = stack.enter_context(TestClient(app))

            return Harness(client=client, app=app, tmp_path=tmp_path)

        yield build
