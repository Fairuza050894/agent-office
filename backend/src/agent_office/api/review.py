"""HTTP routes for Findings, Evidence, and verification state.

Read-only except for one bounded operator action: accepting the risk of an
unresolved Finding. There is no route that creates a Finding, creates Evidence,
submits a command, supplies a working directory, or supplies an environment map.
Findings are produced by reviewers through the application layer, and Evidence is
produced only by the controlled verification boundary.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from agent_office.api.dependencies import (
    get_finding_service,
    get_run_service,
    get_verification_service,
)
from agent_office.api.review_models import (
    AcceptRiskRequest,
    EvidenceResponse,
    FindingResponse,
    RunFindingsResponse,
    VerificationCheckResponse,
    VerificationStatusResponse,
)
from agent_office.application.review import (
    FindingNotAcceptableError,
    FindingNotFoundError,
    FindingService,
)
from agent_office.application.runs import RunNotFoundError, RunService
from agent_office.application.verification import (
    EvidenceNotFoundError,
    VerificationService,
)
from agent_office.domain import (
    DomainInvariantError,
    EvidenceId,
    Finding,
    FindingId,
    RunId,
)

router = APIRouter(tags=["review"])

RunServiceDependency = Annotated[RunService, Depends(get_run_service)]
FindingServiceDependency = Annotated[FindingService, Depends(get_finding_service)]
VerificationServiceDependency = Annotated[VerificationService, Depends(get_verification_service)]


@router.get("/api/runs/{run_id}/findings", response_model=RunFindingsResponse)
def list_run_findings(
    run_id: UUID,
    run_service: RunServiceDependency,
    finding_service: FindingServiceDependency,
) -> RunFindingsResponse:
    """Return every Finding of one Run, including resolved history."""

    _require_run(run_service, run_id)

    findings = finding_service.list_for_run(RunId(run_id))

    return RunFindingsResponse(
        run_id=str(run_id),
        findings=[FindingResponse.from_domain(finding) for finding in findings],
        open_blockers=len([finding for finding in findings if finding.blocks_completion]),
    )


@router.get("/api/findings/{finding_id}", response_model=FindingResponse)
def get_finding(
    finding_id: UUID,
    finding_service: FindingServiceDependency,
) -> FindingResponse:
    """Return one Finding by logical identity."""

    return FindingResponse.from_domain(_finding(finding_service, finding_id))


@router.post("/api/findings/{finding_id}/accept-risk", response_model=FindingResponse)
def accept_finding_risk(
    finding_id: UUID,
    request: AcceptRiskRequest,
    finding_service: FindingServiceDependency,
) -> FindingResponse:
    """Accept the risk of an unresolved Finding.

    This is the only path to ACCEPTED_RISK, and it is operator-only: an executor
    or agent has no route that reaches it, and the service refuses any actor type
    other than an attributable user action.
    """

    try:
        accepted = finding_service.accept_risk(
            FindingId.parse(finding_id),
            reason=request.reason,
        )
    except FindingNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except FindingNotAcceptableError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except DomainInvariantError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return FindingResponse.from_domain(accepted)


@router.get("/api/runs/{run_id}/evidence", response_model=list[EvidenceResponse])
def list_run_evidence(
    run_id: UUID,
    run_service: RunServiceDependency,
    verification_service: VerificationServiceDependency,
) -> list[EvidenceResponse]:
    """Return every Evidence record of one Run, in durable order."""

    _require_run(run_service, run_id)

    return [
        EvidenceResponse.from_domain(evidence)
        for evidence in verification_service.list_for_run(RunId(run_id))
    ]


@router.get("/api/evidence/{evidence_id}", response_model=EvidenceResponse)
def get_evidence(
    evidence_id: UUID,
    verification_service: VerificationServiceDependency,
) -> EvidenceResponse:
    """Return one Evidence record by logical identity."""

    try:
        evidence = verification_service.get(EvidenceId.parse(evidence_id))
    except EvidenceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return EvidenceResponse.from_domain(evidence)


@router.get("/api/runs/{run_id}/verification", response_model=VerificationStatusResponse)
def get_run_verification(
    run_id: UUID,
    run_service: RunServiceDependency,
    verification_service: VerificationServiceDependency,
) -> VerificationStatusResponse:
    """Return the Run's declared verification checks and their factual state."""

    _require_run(run_service, run_id)

    run = RunId(run_id)
    latest = verification_service.latest_check_evidence(run)
    checks = verification_service.required_checks(run)

    responses: list[VerificationCheckResponse] = []

    for check in checks:
        evidence = latest.get(check.key)
        result = None if evidence is None else evidence.test_result

        responses.append(
            VerificationCheckResponse(
                check_key=check.key,
                check_type=check.check_type,
                required=check.required,
                command_status=None if result is None else result.command_status,
                evidence_id=None if evidence is None else str(evidence.id),
                satisfied=(
                    evidence is not None
                    and verification_service.evidence_satisfies_current_candidate(run, evidence)
                ),
            )
        )

    evidence_count = len(verification_service.list_for_run(run))

    return VerificationStatusResponse(
        run_id=str(run_id),
        checked=bool(checks),
        checks=responses,
        evidence_count=evidence_count,
    )


def _require_run(run_service: RunService, run_id: UUID) -> None:
    try:
        run_service.get_run(RunId(run_id))
    except RunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


def _finding(finding_service: FindingService, finding_id: UUID) -> Finding:
    try:
        return finding_service.get(FindingId.parse(finding_id))
    except FindingNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except DomainInvariantError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
