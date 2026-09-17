"""HTTP route for restart recovery discovery.

Read-only. This route never triggers reconciliation: it reports which Runs may
need it. Reconciliation stays an explicit, bounded operator action on the Run.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from agent_office.api.dependencies import get_recovery_service
from agent_office.api.recovery_models import RecoveryCandidateResponse
from agent_office.application.recovery import RecoveryService

router = APIRouter(tags=["recovery"])

RecoveryServiceDependency = Annotated[RecoveryService, Depends(get_recovery_service)]


@router.get("/api/recovery/runs", response_model=list[RecoveryCandidateResponse])
def list_recovery_candidates(
    recovery_service: RecoveryServiceDependency,
) -> list[RecoveryCandidateResponse]:
    """Return durable non-terminal Runs that may require operator action.

    Performs no external I/O and mutates nothing, so it is safe to call
    immediately after restart and safe to call repeatedly.
    """

    return [
        RecoveryCandidateResponse.from_domain(candidate)
        for candidate in recovery_service.list_candidates()
    ]
