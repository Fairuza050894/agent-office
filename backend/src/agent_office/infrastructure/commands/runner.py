"""Bounded, argument-safe command execution.

This is the only place in Agent Office that runs a verification command. It is
deliberately narrow:

* the command is an argv vector and is never routed through a shell
  (SECURITY_MODEL §34-§35);
* the working directory is supplied by the caller from proven Workspace
  identity, never from a request payload (SECURITY_MODEL §33);
* the environment is an explicit allowlist, never the parent process environment
  (SECURITY_MODEL §16);
* stdout and stderr are read incrementally and capped in memory, so an
  unbounded-producing command cannot exhaust the process (SECURITY_MODEL §362);
* captured text is redacted before it can reach Event or Evidence storage
  (SECURITY_MODEL §17).

Nothing here decides *whether* a command may run. That is the command policy's
decision, taken before this module is reached.
"""

from __future__ import annotations

import os
import re
import signal
import subprocess
import threading
import time
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path

from agent_office.domain import (
    CommandOutcome,
    CommandStatus,
    VerificationCheckDefinition,
)

#: Read granularity while draining a pipe.
_CHUNK_BYTES = 8192

#: Environment variable names the runner forwards from the parent process. The
#: complete parent environment is never inherited (SECURITY_MODEL §16).
_ENVIRONMENT_ALLOWLIST: tuple[str, ...] = (
    "PATH",
    "HOME",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TMPDIR",
    "TZ",
)

#: Fixed values that are always set, so a command cannot be steered through a
#: terminal or a caller-supplied locale.
_FIXED_ENVIRONMENT: dict[str, str] = {
    "TERM": "dumb",
    "GIT_TERMINAL_PROMPT": "0",
    "GIT_ASKPASS": "",
}

_REDACTED = "<redacted>"
_RELATIVE_PLACEHOLDER = "<workspace>"

#: ``key = value`` / ``key: value`` shapes where only the value is secret, so the
#: key is kept for diagnosability.
_SECRET_ASSIGNMENT_PATTERN = re.compile(
    r"(?i)\b(api[_-]?key|access[_-]?key|secret|token|password|passwd|credential|"
    r"authorization|auth)\b\s*[:=]\s*[^\s,;\"']+"
)

#: Self-identifying credential shapes, redacted whole.
_SECRET_TOKEN_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}"),
    re.compile(r"\b(?:sk|pk|rk)-[A-Za-z0-9]{12,}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{16,}\b"),
    re.compile(r"\bAKIA[0-9A-Z]{12,}\b"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
)

#: Absolute host paths, so a captured log cannot leak the developer's machine
#: layout into durable storage.
_ABSOLUTE_PATH_PATTERN = re.compile(
    r"(?:/Users|/home|/private|/var|/tmp|/opt|/etc|/root)(?:/[^\s:'\"`,;)\]]*)*"
)


def redact_output(text: str, *, workspace_path: Path | None = None) -> str:
    """Redact secrets and host paths from captured command output.

    The command's own working directory is replaced with a stable placeholder
    first, so repository-relative information survives while the machine layout
    does not.
    """

    redacted = text

    if workspace_path is not None:
        for candidate in {str(workspace_path), str(workspace_path.resolve())}:
            redacted = redacted.replace(candidate, _RELATIVE_PLACEHOLDER)

    redacted = _SECRET_ASSIGNMENT_PATTERN.sub(
        lambda match: f"{match.group(1)}={_REDACTED}",
        redacted,
    )

    for pattern in _SECRET_TOKEN_PATTERNS:
        redacted = pattern.sub(_REDACTED, redacted)

    return _ABSOLUTE_PATH_PATTERN.sub("<path>", redacted)


def build_environment(
    *,
    declared_names: tuple[str, ...] = (),
    parent: Mapping[str, str] | None = None,
) -> dict[str, str]:
    """Build the bounded environment for one command execution.

    Only an explicit allowlist is forwarded, plus any name the check definition
    declared — and a declared name is still refused if it is on the forbidden
    list, which the domain already enforces at construction time.
    """

    source = os.environ if parent is None else parent
    environment: dict[str, str] = dict(_FIXED_ENVIRONMENT)

    for name in (*_ENVIRONMENT_ALLOWLIST, *declared_names):
        if name in _FIXED_ENVIRONMENT:
            continue

        value = source.get(name)

        if value is not None:
            environment[name] = value

    return environment


def environment_names() -> tuple[str, ...]:
    """Return the names the runner may forward, for documentation and tests."""

    return _ENVIRONMENT_ALLOWLIST


