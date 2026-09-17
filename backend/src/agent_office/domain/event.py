"""Normalized, provider-neutral Event primitives.

Events describe observed or orchestrated facts. They are append-oriented,
immutable after persistence, secret-safe, and never the sole source of current
state. Provider raw payloads are not canonical events.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.identifiers import AgentRunId, EventId, ExecutorId, ProjectId, RunId
from agent_office.domain.timestamps import to_utc

EVENT_SCHEMA_VERSION = 1

SUPPORTED_EVENT_SCHEMA_VERSIONS: frozenset[int] = frozenset({EVENT_SCHEMA_VERSION})

MAX_EVENT_PAYLOAD_BYTES = 8192

MAX_EVENT_PAYLOAD_ENTRIES = 32

MAX_EVENT_PAYLOAD_VALUE_LENGTH = 1024

# Secret-bearing keys are dropped rather than persisted, and the removal is
# recorded in the event redaction metadata.
_SECRET_KEY_FRAGMENTS = (
    "apikey",
    "api_key",
    "authorization",
    "cookie",
    "credential",
    "password",
    "private_key",
    "secret",
    "token",
)

EventPayloadValue = str | int | bool | None

EventPayload = tuple[tuple[str, EventPayloadValue], ...]


class EventSource(StrEnum):
    """Logical producer of a canonical Event."""

    USER = "USER"
    SYSTEM = "SYSTEM"
    ORCHESTRATOR = "ORCHESTRATOR"
    EXECUTOR = "EXECUTOR"
    WORKSPACE = "WORKSPACE"
    TEST = "TEST"
    REVIEW = "REVIEW"
    EVIDENCE = "EVIDENCE"
    AUDIT = "AUDIT"


class EventType(StrEnum):
    """Canonical, provider-neutral event types supported in Phase 3A."""

    RUN_CREATED = "run.created"
    RUN_PLANNING_STARTED = "run.planning.started"
    RUN_READY = "run.ready"
    RUN_STARTED = "run.started"
    RUN_BLOCKED = "run.blocked"
    RUN_REVIEWING = "run.reviewing"
    RUN_REMEDIATING = "run.remediating"
    RUN_VERIFYING = "run.verifying"
    RUN_COMPLETED = "run.completed"
    RUN_FAILED = "run.failed"
    RUN_CANCEL_REQUESTED = "run.cancel.requested"
    RUN_CANCELLED = "run.cancelled"
    RUN_RESUMED = "run.resumed"

    WORKFLOW_SNAPSHOT_CREATED = "workflow.snapshot.created"

    STAGE_READY = "stage.ready"
    STAGE_STARTED = "stage.started"
    STAGE_WAITING = "stage.waiting"
    STAGE_COMPLETED = "stage.completed"
    STAGE_BLOCKED = "stage.blocked"
    STAGE_FAILED = "stage.failed"
    STAGE_SKIPPED = "stage.skipped"
    STAGE_CANCELLED = "stage.cancelled"

    REMEDIATION_STARTED = "remediation.started"
    REMEDIATION_COMPLETED = "remediation.completed"
    REMEDIATION_FAILED = "remediation.failed"
    REMEDIATION_CYCLE_EXHAUSTED = "remediation.cycle.exhausted"

    VERIFICATION_STARTED = "verification.started"
    VERIFICATION_FAILED = "verification.failed"
    VERIFICATION_COMPLETED = "verification.completed"

    AGENT_CREATED = "agent.created"
    AGENT_START_REQUESTED = "agent.start.requested"
    AGENT_STARTED = "agent.started"
    # ``agent.activity`` is optional, factual provider telemetry. The
    # orchestrator never synthesizes it; it may be persisted when an adapter
    # reports real activity, and it never changes AgentRun state.
    AGENT_ACTIVITY = "agent.activity"
    AGENT_WAITING = "agent.waiting"
    AGENT_COMPLETED = "agent.completed"
    AGENT_FAILED = "agent.failed"
    AGENT_BLOCKED = "agent.blocked"
    AGENT_CANCEL_REQUESTED = "agent.cancel.requested"
    AGENT_CANCELLED = "agent.cancelled"

    # The only reconciliation event in the canonical taxonomy (EVENT_CONTRACT
    # §36). Reconciliation is always the reconciliation of one executor
    # session, so it is never reported as a Run-domain event.
    EXECUTOR_SESSION_RECONCILED = "executor.session.reconciled"

    # Canonical Workspace events (EVENT_CONTRACT §38). Phase 4A emits every one
    # of them: allocation and lifecycle, change observation, conflict detection
    # when a second writer is refused, and bounded cleanup outcomes.
    WORKSPACE_ALLOCATION_REQUESTED = "workspace.allocation.requested"
    WORKSPACE_CREATED = "workspace.created"
    WORKSPACE_READY = "workspace.ready"
    WORKSPACE_CHANGED = "workspace.changed"
    WORKSPACE_CONFLICT_DETECTED = "workspace.conflict.detected"
    WORKSPACE_RELEASE_REQUESTED = "workspace.release.requested"
    WORKSPACE_RELEASED = "workspace.released"
    WORKSPACE_FAILED = "workspace.failed"
    WORKSPACE_ORPHANED = "workspace.orphaned"


def build_payload(
    pairs: tuple[tuple[str, EventPayloadValue], ...],
) -> tuple[EventPayload, tuple[str, ...]]:
    """Validate a payload and drop secret-bearing entries.

    Returns the retained payload plus the keys that were redacted.
    """

    if len(pairs) > MAX_EVENT_PAYLOAD_ENTRIES:
        raise DomainInvariantError("Event payload declares too many entries")

    retained: list[tuple[str, EventPayloadValue]] = []
    redacted: list[str] = []
    seen: set[str] = set()

    for raw_key, value in pairs:
        key = raw_key.strip()

        if not key:
            raise DomainInvariantError("Event payload key must not be empty")

        lowered = key.lower()

        if lowered in seen:
            raise DomainInvariantError("Event payload keys must be unique")

        seen.add(lowered)

        if any(fragment in lowered for fragment in _SECRET_KEY_FRAGMENTS):
            redacted.append(key)
            continue

        if isinstance(value, str) and len(value) > MAX_EVENT_PAYLOAD_VALUE_LENGTH:
            raise DomainInvariantError("Event payload value exceeds the bounded length")

        retained.append((key, value))

    return tuple(retained), tuple(redacted)


@dataclass(frozen=True, slots=True)
class Event:
    """One persisted normalized Event."""

    id: EventId
    schema_version: int
    event_type: EventType
    project_id: ProjectId
    run_id: RunId
    source: EventSource
    occurred_at: datetime
    recorded_at: datetime
    payload: EventPayload
    created_at: datetime
    agent_run_id: AgentRunId | None = None
    source_ref: str | None = None
    sequence: int | None = None
    correlation_id: str | None = None
    causation_id: str | None = None
    redacted_keys: tuple[str, ...] = ()
    external_event_id: str | None = None
    executor_id: ExecutorId | None = None

    def __post_init__(self) -> None:
        if self.schema_version not in SUPPORTED_EVENT_SCHEMA_VERSIONS:
            raise DomainInvariantError(f"Unsupported event schema version: {self.schema_version}")

        if self.sequence is not None and self.sequence < 0:
            raise DomainInvariantError("Event sequence must not be negative")

        if self.source_ref is not None and not self.source_ref.strip():
            raise DomainInvariantError("Event source reference must not be blank")

        if len(json.dumps(dict(self.payload)).encode()) > MAX_EVENT_PAYLOAD_BYTES:
            raise DomainInvariantError("Event payload exceeds the bounded size")

        object.__setattr__(self, "occurred_at", to_utc(self.occurred_at))
        object.__setattr__(self, "recorded_at", to_utc(self.recorded_at))
        object.__setattr__(self, "created_at", to_utc(self.created_at))

    @property
    def dedupe_key(self) -> str | None:
        """Return the external deduplication key, when one is safe to derive.

        The deduplication key follows the Event Contract: executor identity plus
        the executor session reference plus the external event identifier. When
        any part is unavailable the event is never deduplicated by identity.
        """

        if self.external_event_id is None or self.executor_id is None or self.source_ref is None:
            return None

        return f"{self.executor_id}|{self.source_ref}|{self.external_event_id}"
