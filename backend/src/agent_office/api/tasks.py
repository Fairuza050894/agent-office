"""HTTP routes for Task management."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from agent_office.api.dependencies import get_project_service, get_task_service
from agent_office.api.task_models import CreateTaskRequest, TaskResponse
from agent_office.application.projects import ProjectNotFoundError, ProjectService
from agent_office.application.tasks import TaskNotFoundError, TaskService
from agent_office.domain import DomainInvariantError, ProjectId, TaskId, WorkflowDefinitionId
from agent_office.domain.identifiers import ExecutorId

router = APIRouter(tags=["tasks"])

ProjectServiceDependency = Annotated[ProjectService, Depends(get_project_service)]
TaskServiceDependency = Annotated[TaskService, Depends(get_task_service)]


@router.post(
    "/api/projects/{project_id}/tasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_task(
    project_id: UUID,
    request: CreateTaskRequest,
    project_service: ProjectServiceDependency,
    task_service: TaskServiceDependency,
) -> TaskResponse:
    # Validate project exists (raises 404 if not)
    try:
        project_service.get_project(ProjectId(project_id))
    except ProjectNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    try:
        requested_executor_id = (
            ExecutorId.parse(request.requested_executor_id)
            if request.requested_executor_id is not None
            else None
        )
        requested_workflow_id = (
            WorkflowDefinitionId.parse(request.requested_workflow_id)
            if request.requested_workflow_id is not None
            else None
        )
        task = task_service.create_task(
            project_id=ProjectId(project_id),
            title=request.title,
            objective=request.objective,
            constraints=request.constraints,
            requested_workflow_id=requested_workflow_id,
            requested_executor_id=requested_executor_id,
        )
    except ProjectNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except DomainInvariantError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return TaskResponse.from_domain(task)


@router.get(
    "/api/projects/{project_id}/tasks",
    response_model=list[TaskResponse],
)
def list_tasks(
    project_id: UUID,
    project_service: ProjectServiceDependency,
    task_service: TaskServiceDependency,
) -> list[TaskResponse]:
    try:
        project_service.get_project(ProjectId(project_id))
    except ProjectNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    tasks = task_service.list_tasks(ProjectId(project_id))
    return [TaskResponse.from_domain(t) for t in tasks]


@router.get(
    "/api/tasks/{task_id}",
    response_model=TaskResponse,
)
def get_task(
    task_id: UUID,
    task_service: TaskServiceDependency,
) -> TaskResponse:
    try:
        task = task_service.get_task(TaskId(task_id))
    except TaskNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return TaskResponse.from_domain(task)
