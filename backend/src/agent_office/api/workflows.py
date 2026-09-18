"""HTTP routes for WorkflowDefinition management.

Workflow definitions are reusable configuration. Freezing one into the
immutable snapshot a Run executes against happens when the Run starts, not
here.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from agent_office.api.dependencies import get_workflow_service
from agent_office.api.workflow_models import (
    CreateWorkflowRequest,
    UpdateWorkflowRequest,
    WorkflowResponse,
    WorkflowValidationResponse,
    graph_from_stages,
)
from agent_office.application.workflows import (
    WorkflowKeyConflictError,
    WorkflowNotFoundError,
    WorkflowService,
    WorkflowVersionNotFoundError,
)
from agent_office.domain import DomainInvariantError, WorkflowDefinitionId

router = APIRouter(tags=["workflows"])

WorkflowServiceDependency = Annotated[WorkflowService, Depends(get_workflow_service)]


@router.post(
    "/api/workflows",
    response_model=WorkflowResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_workflow(
    request: CreateWorkflowRequest,
    service: WorkflowServiceDependency,
) -> WorkflowResponse:
    try:
        graph = graph_from_stages(request.stages, request.verification_checks)
        definition = service.create_definition(
            key=request.key,
            name=request.name,
            description=request.description,
            graph=graph,
            status=request.status,
        )
    except DomainInvariantError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except WorkflowKeyConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    return WorkflowResponse.from_domain(definition)


@router.get("/api/workflows", response_model=list[WorkflowResponse])
def list_workflows(service: WorkflowServiceDependency) -> list[WorkflowResponse]:
    return [WorkflowResponse.from_domain(item) for item in service.list_definitions()]


@router.get("/api/workflows/{workflow_id}", response_model=WorkflowResponse)
def get_workflow(
    workflow_id: UUID,
    service: WorkflowServiceDependency,
) -> WorkflowResponse:
    try:
        definition = service.get_definition(WorkflowDefinitionId(workflow_id))
    except WorkflowNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return WorkflowResponse.from_domain(definition)


@router.put("/api/workflows/{workflow_id}", response_model=WorkflowResponse)
def update_workflow(
    workflow_id: UUID,
    request: UpdateWorkflowRequest,
    service: WorkflowServiceDependency,
) -> WorkflowResponse:
    """Edit a WorkflowDefinition.

    The edit produces a new version. Runs that already froze an earlier version
    keep their original snapshot.
    """

    try:
        graph = graph_from_stages(request.stages, request.verification_checks)
        definition = service.revise_definition(
            WorkflowDefinitionId(workflow_id),
            graph=graph,
            name=request.name,
            description=request.description,
            status=request.status,
        )
    except DomainInvariantError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except WorkflowNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return WorkflowResponse.from_domain(definition)


@router.post(
    "/api/workflows/{workflow_id}/validate",
    response_model=WorkflowValidationResponse,
)
def validate_workflow(
    workflow_id: UUID,
    service: WorkflowServiceDependency,
) -> WorkflowValidationResponse:
    """Validate a stored WorkflowDefinition through the central validation path.

    The response reports the actual issues found. It does not report success
    unconditionally.
    """

    try:
        definition = service.get_definition(WorkflowDefinitionId(workflow_id))
    except WorkflowNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return WorkflowValidationResponse.from_report(
        definition,
        service.validate_graph(definition.graph),
    )


@router.get("/api/workflows/{workflow_id}/versions", response_model=list[WorkflowResponse])
def list_workflow_versions(
    workflow_id: UUID,
    service: WorkflowServiceDependency,
) -> list[WorkflowResponse]:
    """Return every immutable version of a WorkflowDefinition, oldest first."""

    try:
        versions = service.list_definition_versions(WorkflowDefinitionId(workflow_id))
    except WorkflowNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return [WorkflowResponse.from_domain(version) for version in versions]


@router.get(
    "/api/workflows/{workflow_id}/versions/{version}",
    response_model=WorkflowResponse,
)
def get_workflow_version(
    workflow_id: UUID,
    version: int,
    service: WorkflowServiceDependency,
) -> WorkflowResponse:
    """Return one specific historical version of a WorkflowDefinition."""

    try:
        definition = service.get_definition_version(
            WorkflowDefinitionId(workflow_id),
            version,
        )
    except (WorkflowNotFoundError, WorkflowVersionNotFoundError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return WorkflowResponse.from_domain(definition)