def _drain(stream: object, cap: int) -> tuple[bytes, bool]:
    """Read a pipe to end-of-stream, keeping at most ``cap`` bytes.

    The stream is always drained fully so the child never blocks on a full pipe,
    but only the bounded prefix is retained.
    """

    collected: list[bytes] = []
    total = 0
    truncated = False

    while True:
        chunk = stream.read(_CHUNK_BYTES)  # type: ignore[attr-defined]

        if not chunk:
            break

        if total < cap:
            take = min(cap - total, len(chunk))
            collected.append(chunk[:take])
            total += take

            if take < len(chunk):
                truncated = True
        else:
            truncated = True

    return b"".join(collected), truncated


class CommandRunner:
    """Execute one bounded verification command inside a workspace."""

    def run(
        self,
        definition: VerificationCheckDefinition,
        *,
        working_directory: Path,
    ) -> CommandOutcome:
        """Execute a check definition and return its factual outcome.

        A spawn failure and a timeout are reported as distinct statuses, never as
        a passing or failing test result.
        """

        started_at = datetime.now(UTC)
        monotonic_start = time.monotonic()

        try:
            process = subprocess.Popen(
                list(definition.argv),
                cwd=str(working_directory),
                env=build_environment(declared_names=definition.environment_names),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                shell=False,
                close_fds=True,
                # A new session keeps the child from sharing the server's
                # terminal, and makes a bounded group kill possible.
                start_new_session=True,
            )
        except (OSError, ValueError) as exc:
            completed_at = datetime.now(UTC)

            return CommandOutcome(
                status=CommandStatus.ERROR,
                started_at=started_at,
                completed_at=completed_at,
                duration_ms=max(0, int((time.monotonic() - monotonic_start) * 1000)),
                safe_summary=f"The command could not be started: {type(exc).__name__}.",
            )

        limit = definition.output_limit_bytes
        stdout_chunks: list[tuple[bytes, bool]] = []
        stderr_chunks: list[tuple[bytes, bool]] = []

        def collect(target: list[tuple[bytes, bool]], stream: object) -> None:
            target.append(_drain(stream, limit))

        stdout_thread = threading.Thread(
            target=collect,
            args=(stdout_chunks, process.stdout),
            daemon=True,
        )
        stderr_thread = threading.Thread(
            target=collect,
            args=(stderr_chunks, process.stderr),
            daemon=True,
        )
        stdout_thread.start()
        stderr_thread.start()

        timed_out = False

        try:
            exit_code = process.wait(timeout=definition.timeout_seconds)
        except subprocess.TimeoutExpired:
            timed_out = True
            exit_code = None
            self._terminate_group(process)

        stdout_thread.join(timeout=5)
        stderr_thread.join(timeout=5)

        raw_stdout = stdout_chunks[0][0] if stdout_chunks else b""
        raw_stderr = stderr_chunks[0][0] if stderr_chunks else b""
        truncated = bool(
            (stdout_chunks and stdout_chunks[0][1]) or (stderr_chunks and stderr_chunks[0][1])
        )

        completed_at = datetime.now(UTC)

        stdout = redact_output(
            raw_stdout.decode("utf-8", errors="replace"),
            workspace_path=working_directory,
        )
        stderr = redact_output(
            raw_stderr.decode("utf-8", errors="replace"),
            workspace_path=working_directory,
        )

        if timed_out:
            status = CommandStatus.TIMED_OUT
            summary = f"The command exceeded its {definition.timeout_seconds}s timeout."
        elif exit_code == 0:
            status = CommandStatus.PASSED
            summary = "The command exited 0."
        else:
            status = CommandStatus.FAILED
            summary = f"The command exited {exit_code}."

        return CommandOutcome(
            status=status,
            started_at=started_at,
            completed_at=completed_at,
            duration_ms=max(0, int((time.monotonic() - monotonic_start) * 1000)),
            exit_code=exit_code,
            stdout=stdout,
            stderr=stderr,
            output_truncated=truncated,
            safe_summary=summary,
        )

    @staticmethod
    def _terminate_group(process: subprocess.Popen[bytes]) -> None:
        """Terminate the command and its children, bounded and without a shell."""

        try:
            os.killpg(os.getpgid(process.pid), signal.SIGTERM)
        except (ProcessLookupError, PermissionError, OSError):
            pass

        try:
            process.wait(timeout=5)
            return
        except subprocess.TimeoutExpired:
            pass

        try:
            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
        except (ProcessLookupError, PermissionError, OSError):
            pass

        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            # The process is not reapable; the outcome is already reported as a
            # timeout, so nothing further is claimed about it.
            pass
