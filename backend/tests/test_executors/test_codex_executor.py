"""Provider-specific tests for the local Codex CLI adapter.

The suite uses a local fake executable. No OpenAI network call, credential, or
model quota is used by normal automated tests.
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import pytest

from agent_office.domain import (
    AgentAccessMode,
    AgentRunId,
    CancellationOutcome,
    CapabilitySupport,
    DomainInvariantError,
    ExecutionOutcome,
    ExecutionStatus,
    ExecutorCapability,
    ExecutorId,
    ExecutorKind,
    ExecutorSessionRef,
    ExecutorStatus,
    StartExecutionOutcome,
    StartExecutionRequest,
)
from agent_office.infrastructure.executors.codex import (
    CODEX_EXECUTOR_ID,
    CodexExecutionContext,
    CodexExecutionContextError,
    CodexExecutor,
)


def _write_fake_codex(tmp_path: Path) -> tuple[Path, Path]:
    log_path = tmp_path / "fake-codex-log.jsonl"
    executable = tmp_path / "codex"
    executable.write_text(
        f"""#!/usr/bin/env python3
import json
import os
import sys
import time

LOG_PATH = {str(log_path)!r}

def log(kind):
    with open(LOG_PATH, "a", encoding="utf-8") as handle:
        handle.write(json.dumps({{
            "kind": kind,
            "argv": sys.argv[1:],
            "cwd": os.getcwd(),
            "has_openai_api_key": "OPENAI_API_KEY" in os.environ,
            "has_codex_api_key": "CODEX_API_KEY" in os.environ,
            "has_secret_marker": "AGENT_OFFICE_SECRET_TEST" in os.environ,
        }}) + "\\n")

args = sys.argv[1:]

if args == ["--version"]:
    log("version")
    print("codex-cli 9.9.9-test")
    raise SystemExit(0)

if args == ["login", "status"]:
    log("login")
    print("Logged in")
    raise SystemExit(0)

if not args or args[0] != "exec":
    log("unexpected")
    raise SystemExit(2)

log("exec")
prompt = sys.stdin.read()

if "NO_THREAD" in prompt:
    time.sleep(5)
    raise SystemExit(0)

thread_id = f"fake-thread-{{os.getpid()}}"
print(json.dumps({{"type": "thread.started", "thread_id": thread_id}}), flush=True)
print(json.dumps({{"type": "turn.started"}}), flush=True)

if "SLEEP_EXEC" in prompt:
    time.sleep(5)
    print(json.dumps({{
        "type": "turn.completed",
        "usage": {{
            "input_tokens": 1,
            "cached_input_tokens": 0,
            "cache_write_input_tokens": 0,
            "output_tokens": 1,
            "reasoning_output_tokens": 0,
        }},
    }}), flush=True)
    raise SystemExit(0)

if "FAIL_THEN_SLEEP" in prompt:
    print(json.dumps({{
        "type": "turn.failed",
        "error": {{"message": "SECRET_PROVIDER_FAILURE"}},
    }}), flush=True)
    time.sleep(5)
    raise SystemExit(1)

if "FAIL_EXEC" in prompt:
    print(json.dumps({{
        "type": "turn.failed",
        "error": {{"message": "SECRET_PROVIDER_FAILURE"}},
    }}), flush=True)
    raise SystemExit(1)

if "PROTOCOL_EXEC" in prompt:
    print("not-json", flush=True)
    raise SystemExit(0)

