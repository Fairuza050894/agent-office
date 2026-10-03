"""HTTP routes for human result review and managed local delivery."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from agent_office.api.dependencies import get_result_review_service
from agent_office.api.result_models import (
    ApproveResultRequest,
    RequestChangesRequest,
    ResultReviewResponse,
)
from agent_office.application.results import (
    ResultAlreadyDecidedError,
    ResultDeliveryError,
    ResultNotReviewableError,
    ResultReviewService,
)
from agent_office.application.runs import RunNotFoundError
from agent_office.domain import DomainInvariantError, RunId

router = APIRouter(tags=["results"])

ResultReviewServiceDependency = Annotated[
    ResultReviewService,
    Depends(get_result_review_service),
]


@router.get(
    "/api/runs/{run_id}/result-review",
    response_model=ResultReviewResponse,
)
def get_result_review(
    run_id: UUID,
    service: ResultReviewServiceDependency,
) -> ResultReviewResponse:
    try:
        result = service.get(RunId(run_id))
    except RunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return ResultReviewResponse.from_projection(result)


@router.post(
    "/api/runs/{run_id}/result-review/request-changes",
    response_model=ResultReviewResponse,
)
def request_result_changes(
    run_id: UUID,
    request: RequestChangesRequest,
    service: ResultReviewServiceDependency,
) -> ResultReviewResponse:
    try:
        result = service.request_changes(RunId(run_id), feedback=request.feedback)
    except RunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except (ResultNotReviewableError, ResultAlreadyDecidedError) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except DomainInvariantError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return ResultReviewResponse.from_projection(result)


@router.post(
    "/api/runs/{run_id}/result-review/approve-and-deliver",
    response_model=ResultReviewResponse,
)
def approve_and_deliver_result(
    run_id: UUID,
    request: ApproveResultRequest,
    service: ResultReviewServiceDependency,
) -> ResultReviewResponse:
    try:
        result = service.approve_and_deliver(RunId(run_id), note=request.note)
    except RunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except (ResultNotReviewableError, ResultAlreadyDecidedError, ResultDeliveryError) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except DomainInvariantError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return ResultReviewResponse.from_projection(result)
