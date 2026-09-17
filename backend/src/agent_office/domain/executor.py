"""Provider-neutral Executor domain primitives."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.identifiers import AgentRunId, ExecutorId
from agent_office.domain.timestamps import to_utc

SafeMetadata = tuple[tuple[str, str], ...]

_FORBIDDEN_METADATA_KEY_FRAGMENTS = (
    "authorization",
    "cookie",
    "password",
    "secret",
    "token",
)


class ExecutorKind(StrEnum):
    REFERENCE = "REFERENCE"
    CODEX = "CODEX"
    ANTIGRAVITY = "ANTIGRAVITY"
    OPENCLAW = "OPENCLAW"


class ExecutorStatus(StrEnum):
    AVAILABLE = "AVAILABLE"
    DEGRADED = "DEGRADED"
    UNAVAILABLE = "UNAVAILABLE"
    DISABLED = "DISABLED"
    UNKNOWN = "UNKNOWN"


class ExecutorCapability(StrEnum):
    """Capabilities defined by the Executor Adapter Contract."""

    START_EXECUTION = "START_EXECUTION"
    STATUS_QUERY = "STATUS_QUERY"
    CANCELLATION = "CANCELLATION"
    EVENT_STREAM = "EVENT_STREAM"
    SESSION_RESUME = "SESSION_RESUME"
    STRUCTURED_RESULT = "STRUCTURED_RESULT"
    FILE_DIFF = "FILE_DIFF"
    TOOL_EVENTS = "TOOL_EVENTS"
    TOKEN_USAGE = "TOKEN_USAGE"
    SUBAGENTS = "SUBAGENTS"
    PARALLEL_AGENTS = "PARALLEL_AGENTS"
    VISION_INPUT = "VISION_INPUT"
    BROWSER_CONTROL = "BROWSER_CONTROL"
    SHELL_EXECUTION = "SHELL_EXECUTION"
    FILE_WRITE = "FILE_WRITE"


class CapabilitySupport(StrEnum):
    SUPPORTED = "SUPPORTED"
    UNSUPPORTED = "UNSUPPORTED"
    UNKNOWN = "UNKNOWN"


class StartExecutionOutcome(StrEnum):
    STARTED = "STARTED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    FAILED = "FAILED"
    UNKNOWN = "UNKNOWN"


class ExecutionStatus(StrEnum):
    PENDING = "PENDING"
    STARTING = "STARTING"
    RUNNING = "RUNNING"
    WAITING = "WAITING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    UNKNOWN = "UNKNOWN"


class ExecutionOutcome(StrEnum):
    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"
    CANCELLED = "CANCELLED"
    UNKNOWN = "UNKNOWN"


class CancellationOutcome(StrEnum):
    REQUESTED = "REQUESTED"
    CONFIRMED_CANCELLED = "CONFIRMED_CANCELLED"
    ALREADY_TERMINAL = "ALREADY_TERMINAL"
    UNSUPPORTED = "UNSUPPORTED"
    FAILED = "FAILED"
    UNKNOWN = "UNKNOWN"


@dataclass(frozen=True, slots=True)
class ExecutorDescriptor:
    """Safe identity and current state of an Executor."""

    id: ExecutorId
    kind: ExecutorKind
    name: str
    status: ExecutorStatus
    runtime_version: str | None = None

    def __post_init__(self) -> None:
        name = self.name.strip()

        if not name:
            raise DomainInvariantError("Executor name must not be empty")

        object.__setattr__(self, "name", name)


@dataclass(frozen=True, slots=True)
class CapabilityRecord:
    """One factual Executor capability observation."""

    capability: ExecutorCapability
    support: CapabilitySupport
    limitations: str | None = None
    source: str | None = None
    checked_at: datetime | None = None

    def __post_init__(self) -> None:
        if self.checked_at is not None:
            object.__setattr__(
                self,
                "checked_at",
                to_utc(self.checked_at),
            )


@dataclass(frozen=True, slots=True)
class CapabilityReport:
    """Immutable capability snapshot for one Executor."""

    executor_id: ExecutorId
    capabilities: tuple[CapabilityRecord, ...]

    def __post_init__(self) -> None:
        names = [record.capability for record in self.capabilities]

        if len(names) != len(set(names)):
            raise DomainInvariantError("Capability report must not contain duplicate capabilities")

    def support_for(
        self,
        capability: ExecutorCapability,
    ) -> CapabilitySupport:
        """Return factual support, defaulting missing knowledge to UNKNOWN."""

        for record in self.capabilities:
            if record.capability is capability:
                return record.support

        return CapabilitySupport.UNKNOWN


@dataclass(frozen=True, slots=True)
class ExecutorHealth:
    """Safe current Executor health observation."""

    status: ExecutorStatus
    checked_at: datetime
    safe_summary: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "checked_at",
            to_utc(self.checked_at),
        )


@dataclass(frozen=True, slots=True)
class ExecutorSessionRef:
    """Opaque provider session reference safe for core persistence."""

    executor_id: ExecutorId
    opaque_session_id: str
    created_at: datetime
    safe_metadata: SafeMetadata = ()

    def __post_init__(self) -> None:
        session_id = self.opaque_session_id.strip()

        if not session_id:
            raise DomainInvariantError("Executor session ID must not be empty")

        metadata = validate_safe_metadata(self.safe_metadata)

        object.__setattr__(
            self,
            "opaque_session_id",
            session_id,
        )
        object.__setattr__(
            self,
            "created_at",
            to_utc(self.created_at),
        )
        object.__setattr__(
            self,
            "safe_metadata",
            metadata,
        )


@dataclass(frozen=True, slots=True)
class StartExecutionRequest:
    """Resolved, bounded request supplied to an Executor adapter."""

    agent_run_id: AgentRunId
    instruction: str
    safe_context: SafeMetadata = ()

    def __post_init__(self) -> None:
        instruction = self.instruction.strip()

        if not instruction:
            raise DomainInvariantError("Execution instruction must not be empty")

        object.__setattr__(self, "instruction", instruction)
        object.__setattr__(
            self,
            "safe_context",
            validate_safe_metadata(self.safe_context),
        )


@dataclass(frozen=True, slots=True)
class StartExecutionResult:
    """Canonical result of attempting to start execution."""

    outcome: StartExecutionOutcome
    session_ref: ExecutorSessionRef | None = None
    safe_summary: str | None = None
    retryable: bool | None = None


@dataclass(frozen=True, slots=True)
class CancelExecutionResult:
    """Canonical cancellation acknowledgement."""

    outcome: CancellationOutcome
    safe_summary: str | None = None


@dataclass(frozen=True, slots=True)
class ReconciliationResult:
    """Canonical observation produced by session reconciliation."""

    status: ExecutionStatus
    safe_summary: str | None = None


@dataclass(frozen=True, slots=True)
class ExecutionResult:
    """Canonical final execution result."""

    outcome: ExecutionOutcome
    summary: str
    safe_metadata: SafeMetadata = ()

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "safe_metadata",
            validate_safe_metadata(self.safe_metadata),
        )


def validate_safe_metadata(
    metadata: SafeMetadata,
) -> SafeMetadata:
    seen: set[str] = set()
    normalized: list[tuple[str, str]] = []

    for raw_key, value in metadata:
        key = raw_key.strip()

        if not key:
            raise DomainInvariantError("Safe metadata key must not be empty")

        lowered = key.lower()

        if any(fragment in lowered for fragment in _FORBIDDEN_METADATA_KEY_FRAGMENTS):
            raise DomainInvariantError("Safe metadata must not contain secret-bearing keys")

        if lowered in seen:
            raise DomainInvariantError("Safe metadata keys must be unique")

        seen.add(lowered)
        normalized.append((key, value))

    return tuple(normalized)