print(json.dumps({{
    "type": "item.completed",
    "item": {{
        "id": "message-1",
        "type": "agent_message",
        "text": "SECRET_PROVIDER_OUTPUT",
    }},
}}), flush=True)
print(json.dumps({{
    "type": "turn.completed",
    "usage": {{
        "input_tokens": 7,
        "cached_input_tokens": 0,
        "cache_write_input_tokens": 0,
        "output_tokens": 3,
        "reasoning_output_tokens": 0,
    }},
}}), flush=True)
raise SystemExit(0)
"""
    )
    executable.chmod(0o755)
    return executable, log_path


def _request(instruction: str = "Perform bounded work.") -> StartExecutionRequest:
    return StartExecutionRequest(
        agent_run_id=AgentRunId(UUID("11111111-1111-4111-8111-111111111111")),
        instruction=instruction,
    )


def _executor(
    executable: Path,
    worktree: Path,
    *,
    access_mode: AgentAccessMode = AgentAccessMode.READ_ONLY,
    start_timeout_seconds: float = 1.0,
) -> CodexExecutor:
    worktree.mkdir(parents=True, exist_ok=True)

    def resolve_context(_agent_run_id: AgentRunId) -> CodexExecutionContext:
        return CodexExecutionContext(
            working_directory=worktree,
            access_mode=access_mode,
        )

    return CodexExecutor(
        execution_context_resolver=resolve_context,
        executable=str(executable),
        start_timeout_seconds=start_timeout_seconds,
        cancel_timeout_seconds=1.0,
        probe_timeout_seconds=1.0,
    )


async def _terminal_status(
    executor: CodexExecutor,
    session: ExecutorSessionRef,
) -> ExecutionStatus:
    for _ in range(200):
        status = await executor.get_status(session)
        if status in {
            ExecutionStatus.COMPLETED,
            ExecutionStatus.FAILED,
            ExecutionStatus.CANCELLED,
            ExecutionStatus.UNKNOWN,
        }:
            return status
        await asyncio.sleep(0.01)

    raise AssertionError("fake Codex session did not become terminal")


def _log_entries(log_path: Path) -> list[dict[str, object]]:
    if not log_path.exists():
        return []

    return [json.loads(line) for line in log_path.read_text().splitlines() if line.strip()]


def test_codex_descriptor_health_and_capabilities_are_factual(tmp_path: Path) -> None:
    executable, _log_path = _write_fake_codex(tmp_path)
    executor = _executor(executable, tmp_path / "repo")

    async def exercise() -> None:
        descriptor = await executor.describe()
        health = await executor.health()
        report = await executor.capabilities()

        assert descriptor.id == CODEX_EXECUTOR_ID
        assert descriptor.kind is ExecutorKind.CODEX
        assert descriptor.status is ExecutorStatus.AVAILABLE
        assert descriptor.runtime_version == "codex-cli 9.9.9-test"

        assert health.status is ExecutorStatus.AVAILABLE
        assert report.support_for(ExecutorCapability.START_EXECUTION) is CapabilitySupport.SUPPORTED
        assert report.support_for(ExecutorCapability.STATUS_QUERY) is CapabilitySupport.SUPPORTED
        assert report.support_for(ExecutorCapability.CANCELLATION) is CapabilitySupport.SUPPORTED
        assert report.support_for(ExecutorCapability.FILE_WRITE) is CapabilitySupport.SUPPORTED
        assert report.support_for(ExecutorCapability.SHELL_EXECUTION) is CapabilitySupport.SUPPORTED
        assert report.support_for(ExecutorCapability.EVENT_STREAM) is CapabilitySupport.UNSUPPORTED
        assert (
            report.support_for(ExecutorCapability.SESSION_RESUME) is CapabilitySupport.UNSUPPORTED
        )
        assert report.support_for(ExecutorCapability.TOKEN_USAGE) is CapabilitySupport.UNSUPPORTED

    asyncio.run(exercise())


def test_codex_success_uses_bounded_read_only_process_and_redacts_raw_output(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    executable, log_path = _write_fake_codex(tmp_path)
    worktree = tmp_path / "repo"
    executor = _executor(executable, worktree)

    monkeypatch.setenv("OPENAI_API_KEY", "must-not-leak")
    monkeypatch.setenv("CODEX_API_KEY", "must-not-leak")
    monkeypatch.setenv("AGENT_OFFICE_SECRET_TEST", "must-not-leak")

    async def exercise() -> None:
        started = await executor.start(_request())

        assert started.outcome is StartExecutionOutcome.STARTED
        assert started.session_ref is not None

        status = await _terminal_status(executor, started.session_ref)
        result = await executor.fetch_result(started.session_ref)

        assert status is ExecutionStatus.COMPLETED
        assert result.outcome is ExecutionOutcome.SUCCESS
        assert result.summary == "Codex execution completed successfully."
        assert "SECRET_PROVIDER_OUTPUT" not in result.summary

    asyncio.run(exercise())

    exec_entry = next(entry for entry in _log_entries(log_path) if entry["kind"] == "exec")
    argv = exec_entry["argv"]

    assert isinstance(argv, list)
    assert "--json" in argv
    assert "--ephemeral" in argv
    assert "--ignore-user-config" in argv
    assert "--ignore-rules" in argv
    disabled_features = [
        argv[index + 1]
        for index, value in enumerate(argv[:-1])
        if value == "--disable"
    ]
    assert disabled_features == ["apps", "plugins", "multi_agent"]
    assert "--sandbox" in argv
    assert "read-only" in argv
    assert "--cd" in argv
    assert str(worktree.resolve()) in argv
    assert 'approval_policy="never"' in argv
    assert 'web_search="disabled"' in argv
    assert "mcp_servers={}" in argv
    assert exec_entry["cwd"] == str(worktree.resolve())
    assert exec_entry["has_openai_api_key"] is False
    assert exec_entry["has_codex_api_key"] is False
    assert exec_entry["has_secret_marker"] is False


def test_codex_write_execution_uses_workspace_write_without_tool_network(
    tmp_path: Path,
) -> None:
    executable, log_path = _write_fake_codex(tmp_path)
    worktree = tmp_path / "worktree"
    executor = _executor(
        executable,
        worktree,
        access_mode=AgentAccessMode.WRITE,
    )

    async def exercise() -> None:
        started = await executor.start(_request())
        assert started.session_ref is not None
        status = await _terminal_status(executor, started.session_ref)
        assert status is ExecutionStatus.COMPLETED

    asyncio.run(exercise())

    exec_entry = next(entry for entry in _log_entries(log_path) if entry["kind"] == "exec")
    argv = exec_entry["argv"]

    assert isinstance(argv, list)
    assert "workspace-write" in argv
    assert "sandbox_workspace_write.network_access=false" in argv


def test_codex_unknown_start_is_never_reported_as_failed_or_retried(
    tmp_path: Path,
) -> None:
    executable, _log_path = _write_fake_codex(tmp_path)
    executor = _executor(
        executable,
        tmp_path / "repo",
        start_timeout_seconds=0.05,
    )

    result = asyncio.run(executor.start(_request("NO_THREAD")))

    assert result.outcome is StartExecutionOutcome.UNKNOWN
    assert result.session_ref is None
    assert result.retryable is False


def test_codex_failure_maps_without_exposing_provider_error_text(tmp_path: Path) -> None:
    executable, _log_path = _write_fake_codex(tmp_path)
    executor = _executor(executable, tmp_path / "repo")

    async def exercise() -> None:
        started = await executor.start(_request("FAIL_EXEC"))
        assert started.session_ref is not None

        status = await _terminal_status(executor, started.session_ref)
        result = await executor.fetch_result(started.session_ref)

        assert status is ExecutionStatus.FAILED
        assert result.outcome is ExecutionOutcome.FAILURE
        assert result.summary == "Codex execution failed."
        assert "SECRET_PROVIDER_FAILURE" not in result.summary

    asyncio.run(exercise())


def test_codex_provider_failure_wins_a_cancellation_race(tmp_path: Path) -> None:
    executable, _log_path = _write_fake_codex(tmp_path)
    executor = _executor(executable, tmp_path / "repo")

    async def exercise() -> None:
        started = await executor.start(_request("FAIL_THEN_SLEEP"))
        assert started.session_ref is not None

        await asyncio.sleep(0.1)
        cancellation = await executor.cancel(started.session_ref)
        status = await executor.get_status(started.session_ref)
        result = await executor.fetch_result(started.session_ref)

        assert cancellation.outcome is CancellationOutcome.ALREADY_TERMINAL
        assert status is ExecutionStatus.FAILED
        assert result.outcome is ExecutionOutcome.FAILURE

    asyncio.run(exercise())


def test_codex_protocol_ambiguity_fails_closed_to_unknown(tmp_path: Path) -> None:
    executable, _log_path = _write_fake_codex(tmp_path)
    executor = _executor(executable, tmp_path / "repo")

    async def exercise() -> None:
        started = await executor.start(_request("PROTOCOL_EXEC"))
        assert started.session_ref is not None

        status = await _terminal_status(executor, started.session_ref)
        result = await executor.fetch_result(started.session_ref)

        assert status is ExecutionStatus.UNKNOWN
        assert result.outcome is ExecutionOutcome.UNKNOWN

    asyncio.run(exercise())


def test_codex_cancellation_is_confirmed_only_after_local_process_exit(tmp_path: Path) -> None:
    executable, _log_path = _write_fake_codex(tmp_path)
    executor = _executor(executable, tmp_path / "repo")

    async def exercise() -> None:
        started = await executor.start(_request("SLEEP_EXEC"))
        assert started.session_ref is not None

        cancellation = await executor.cancel(started.session_ref)
        status = await executor.get_status(started.session_ref)
        result = await executor.fetch_result(started.session_ref)

        assert cancellation.outcome is CancellationOutcome.CONFIRMED_CANCELLED
        assert status is ExecutionStatus.CANCELLED
        assert result.outcome is ExecutionOutcome.CANCELLED

    asyncio.run(exercise())


def test_codex_restart_reconciliation_fails_closed_without_resuming_turn(
    tmp_path: Path,
) -> None:
    executable, _log_path = _write_fake_codex(tmp_path)
    worktree = tmp_path / "repo"
    first = _executor(executable, worktree)
    second = _executor(executable, worktree)

    async def exercise() -> None:
        started = await first.start(_request("SLEEP_EXEC"))
        assert started.session_ref is not None

        reconciliation = await second.reconcile(started.session_ref)
        result = await second.fetch_result(started.session_ref)

        assert reconciliation.status is ExecutionStatus.UNKNOWN
        assert result.outcome is ExecutionOutcome.UNKNOWN

        await first.cancel(started.session_ref)

    asyncio.run(exercise())


def test_codex_rejects_foreign_executor_session(tmp_path: Path) -> None:
    executable, _log_path = _write_fake_codex(tmp_path)
    executor = _executor(executable, tmp_path / "repo")
    foreign = ExecutorSessionRef(
        executor_id=ExecutorId.parse("99999999-9999-4999-8999-999999999999"),
        opaque_session_id="foreign",
        created_at=datetime.now(UTC),
    )

    with pytest.raises(DomainInvariantError, match="different Executor"):
        asyncio.run(executor.get_status(foreign))


def test_codex_context_failure_happens_before_real_execution_start(tmp_path: Path) -> None:
    executable, log_path = _write_fake_codex(tmp_path)

    def fail_context(_agent_run_id: AgentRunId) -> CodexExecutionContext:
        raise CodexExecutionContextError("unsafe")

    executor = CodexExecutor(
        execution_context_resolver=fail_context,
        executable=str(executable),
        probe_timeout_seconds=1.0,
    )

    result = asyncio.run(executor.start(_request()))

    assert result.outcome is StartExecutionOutcome.FAILED
    assert result.session_ref is None
    assert not any(entry["kind"] == "exec" for entry in _log_entries(log_path))
