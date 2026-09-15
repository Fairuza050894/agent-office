"""HTTP routes for Project Registry."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from agent_office.api.dependencies import get_project_service
from agent_office.api.project_models import (
    ProjectResponse,
    RegisterProjectRequest,
)
from agent_office.application.projects import (
    DuplicateProjectError,
    InvalidRepositoryError,
    ProjectNotFoundError,
    ProjectService,
)
from agent_office.domain import DomainInvariantError, ProjectId

router = APIRouter(
    prefix="/api/projects",
    tags=["projects"],
)

ProjectServiceDependency = Annotated[
    ProjectService,
    Depends(get_project_service),
]


@router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_project(
    request: RegisterProjectRequest,
    service: ProjectServiceDependency,
) -> ProjectResponse:
    try:
        project = service.register_project(
            name=request.name,
            repository_path=request.repository_path,
        )
    except InvalidRepositoryError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except DuplicateProjectError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except DomainInvariantError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    return ProjectResponse.from_domain(project)


@router.get(
    "",
    response_model=list[ProjectResponse],
)
def list_projects(
    service: ProjectServiceDependency,
) -> list[ProjectResponse]:
    return [ProjectResponse.from_domain(project) for project in service.list_projects()]


@router.get(
    "/{project_id}",
    response_model=ProjectResponse,
)
def get_project(
    project_id: UUID,
    service: ProjectServiceDependency,
) -> ProjectResponse:
    try:
        project = service.get_project(ProjectId(project_id))
    except ProjectNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return ProjectResponse.from_domain(project)


@router.post(
    "/{project_id}/archive",
    response_model=ProjectResponse,
)
def archive_project(
    project_id: UUID,
    service: ProjectServiceDependency,
) -> ProjectResponse:
    try:
        project = service.archive_project(ProjectId(project_id))
    except ProjectNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return ProjectResponse.from_domain(project)
