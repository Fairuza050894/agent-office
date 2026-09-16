"""HTTP routes for Run management."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from agent_office.api.dependencies import get_run_service, get_task_service
from agent_office.api.run_models import CreateRunRequest, RunResponse
from agent_office.application.runs import (
    OwnershipError,
    ProjectArchivedError,
    RunNotFoundError,
    RunService,
)
from agent_office.application.tasks import TaskNotFoundError, TaskService
from agent_office.domain import DomainInvariantError, RunId, TaskId
from agent_office.domain.identifiers import ExecutorId

router = APIRouter(tags=["runs"])

TaskServiceDependency = Annotated[TaskService, Depends(get_task_service)]
RunServiceDependency = Annotated[RunService, Depends(get_run_service)]


@router.post(
    "/api/tasks/{task_id}/runs",
    response_model=RunResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_run(
    task_id: UUID,
    request: CreateRunRequest,
    run_service: RunServiceDependency,
) -> RunResponse:
    try:
        requested_executor_id = (
            ExecutorId.parse(request.requested_executor_id)
            if request.requested_executor_id is not None
            else None
        )
        run = run_service.create_run(
            task_id=TaskId(task_id),
            requested_executor_id=requested_executor_id,
        )
    except TaskNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ProjectArchivedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except DomainInvariantError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return RunResponse.from_domain(run)


@router.get(
    "/api/tasks/{task_id}/runs",
    response_model=list[RunResponse],
)
def list_runs(
    task_id: UUID,
    task_service: TaskServiceDependency,
    run_service: RunServiceDependency,
) -> list[RunResponse]:
    try:
        task_service.get_task(TaskId(task_id))
    except TaskNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    runs = run_service.list_runs(TaskId(task_id))
    return [RunResponse.from_domain(r) for r in runs]


@router.get(
    "/api/runs/{run_id}",
    response_model=RunResponse,
)
def get_run(
    run_id: UUID,
    run_service: RunServiceDependency,
) -> RunResponse:
    try:
        run = run_service.get_run(RunId(run_id))
    except RunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except OwnershipError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc

    return RunResponse.from_domain(run)
