"""Safe local Codex CLI ExecutorAdapter."""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import signal
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from agent_office.domain import (
    AgentAccessMode,
    AgentRunId,
    CancelExecutionResult,
    CancellationOutcome,
    CapabilityRecord,
    CapabilityReport,
    CapabilitySupport,
    DomainInvariantError,
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

CODEX_EXECUTOR_ID = ExecutorId.parse("00000000-0000-4000-8000-000000000002")
CODEX_EXECUTOR_NAME = "Codex"

_STREAM_LIMIT = 1024 * 1024
_SAFE_ENVIRONMENT_NAMES = (
    "CODEX_HOME",
    "HOME",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "LOGNAME",
    "PATH",
    "TMPDIR",
    "USER",
)


class CodexExecutionContextError(RuntimeError):
    """A safe local Codex execution context could not be resolved."""


@dataclass(frozen=True, slots=True)
class CodexExecutionContext:
    """Infrastructure-only cwd and access mode for one AgentRun."""

    working_directory: Path
    access_mode: AgentAccessMode


ExecutionContextResolver = Callable[[AgentRunId], CodexExecutionContext]
Clock = Callable[[], datetime]


@dataclass(slots=True)
class _Session:
    process: asyncio.subprocess.Process
    stderr_task: asyncio.Task[None]
    status: ExecutionStatus = ExecutionStatus.RUNNING
    result: ExecutionResult | None = None
    consumer_task: asyncio.Task[None] | None = None
    turn_completed: bool = False
    failed: bool = False
    protocol_error: bool = False
    cancellation_requested: bool = False


class CodexExecutor:
    """Run Codex non-interactively inside Agent Office-controlled directories."""

    def __init__(
        self,
        *,
        execution_context_resolver: ExecutionContextResolver,
        executable: str = "codex",
        model: str | None = None,
        start_timeout_seconds: float = 10.0,
        cancel_timeout_seconds: float = 2.0,
        probe_timeout_seconds: float = 3.0,
        executor_id: ExecutorId = CODEX_EXECUTOR_ID,
        clock: Clock = utc_now,
    ) -> None:
        if not executable.strip():
            raise ValueError("Codex executable must not be empty")
        if min(start_timeout_seconds, cancel_timeout_seconds, probe_timeout_seconds) <= 0:
            raise ValueError("Codex timeouts must be positive")

        self._resolve_context = execution_context_resolver
        self._executable = executable
        self._model = model.strip() if model and model.strip() else None
        self._start_timeout = start_timeout_seconds
        self._cancel_timeout = cancel_timeout_seconds
        self._probe_timeout = probe_timeout_seconds
        self._executor_id = executor_id
        self._clock = clock
        self._sessions: dict[str, _Session] = {}

    def descriptor(self) -> ExecutorDescriptor:
        return ExecutorDescriptor(
            id=self._executor_id,
            kind=ExecutorKind.CODEX,
            name=CODEX_EXECUTOR_NAME,
            status=ExecutorStatus.UNKNOWN,
        )

    async def describe(self) -> ExecutorDescriptor:
        status, version, _ = await self._probe_health()
        return ExecutorDescriptor(
            id=self._executor_id,
            kind=ExecutorKind.CODEX,
            name=CODEX_EXECUTOR_NAME,
            status=status,
            runtime_version=version,
        )

    async def health(self) -> ExecutorHealth:
        status, _version, summary = await self._probe_health()
        return ExecutorHealth(
            status=status,
            checked_at=utc_now(self._clock),
            safe_summary=summary,
        )

    async def capabilities(self) -> CapabilityReport:
        now = utc_now(self._clock)
        supported = {
            ExecutorCapability.START_EXECUTION: (
                "Start is confirmed only after Codex emits thread.started."
            ),
            ExecutorCapability.STATUS_QUERY: (
                "Status is authoritative only while the local Codex process remains attached."
            ),
            ExecutorCapability.CANCELLATION: (
                "Cancellation is confirmed only after local Codex process termination."
            ),
            ExecutorCapability.SHELL_EXECUTION: (
                "Commands run inside the Codex sandbox and are not individually intercepted."
            ),
            ExecutorCapability.FILE_WRITE: (
                "Writes require an Agent Office-managed Workspace and workspace-write sandbox."
            ),
        }
        unsupported = {
            ExecutorCapability.EVENT_STREAM: ("Raw Codex JSONL remains private to the adapter."),
            ExecutorCapability.SESSION_RESUME: (
                "Resume starts another turn, so restart reconciliation returns UNKNOWN."
            ),
            ExecutorCapability.FILE_DIFF: (
                "Agent Office Git inspection is authoritative for file changes."
            ),
            ExecutorCapability.TOOL_EVENTS: (
                "Raw Codex tool events are not exposed by the initial adapter."
            ),
            ExecutorCapability.TOKEN_USAGE: (
                "Usage is not represented by the current provider-neutral result model."
            ),
            ExecutorCapability.BROWSER_CONTROL: (
                "Browser and web-search access are disabled for executor runs."
            ),
        }

        records = []
        for capability in ExecutorCapability:
            support = (
                CapabilitySupport.SUPPORTED
                if capability in supported
                else CapabilitySupport.UNSUPPORTED
            )
            records.append(
                CapabilityRecord(
                    capability=capability,
                    support=support,
                    limitations=supported.get(capability, unsupported.get(capability)),
                    source="codex-cli-jsonl",
                    checked_at=now,
                )
            )

        return CapabilityReport(
            executor_id=self._executor_id,
            capabilities=tuple(records),
        )

    async def start(self, request: StartExecutionRequest) -> StartExecutionResult:
        executable = self._resolve_executable()
        if executable is None:
            return self._start_failed("Codex CLI is not available.")

        health = await self.health()
        if health.status is not ExecutorStatus.AVAILABLE:
            return self._start_failed(health.safe_summary or "Codex is unavailable.")

        try:
            context = self._resolve_context(request.agent_run_id)
            cwd = context.working_directory.expanduser().resolve(strict=True)
        except (CodexExecutionContextError, DomainInvariantError, OSError, ValueError):
            return self._start_failed("A safe Codex execution context could not be resolved.")

        sandbox = self._sandbox_for(context.access_mode)
        if sandbox is None:
            return self._start_failed("The AgentRun access mode is not supported by Codex.")

        try:
            process = await asyncio.create_subprocess_exec(
                executable,
                *self._arguments(cwd, sandbox),
                cwd=str(cwd),
                env=self._bounded_environment(),
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                limit=_STREAM_LIMIT,
                start_new_session=(os.name != "nt"),
            )
        except (OSError, ValueError):
            return self._start_failed("Codex CLI could not be started.")

        stderr_task = asyncio.create_task(self._discard_stderr(process))

        if process.stdin is None or process.stdout is None:
            await self._terminate_untracked(process, stderr_task)
            return self._start_unknown("Codex process streams were unavailable after start.")

        try:
            process.stdin.write(request.instruction.encode("utf-8"))
            await process.stdin.drain()
            process.stdin.close()
        except (BrokenPipeError, ConnectionError, OSError):
            outcome = (
                StartExecutionOutcome.FAILED
                if process.returncode is not None
                else StartExecutionOutcome.UNKNOWN
            )
            await self._terminate_untracked(process, stderr_task)
            if outcome is StartExecutionOutcome.FAILED:
                return self._start_failed("Codex exited before accepting the instruction.")
            return self._start_unknown("Codex instruction delivery outcome is unknown.")

        try:
            outcome, thread_id = await asyncio.wait_for(
                self._observe_start(process),
                timeout=self._start_timeout,
            )
        except TimeoutError:
            await self._terminate_untracked(process, stderr_task)
            return self._start_unknown(
                "Codex did not provide a session identity before the start timeout."
            )

        if outcome is not StartExecutionOutcome.STARTED or thread_id is None:
            await self._terminate_untracked(process, stderr_task)
            if outcome is StartExecutionOutcome.FAILED:
                return self._start_failed("Codex failed before a session identity was established.")
            return self._start_unknown("Codex start outcome could not be established safely.")

        if thread_id in self._sessions:
            await self._terminate_untracked(process, stderr_task)
            return self._start_unknown("Codex returned a session identity already in use.")

        stored = _Session(process=process, stderr_task=stderr_task)
        self._sessions[thread_id] = stored
        stored.consumer_task = asyncio.create_task(self._consume(stored))

        return StartExecutionResult(
            outcome=StartExecutionOutcome.STARTED,
            session_ref=ExecutorSessionRef(
                executor_id=self._executor_id,
                opaque_session_id=thread_id,
                created_at=utc_now(self._clock),
                safe_metadata=(
                    ("executor_kind", ExecutorKind.CODEX.value),
                    ("session_persistence", "ephemeral"),
                ),
            ),
            safe_summary="Codex execution started.",
            retryable=False,
        )

    async def get_status(self, session: ExecutorSessionRef) -> ExecutionStatus:
        stored = self._find_session(session)
        if stored is None:
            return ExecutionStatus.UNKNOWN
        await self._settle(stored)
        return stored.status

    async def cancel(self, session: ExecutorSessionRef) -> CancelExecutionResult:
        stored = self._find_session(session)
        if stored is None:
            return CancelExecutionResult(
                outcome=CancellationOutcome.UNKNOWN,
                safe_summary="Codex session is not attached to this Agent Office process.",
            )

        await self._settle(stored)
        if stored.status in {
            ExecutionStatus.COMPLETED,
            ExecutionStatus.FAILED,
            ExecutionStatus.CANCELLED,
        }:
            return CancelExecutionResult(
                outcome=CancellationOutcome.ALREADY_TERMINAL,
                safe_summary="Codex execution is already terminal.",
            )

        stored.cancellation_requested = True
        try:
            self._signal_termination(stored.process)
        except (OSError, ProcessLookupError):
            return CancelExecutionResult(
                outcome=CancellationOutcome.UNKNOWN,
                safe_summary="Codex cancellation outcome is unknown.",
            )

        try:
            await asyncio.wait_for(stored.process.wait(), timeout=self._cancel_timeout)
        except TimeoutError:
            return CancelExecutionResult(
                outcome=CancellationOutcome.REQUESTED,
                safe_summary="Codex cancellation was requested but is not yet confirmed.",
            )

        await self._settle(stored)
        if stored.status is ExecutionStatus.CANCELLED:
            return CancelExecutionResult(
                outcome=CancellationOutcome.CONFIRMED_CANCELLED,
                safe_summary="Codex local execution process was terminated.",
            )
        if stored.status in {ExecutionStatus.COMPLETED, ExecutionStatus.FAILED}:
            return CancelExecutionResult(
                outcome=CancellationOutcome.ALREADY_TERMINAL,
                safe_summary="Codex execution became terminal before cancellation completed.",
            )
        return CancelExecutionResult(
            outcome=CancellationOutcome.UNKNOWN,
            safe_summary="Codex cancellation outcome is unknown.",
        )

    async def reconcile(self, session: ExecutorSessionRef) -> ReconciliationResult:
        stored = self._find_session(session)
        if stored is None:
            return ReconciliationResult(
                status=ExecutionStatus.UNKNOWN,
                safe_summary=(
                    "Codex session is not attached to this Agent Office process; "
                    "restart reconciliation cannot prove external state."
                ),
            )
        await self._settle(stored)
        return ReconciliationResult(
            status=stored.status,
            safe_summary="Codex local execution state was reconciled.",
        )

    async def fetch_result(self, session: ExecutorSessionRef) -> ExecutionResult:
        stored = self._find_session(session)
        if stored is None:
            return ExecutionResult(
                outcome=ExecutionOutcome.UNKNOWN,
                summary="Codex execution result is unavailable.",
            )
        await self._settle(stored)
        return stored.result or ExecutionResult(
            outcome=ExecutionOutcome.UNKNOWN,
            summary="Codex execution has not produced a proven terminal result.",
        )

    async def _probe_health(self) -> tuple[ExecutorStatus, str | None, str]:
        executable = self._resolve_executable()
        if executable is None:
            return ExecutorStatus.UNAVAILABLE, None, "Codex CLI is not installed or executable."

        version = await self._probe(executable, "--version")
        if version is None or version[0] != 0:
            return ExecutorStatus.UNAVAILABLE, None, "Codex CLI version probe failed."

        version_text = self._safe_version(version[1])
        login = await self._probe(executable, "login", "status")
        if login is None or login[0] != 0:
            return (
                ExecutorStatus.UNAVAILABLE,
                version_text,
                "Codex CLI is installed but provider-native login is unavailable.",
            )

        return (
            ExecutorStatus.AVAILABLE,
            version_text,
            "Codex CLI is installed and authenticated.",
        )

    async def _probe(self, executable: str, *args: str) -> tuple[int, bytes] | None:
        try:
            process = await asyncio.create_subprocess_exec(
                executable,
                *args,
                env=self._bounded_environment(),
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                limit=16 * 1024,
            )
            stdout, _ = await asyncio.wait_for(
                process.communicate(),
                timeout=self._probe_timeout,
            )
        except (OSError, TimeoutError, ValueError):
            return None
        return process.returncode or 0, stdout[:1024]

    def _resolve_executable(self) -> str | None:
        candidate = Path(self._executable).expanduser()
        if candidate.is_absolute() or len(candidate.parts) > 1:
            try:
                resolved = candidate.resolve(strict=True)
            except OSError:
                return None
            if resolved.is_file() and os.access(resolved, os.X_OK):
                return str(resolved)
            return None
        return shutil.which(self._executable, path=os.environ.get("PATH"))

    def _arguments(self, cwd: Path, sandbox: str) -> list[str]:
        args = [
            "exec",
            "--json",
            "--ephemeral",
            "--ignore-user-config",
            "--ignore-rules",
            "--disable",
            "apps",
            "--disable",
            "plugins",
            "--disable",
            "multi_agent",
            "--color",
            "never",
            "--sandbox",
            sandbox,
            "--cd",
            str(cwd),
            "--config",
            'approval_policy="never"',
            "--config",
            'web_search="disabled"',
            "--config",
            "mcp_servers={}",
        ]
        if sandbox == "workspace-write":
            args.extend(["--config", "sandbox_workspace_write.network_access=false"])
        if self._model is not None:
            args.extend(["--model", self._model])
        args.append("-")
        return args

    async def _observe_start(
        self,
        process: asyncio.subprocess.Process,
    ) -> tuple[StartExecutionOutcome, str | None]:
        if process.stdout is None:
            return StartExecutionOutcome.UNKNOWN, None

        while True:
            try:
                line = await process.stdout.readline()
            except (OSError, ValueError):
                return StartExecutionOutcome.UNKNOWN, None

            if not line:
                if process.returncode not in {None, 0}:
                    return StartExecutionOutcome.FAILED, None
                return StartExecutionOutcome.UNKNOWN, None

            event = self._parse_event(line)
            if event is None:
                return StartExecutionOutcome.UNKNOWN, None

            event_type = event.get("type")
            if event_type == "thread.started":
                thread_id = event.get("thread_id")
                if isinstance(thread_id, str) and thread_id.strip():
                    return StartExecutionOutcome.STARTED, thread_id.strip()
                return StartExecutionOutcome.UNKNOWN, None

            if event_type in {"turn.failed", "error"}:
                return StartExecutionOutcome.FAILED, None

    async def _consume(self, stored: _Session) -> None:
        try:
            if stored.process.stdout is None:
                stored.protocol_error = True
            else:
                while True:
                    try:
                        line = await stored.process.stdout.readline()
                    except (OSError, ValueError):
                        stored.protocol_error = True
                        break

                    if not line:
                        break

                    event = self._parse_event(line)
                    if event is None:
                        stored.protocol_error = True
                        continue

                    event_type = event.get("type")
                    if event_type == "turn.started":
                        stored.status = ExecutionStatus.RUNNING
                    elif event_type == "turn.completed":
                        stored.turn_completed = True
                    elif event_type in {"turn.failed", "error"}:
                        stored.failed = True
        except Exception:  # noqa: BLE001 - provider protocol failure must fail closed
            stored.protocol_error = True
        finally:
            return_code: int | None
            try:
                return_code = await stored.process.wait()
            except Exception:  # noqa: BLE001 - process state is unproven
                return_code = None

            try:
                await stored.stderr_task
            except Exception:  # noqa: BLE001 - stderr is deliberately discarded
                pass

            if stored.protocol_error:
                self._finish(
                    stored,
                    ExecutionStatus.UNKNOWN,
                    ExecutionOutcome.UNKNOWN,
                    "Codex protocol state could not be interpreted safely.",
                )
            elif stored.turn_completed and return_code == 0:
                self._finish(
                    stored,
                    ExecutionStatus.COMPLETED,
                    ExecutionOutcome.SUCCESS,
                    "Codex execution completed successfully.",
                )
            elif stored.failed:
                self._finish(
                    stored,
                    ExecutionStatus.FAILED,
                    ExecutionOutcome.FAILURE,
                    "Codex execution failed.",
                )
            elif stored.cancellation_requested and return_code is not None:
                self._finish(
                    stored,
                    ExecutionStatus.CANCELLED,
                    ExecutionOutcome.CANCELLED,
                    "Codex local execution process was cancelled.",
                )
            elif return_code is not None and return_code != 0:
                self._finish(
                    stored,
                    ExecutionStatus.FAILED,
                    ExecutionOutcome.FAILURE,
                    "Codex execution failed.",
                )
            else:
                self._finish(
                    stored,
                    ExecutionStatus.UNKNOWN,
                    ExecutionOutcome.UNKNOWN,
                    "Codex execution ended without a proven final outcome.",
                )

    @staticmethod
    def _finish(
        stored: _Session,
        status: ExecutionStatus,
        outcome: ExecutionOutcome,
        summary: str,
    ) -> None:
        stored.status = status
        stored.result = ExecutionResult(outcome=outcome, summary=summary)

    async def _settle(self, stored: _Session) -> None:
        task = stored.consumer_task
        if task is None:
            return
        if task.done() or stored.process.returncode is not None:
            try:
                await task
            except Exception:  # noqa: BLE001 - consumer failure remains UNKNOWN
                self._finish(
                    stored,
                    ExecutionStatus.UNKNOWN,
                    ExecutionOutcome.UNKNOWN,
                    "Codex execution state could not be reconciled safely.",
                )
        else:
            await asyncio.sleep(0)

    def _find_session(self, session: ExecutorSessionRef) -> _Session | None:
        if session.executor_id != self._executor_id:
            raise DomainInvariantError("Executor session belongs to a different Executor")
        return self._sessions.get(session.opaque_session_id)

    async def _terminate_untracked(
        self,
        process: asyncio.subprocess.Process,
        stderr_task: asyncio.Task[None],
    ) -> None:
        if process.returncode is None:
            try:
                self._signal_termination(process)
            except (OSError, ProcessLookupError):
                pass
        try:
            await asyncio.wait_for(process.wait(), timeout=self._cancel_timeout)
        except TimeoutError:
            if process.returncode is None:
                try:
                    process.kill()
                except (OSError, ProcessLookupError):
                    pass
                await process.wait()
        try:
            await stderr_task
        except Exception:  # noqa: BLE001 - stderr is deliberately discarded
            pass

    @staticmethod
    async def _discard_stderr(process: asyncio.subprocess.Process) -> None:
        if process.stderr is None:
            return
        while await process.stderr.read(8192):
            pass

    @staticmethod
    def _signal_termination(process: asyncio.subprocess.Process) -> None:
        if process.returncode is not None:
            return
        if os.name != "nt":
            os.killpg(process.pid, signal.SIGTERM)
        else:
            process.terminate()

    @staticmethod
    def _parse_event(line: bytes) -> dict[str, object] | None:
        if len(line) > _STREAM_LIMIT:
            return None
        try:
            value = json.loads(line)
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None
        return value if isinstance(value, dict) else None

    @staticmethod
    def _sandbox_for(access_mode: AgentAccessMode) -> str | None:
        if access_mode is AgentAccessMode.READ_ONLY:
            return "read-only"
        if access_mode in {AgentAccessMode.BOUNDED_WRITE, AgentAccessMode.WRITE}:
            return "workspace-write"
        return None

    @staticmethod
    def _safe_version(raw: bytes) -> str | None:
        lines = raw.decode("utf-8", errors="replace").strip().splitlines()
        return lines[0][:120] if lines else None

    @staticmethod
    def _bounded_environment() -> dict[str, str]:
        environment = {
            name: value
            for name in _SAFE_ENVIRONMENT_NAMES
            if (value := os.environ.get(name)) is not None
        }
        environment["NO_COLOR"] = "1"
        return environment

    @staticmethod
    def _start_failed(summary: str) -> StartExecutionResult:
        return StartExecutionResult(
            outcome=StartExecutionOutcome.FAILED,
            safe_summary=summary,
            retryable=False,
        )

    @staticmethod
    def _start_unknown(summary: str) -> StartExecutionResult:
        return StartExecutionResult(
            outcome=StartExecutionOutcome.UNKNOWN,
            safe_summary=summary,
            retryable=False,
        )
