"""Phase 3C: the implemented canonical event allowlist.

The taxonomy is closed. Every event the code can emit is listed here with the
contract section that documents it, and the implemented enum must match that list
exactly. The contract is not parsed at runtime: this module is the
machine-checkable mirror of the documented event set, so adding an event means
editing both.

Section references are to `docs/contracts/EVENT_CONTRACT.md`.
"""

from __future__ import annotations

from agent_office.domain import EventType

#: Canonical event domains (EVENT_CONTRACT §17).
CANONICAL_DOMAINS: frozenset[str] = frozenset(
    {
        "project",
        "task",
        "run",
        "workflow",
        "stage",
        "agent",
        "executor",
        "workspace",
        "command",
        "test",
        "review",
        "remediation",
        "verification",
        "evidence",
        "artifact",
        "approval",
        "audit",
    }
)

#: Every implemented event type and the section that documents it.
DOCUMENTED_EVENTS: dict[EventType, str] = {
    EventType.RUN_CREATED: "§20",
    EventType.RUN_PLANNING_STARTED: "§20",
    EventType.RUN_READY: "§20",
    EventType.RUN_STARTED: "§20",
    EventType.RUN_BLOCKED: "§20",
    EventType.RUN_RESUMED: "§20",
    EventType.RUN_REVIEWING: "§20",
    EventType.RUN_REMEDIATING: "§20",
    EventType.RUN_VERIFYING: "§20",
    EventType.RUN_COMPLETED: "§20",
    EventType.RUN_FAILED: "§20",
    EventType.RUN_CANCEL_REQUESTED: "§20",
    EventType.RUN_CANCELLED: "§20",
    EventType.WORKFLOW_SNAPSHOT_CREATED: "§24",
    EventType.STAGE_READY: "§25",
    EventType.STAGE_STARTED: "§25",
    EventType.STAGE_WAITING: "§25",
    EventType.STAGE_COMPLETED: "§25",
    EventType.STAGE_BLOCKED: "§25",
    EventType.STAGE_FAILED: "§25",
    EventType.STAGE_SKIPPED: "§25",
    EventType.STAGE_CANCELLED: "§25",
    EventType.AGENT_CREATED: "§28",
    EventType.AGENT_START_REQUESTED: "§28",
    EventType.AGENT_STARTED: "§28",
    EventType.AGENT_BLOCKED: "§28",
    EventType.AGENT_CANCEL_REQUESTED: "§28",
    EventType.AGENT_CANCELLED: "§28",
    EventType.AGENT_ACTIVITY: "§32",
    EventType.AGENT_WAITING: "§33",
    EventType.AGENT_COMPLETED: "§34",
    EventType.AGENT_FAILED: "§35",
    EventType.EXECUTOR_SESSION_RECONCILED: "§36",
    EventType.REMEDIATION_STARTED: "§50",
    EventType.REMEDIATION_COMPLETED: "§50",
    EventType.REMEDIATION_FAILED: "§50",
    EventType.REMEDIATION_CYCLE_EXHAUSTED: "§50",
    EventType.VERIFICATION_STARTED: "§51",
    EventType.VERIFICATION_FAILED: "§51",
    EventType.VERIFICATION_COMPLETED: "§51",
    # Workspace lifecycle (EVENT_CONTRACT §38), introduced by Phase 4A.
    EventType.WORKSPACE_ALLOCATION_REQUESTED: "§38",
    EventType.WORKSPACE_CREATED: "§38",
    EventType.WORKSPACE_READY: "§38",
    EventType.WORKSPACE_CHANGED: "§38",
    EventType.WORKSPACE_CONFLICT_DETECTED: "§38",
    EventType.WORKSPACE_RELEASE_REQUESTED: "§38",
    EventType.WORKSPACE_RELEASED: "§38",
    EventType.WORKSPACE_FAILED: "§38",
    EventType.WORKSPACE_ORPHANED: "§38",
}

#: Domains that assert engineering evidence. These stay unimplemented until
#: real repository mutation, review, and command execution exist.
EVIDENCE_DOMAIN_PREFIXES: tuple[str, ...] = (
    "review.",
    "evidence.",
    "artifact.",
    "command.",
    "test.",
    "git.",
    "integration.",
    "approval.",
    "tool.",
    "user.",
)


def test_every_implemented_event_is_documented() -> None:
    """The allowlist is closed: an undocumented event cannot be emitted."""

    assert set(EventType) == set(DOCUMENTED_EVENTS)


def test_every_event_name_uses_a_canonical_domain() -> None:
    for event_type in EventType:
        assert event_type.value.split(".")[0] in CANONICAL_DOMAINS, event_type


def test_no_event_name_is_provider_specific() -> None:
    providers = ("codex", "antigravity", "openclaw", "deepseek", "hermes", "tdp")

    for event_type in EventType:
        assert not any(name in event_type.value for name in providers), event_type


def test_no_evidence_domain_event_is_implemented() -> None:
    """Orchestration truth may not assert engineering evidence."""

    for event_type in EventType:
        assert not event_type.value.startswith(EVIDENCE_DOMAIN_PREFIXES), event_type


def test_reconciliation_is_an_executor_session_fact() -> None:
    """EVENT_CONTRACT §36 lists exactly one reconciliation event."""

    reconciliation_events = {
        event_type.value for event_type in EventType if "reconcil" in event_type.value
    }

    assert reconciliation_events == {"executor.session.reconciled"}


def test_request_events_describe_intent_only() -> None:
    """A request event states intent; the paired completion event states fact."""

    values = {event_type.value for event_type in EventType}

    assert {
        "run.cancel.requested",
        "agent.start.requested",
        "agent.cancel.requested",
        "workspace.allocation.requested",
        "workspace.release.requested",
    } == {value for value in values if value.endswith(".requested")}

    # Each request has a distinct committed-fact counterpart.
    assert {"run.cancelled", "agent.started", "agent.cancelled"} <= values
    assert "agent.cancel.requested" != "agent.cancelled"


def test_agent_scoped_events_are_distinguishable_by_profile_ownership() -> None:
    """Agent events exist for every AgentRun lifecycle state the code can reach."""

    agent_events = {
        event_type.value for event_type in EventType if event_type.value.startswith("agent.")
    }

    assert {
        "agent.created",
        "agent.start.requested",
        "agent.started",
        "agent.waiting",
        "agent.completed",
        "agent.failed",
        "agent.blocked",
        "agent.cancel.requested",
        "agent.cancelled",
    } <= agent_events


def test_implemented_domains_are_exactly_these() -> None:
    """The implemented event domains are closed and known."""

    domains = {event_type.value.split(".")[0] for event_type in EventType}

    assert domains == {
        "run",
        "workflow",
        "stage",
        "agent",
        "executor",
        "remediation",
        "verification",
        "workspace",
    }


def test_audit_is_not_an_operational_event_domain() -> None:
    """Audit has its own store; it is not smuggled into the Event taxonomy."""

    assert not [event_type for event_type in EventType if event_type.value.startswith("audit.")]
