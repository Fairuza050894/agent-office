"""HTTP routes for Workspace inspection and operator control.

Read-only by construction except for two bounded operator actions: release and
reconcile. There is no route that accepts a filesystem path, no route that
deletes an arbitrary path, and no route that runs a shell or Git command. A
Workspace is always addressed by its logical identity, and the infrastructure
layer resolves its location internally (SECURITY_MODEL §23, §24, §26).
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from agent_office.api.dependencies import get_run_service, get_workspace_service
from agent_office.api.workspace_models import (
    WorkspaceChangeSummaryResponse,
    WorkspaceResponse,
    WorkspaceStatusResponse,
)
from agent_office.application.runs import RunNotFoundError, RunService
from agent_office.application.workspaces import (
    WorkspaceNotFoundError,
    WorkspaceReleaseError,
    WorkspaceService,
    WorktreeOperationError,
)
from agent_office.domain import DomainInvariantError, RunId, Workspace, WorkspaceId

router = APIRouter(tags=["workspaces"])

RunServiceDependency = Annotated[RunService, Depends(get_run_service)]
WorkspaceServiceDependency = Annotated[WorkspaceService, Depends(get_workspace_service)]


@router.get("/api/runs/{run_id}/workspaces", response_model=list[WorkspaceResponse])
def list_run_workspaces(
    run_id: UUID,
    run_service: RunServiceDependency,
    workspace_service: WorkspaceServiceDependency,
) -> list[WorkspaceResponse]:
    """Return every Workspace of one Run."""

    try:
        run_service.get_run(RunId(run_id))
    except RunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return [
        WorkspaceResponse.from_domain(workspace)
        for workspace in workspace_service.list_for_run(RunId(run_id))
    ]


@router.get("/api/workspaces/{workspace_id}", response_model=WorkspaceResponse)
def get_workspace(
    workspace_id: UUID,
    workspace_service: WorkspaceServiceDependency,
) -> WorkspaceResponse:
    """Return one Workspace by logical identity."""

    return WorkspaceResponse.from_domain(_workspace(workspace_service, workspace_id))


@router.get("/api/workspaces/{workspace_id}/status", response_model=WorkspaceStatusResponse)
def get_workspace_status(
    workspace_id: UUID,
    workspace_service: WorkspaceServiceDependency,
) -> WorkspaceStatusResponse:
    """Return the Workspace and its factual Git change summary.

    Change inspection is best-effort: a Workspace whose Worktree cannot be read
    still reports its durable lifecycle state, with a null change summary rather
    than a fabricated one.
    """

    workspace = _workspace(workspace_service, workspace_id)
    summary: WorkspaceChangeSummaryResponse | None = None

    try:
        summary = WorkspaceChangeSummaryResponse.from_domain(
            workspace_service.capture_changes(WorkspaceId.parse(workspace_id))
        )
    except (WorkspaceReleaseError, WorktreeOperationError):
        summary = None

    return WorkspaceStatusResponse(
        workspace=WorkspaceResponse.from_domain(workspace),
        change_summary=summary,
    )


@router.post("/api/workspaces/{workspace_id}/release", response_model=WorkspaceResponse)
def release_workspace(
    workspace_id: UUID,
    workspace_service: WorkspaceServiceDependency,
) -> WorkspaceResponse:
    """Request release of a Workspace.

    The Worktree is removed only when no execution is attached and Git reports no
    unrecorded changes. Otherwise it is retained and the Workspace reports why,
    so nothing is ever silently discarded.
    """

    try:
        return WorkspaceResponse.from_domain(
            workspace_service.request_release(WorkspaceId.parse(workspace_id))
        )
    except WorkspaceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post("/api/workspaces/{workspace_id}/reconcile", response_model=WorkspaceResponse)
def reconcile_workspace(
    workspace_id: UUID,
    workspace_service: WorkspaceServiceDependency,
) -> WorkspaceResponse:
    """Reconcile a Workspace against the filesystem and Git.

    Nothing is deleted and nothing is recreated; the outcome only records what
    is factually true now.
    """

    try:
        return WorkspaceResponse.from_domain(
            workspace_service.reconcile(WorkspaceId.parse(workspace_id))
        )
    except WorkspaceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


def _workspace(workspace_service: WorkspaceService, workspace_id: UUID) -> Workspace:
    try:
        return workspace_service.get(WorkspaceId.parse(workspace_id))
    except WorkspaceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except DomainInvariantError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
