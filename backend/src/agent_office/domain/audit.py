"""Audit primitives for manual control-plane interventions.

An AuditRecord is the durable, append-only record of an intervention applied to
canonical state. DOMAIN_MODEL §36 defines the shape and states that audit records
differ from operational Events: an Event is the normalized operational history of
what a Run's execution did, while an AuditRecord answers "which manual
intervention was applied, when, and to which target".

Agent Office does not authenticate operators in the local MVP. ``AuditActorType``
therefore records only where a request originated; ``actor_id`` stays unset
rather than naming a human that was never identified.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.executor import SafeMetadata, validate_safe_metadata
from agent_office.domain.identifiers import AuditRecordId, ProjectId, RunId
from agent_office.domain.timestamps import to_utc

# An audit record states what happened, not a request dump. The bound keeps a
# caller from persisting an unbounded payload through the audit path.
MAX_AUDIT_METADATA_ENTRIES = 8


class AuditActorType(StrEnum):
    """Where an audited intervention originated (DOMAIN_MODEL §36).

    ``USER`` claims only that a request arrived from outside the orchestrator. It
    never claims a named human, because no such identity exists locally. ``AGENT``
    and ``EXECUTOR`` are canonical but unused in Phase 3: no agent or executor
    initiates an audited control-plane intervention in this scope.
    """

    USER = "USER"
    SYSTEM = "SYSTEM"
    AGENT = "AGENT"
    EXECUTOR = "EXECUTOR"


class AuditAction(StrEnum):
    """The closed set of auditable control-plane interventions.

    The taxonomy remains closed: an unlisted action cannot be audited, so no
    caller can inject an arbitrary audited fact. Phase 20 adds the human result
    review and managed-delivery actions that close the Task value loop without
    changing the meaning of technical Run completion.
    """

    RUN_CANCELLATION_REQUESTED = "RUN_CANCELLATION_REQUESTED"
    RUN_RESUME_REQUESTED = "RUN_RESUME_REQUESTED"
    RUN_RECONCILIATION_REQUESTED = "RUN_RECONCILIATION_REQUESTED"
    RUN_EXECUTOR_SELECTED = "RUN_EXECUTOR_SELECTED"
    WORKSPACE_ALLOCATED = "WORKSPACE_ALLOCATED"
    WORKSPACE_RELEASE_REQUESTED = "WORKSPACE_RELEASE_REQUESTED"
    WORKSPACE_RELEASED = "WORKSPACE_RELEASED"
    WORKSPACE_RECONCILIATION_REQUESTED = "WORKSPACE_RECONCILIATION_REQUESTED"
    WORKSPACE_BRANCH_DELETED = "WORKSPACE_BRANCH_DELETED"
    FINDING_ACCEPTED_RISK = "FINDING_ACCEPTED_RISK"
    VERIFICATION_COMMAND_DENIED = "VERIFICATION_COMMAND_DENIED"
    REQUIREMENT_APPROVED = "REQUIREMENT_APPROVED"
    REQUIREMENT_REJECTED = "REQUIREMENT_REJECTED"
    REQUIREMENT_DEFERRED = "REQUIREMENT_DEFERRED"
    PLANNING_DECISION_RECORDED = "PLANNING_DECISION_RECORDED"
    RESULT_APPROVED = "RESULT_APPROVED"
    RESULT_CHANGES_REQUESTED = "RESULT_CHANGES_REQUESTED"
    RESULT_REMEDIATION_CREATED = "RESULT_REMEDIATION_CREATED"
    RESULT_DELIVERED = "RESULT_DELIVERED"


class AuditTargetType(StrEnum):
    """The canonical entity an audited action was applied to."""

    RUN = "RUN"
    EXECUTOR = "EXECUTOR"
    WORKSPACE = "WORKSPACE"
    FINDING = "FINDING"
    REQUIREMENT = "REQUIREMENT"
    PLANNING_ARTIFACT = "PLANNING_ARTIFACT"


def _validated_identifier(value: str, *, field: str) -> str:
    """Return a canonical identifier, rejecting arbitrary text.

    Audit targets and actors are always Agent Office-generated identifiers.
    Rejecting anything else keeps operator-visible strings from smuggling a
    filesystem path or a provider value into durable audit history.
    """

    try:
        return str(UUID(value))
    except (ValueError, AttributeError, TypeError) as exc:
        raise DomainInvariantError(
            f"Audit {field} must be a canonical Agent Office identifier"
        ) from exc


#: Targets that are always scoped to exactly one Run, so `run_id` is required.
RUN_SCOPED_AUDIT_TARGETS: frozenset[AuditTargetType] = frozenset(
    {AuditTargetType.RUN, AuditTargetType.WORKSPACE, AuditTargetType.FINDING}
)


@dataclass(frozen=True, slots=True)
class AuditRecord:
    """One append-only record of a manual control-plane intervention.

    ``project_id`` and ``run_id`` carry ownership. Every current intervention is
    attributable to its canonical scope; run-scoped targets always require the
    owning Run.
    """

    id: AuditRecordId
    actor_type: AuditActorType
    action: AuditAction
    target_type: AuditTargetType
    occurred_at: datetime
    project_id: ProjectId | None = None
    run_id: RunId | None = None
    actor_id: str | None = None
    target_id: str | None = None
    safe_metadata: SafeMetadata = ()

    def __post_init__(self) -> None:
        if len(self.safe_metadata) > MAX_AUDIT_METADATA_ENTRIES:
            raise DomainInvariantError("Audit record declares too many metadata entries")

        if self.actor_id is not None:
            object.__setattr__(
                self,
                "actor_id",
                _validated_identifier(self.actor_id, field="actor id"),
            )

        if self.target_id is not None:
            object.__setattr__(
                self,
                "target_id",
                _validated_identifier(self.target_id, field="target id"),
            )

        if self.target_type in RUN_SCOPED_AUDIT_TARGETS and self.run_id is None:
            raise DomainInvariantError(
                f"A {self.target_type}-targeted audit record must reference its Run"
            )

        object.__setattr__(
            self,
            "safe_metadata",
            validate_safe_metadata(self.safe_metadata),
        )
        object.__setattr__(self, "occurred_at", to_utc(self.occurred_at))
