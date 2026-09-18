"""Audit application service.

Records manual control-plane interventions. Recording is additive only: an
intervention that succeeded produces a record, and nothing in this service can
modify or remove a record afterwards.

Semantics chosen for Phase 3: **one AuditRecord per successful control-plane
action performed**. A repeated idempotent request is a distinct operator action
and therefore produces its own record, because the audit trail answers "what did
an operator do", not "how many times did canonical state change". A resume that
also changes the Run's Executor performs two actions and records both.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime

from agent_office.application.audit.ports import AuditRecordRepository
from agent_office.domain import (
    AuditAction,
    AuditActorType,
    AuditRecord,
    AuditRecordId,
    AuditTargetType,
    Finding,
    ProjectId,
    Run,
    RunId,
    SafeMetadata,
    Workspace,
    utc_now,
)

Clock = Callable[[], datetime]

AuditRecordIdFactory = Callable[[], AuditRecordId]


class AuditService:
    """Create and query durable AuditRecords."""

    def __init__(
        self,
        repository: AuditRecordRepository,
        *,
        clock: Clock = utc_now,
        audit_record_id_factory: AuditRecordIdFactory = AuditRecordId.new,
    ) -> None:
        self._repository = repository
        self._clock = clock
        self._audit_record_id_factory = audit_record_id_factory

    def record(
        self,
        *,
        project_id: ProjectId,
        run_id: RunId | None,
        action: AuditAction,
        actor_type: AuditActorType,
        target_type: AuditTargetType,
        target_id: str,
        safe_metadata: SafeMetadata = (),
    ) -> AuditRecord:
        """Append one AuditRecord.

        The single write path. Every audited action goes through here, so the
        attribution and ownership rules are applied in exactly one place.
        """

        now = utc_now(self._clock)

        record = AuditRecord(
            id=self._audit_record_id_factory(),
            project_id=project_id,
            run_id=run_id,
            actor_type=actor_type,
            action=action,
            target_type=target_type,
            target_id=target_id,
            occurred_at=now,
            safe_metadata=safe_metadata,
        )

        self._repository.append(record)
        return record

    def record_run_intervention(
        self,
        run: Run,
        action: AuditAction,
        *,
        target_type: AuditTargetType = AuditTargetType.RUN,
        target_id: str | None = None,
        safe_metadata: SafeMetadata = (),
        actor_type: AuditActorType = AuditActorType.USER,
    ) -> AuditRecord:
        """Record one successful manual intervention on a Run.

        ``actor_type`` defaults to ``USER``: the interventions this service
        records all originate from an operator-initiated control-plane request.
        No actor identity is recorded, because Agent Office does not identify
        operators in the local MVP.
        """

        now = utc_now(self._clock)

        record = AuditRecord(
            id=self._audit_record_id_factory(),
            project_id=run.project_id,
            run_id=run.id,
            actor_type=actor_type,
            action=action,
            target_type=target_type,
            target_id=str(run.id) if target_id is None else target_id,
            occurred_at=now,
            safe_metadata=safe_metadata,
        )

        self._repository.append(record)
        return record

    def record_workspace_intervention(
        self,
        workspace: Workspace,
        action: AuditAction,
        *,
        actor_type: AuditActorType = AuditActorType.SYSTEM,
        target_type: AuditTargetType = AuditTargetType.WORKSPACE,
        target_id: str | None = None,
        safe_metadata: SafeMetadata = (),
    ) -> AuditRecord:
        """Record one Workspace lifecycle action.

        ``actor_type`` defaults to ``SYSTEM``: allocation, branch cleanup, and
        release are performed by Agent Office, whereas an operator-initiated
        release or reconciliation request passes ``USER``.
        """

        now = utc_now(self._clock)

        metadata: SafeMetadata = (
            ("status", workspace.status.value),
            ("kind", workspace.kind.value),
        )

        if workspace.reason_code is not None:
            metadata = metadata + (("reason_code", workspace.reason_code.value),)

        record = AuditRecord(
            id=self._audit_record_id_factory(),
            project_id=workspace.project_id,
            run_id=workspace.run_id,
            actor_type=actor_type,
            action=action,
            target_type=target_type,
            target_id=str(workspace.id) if target_id is None else target_id,
            occurred_at=now,
            safe_metadata=metadata + safe_metadata,
        )

        self._repository.append(record)
        return record

    def record_finding_intervention(
        self,
        finding: Finding,
        action: AuditAction,
        *,
        actor_type: AuditActorType = AuditActorType.USER,
        target_type: AuditTargetType = AuditTargetType.FINDING,
        safe_metadata: SafeMetadata = (),
    ) -> AuditRecord:
        """Record one operator decision about a Finding.

        This is the attribution that DOMAIN_MODEL §29.5 requires for accepted
        risk: the Finding itself records the reason, and this records who acted.
        """

        now = utc_now(self._clock)

        record = AuditRecord(
            id=self._audit_record_id_factory(),
            project_id=finding.project_id,
            run_id=finding.run_id,
            actor_type=actor_type,
            action=action,
            target_type=target_type,
            target_id=str(finding.id),
            occurred_at=now,
            safe_metadata=(
                ("severity", finding.severity.value),
                ("status", finding.status.value),
            )
            + safe_metadata,
        )

        self._repository.append(record)
        return record

    def list_for_run(self, run_id: RunId) -> tuple[AuditRecord, ...]:
        """Return the audit history of one Run."""

        return self._repository.list_by_run(run_id)
