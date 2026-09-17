"""Safe HTTP DTOs for append-only AuditRecords."""

from __future__ import annotations

from datetime import datetime
from typing import Self

from pydantic import BaseModel

from agent_office.domain import AuditAction, AuditActorType, AuditRecord, AuditTargetType


class AuditRecordResponse(BaseModel):
    """Public AuditRecord representation.

    Audit metadata is already bounded and secret-filtered before persistence, so
    this model never carries a raw request dump, a credential, or a filesystem
    path. Actor identity is not exposed because Phase 3 does not identify
    operators; ``actor_type`` states only where the request originated.
    """

    id: str
    project_id: str | None
    run_id: str | None
    actor_type: AuditActorType
    actor_id: str | None
    action: AuditAction
    target_type: AuditTargetType
    target_id: str | None
    occurred_at: datetime
    safe_metadata: dict[str, str]

    @classmethod
    def from_domain(cls, record: AuditRecord) -> Self:
        return cls(
            id=str(record.id),
            project_id=None if record.project_id is None else str(record.project_id),
            run_id=None if record.run_id is None else str(record.run_id),
            actor_type=record.actor_type,
            actor_id=record.actor_id,
            action=record.action,
            target_type=record.target_type,
            target_id=record.target_id,
            occurred_at=record.occurred_at,
            safe_metadata=dict(record.safe_metadata),
        )
