"""HTTP route for Run audit history.

Read-only by construction. There is no public endpoint that accepts an audit
record: audit history is produced only by the control-plane operations that
perform an intervention, so an operator cannot inject an audited fact.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from agent_office.api.audit_models import AuditRecordResponse
from agent_office.api.dependencies import get_audit_service, get_run_service
from agent_office.application.audit import AuditService
from agent_office.application.runs import RunNotFoundError, RunService
from agent_office.domain import RunId

router = APIRouter(tags=["audit"])

RunServiceDependency = Annotated[RunService, Depends(get_run_service)]
AuditServiceDependency = Annotated[AuditService, Depends(get_audit_service)]


@router.get("/api/runs/{run_id}/audit", response_model=list[AuditRecordResponse])
def list_run_audit(
    run_id: UUID,
    run_service: RunServiceDependency,
    audit_service: AuditServiceDependency,
) -> list[AuditRecordResponse]:
    """Return the append-only audit history of one Run.

    The Run is resolved first, so an unknown Run is a 404 rather than an empty
    list. Audit history is scoped by Run identity and never spans Runs or
    Projects.
    """

    try:
        run_service.get_run(RunId(run_id))
    except RunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return [
        AuditRecordResponse.from_domain(record)
        for record in audit_service.list_for_run(RunId(run_id))
    ]
