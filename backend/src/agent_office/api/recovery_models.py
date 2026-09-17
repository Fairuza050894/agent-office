"""Safe HTTP DTOs for recovery discovery."""

from __future__ import annotations

from typing import Self

from pydantic import BaseModel

from agent_office.application.recovery import RecoveryCandidate
from agent_office.domain import RunReasonCode, RunStatus


class RecoveryCandidateResponse(BaseModel):
    """One non-terminal Run that may require operator action.

    Deliberately limited to canonical identity and classification. No repository
    path, executor session reference, or workspace detail is exposed, because
    recovery discovery must not become a filesystem or provider inspection
    surface.
    """

    run_id: str
    project_id: str
    status: RunStatus
    reason_code: RunReasonCode | None
    classification: str
    unresolved_agent_run_count: int
    reconciliation_required: bool

    @classmethod
    def from_domain(cls, candidate: RecoveryCandidate) -> Self:
        return cls(
            run_id=str(candidate.run_id),
            project_id=str(candidate.project_id),
            status=candidate.status,
            reason_code=candidate.reason_code,
            classification=candidate.classification.value,
            unresolved_agent_run_count=candidate.unresolved_agent_run_count,
            reconciliation_required=candidate.reconciliation_required,
        )
