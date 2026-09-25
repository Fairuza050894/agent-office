"""Workspace application package."""

from agent_office.application.workspaces.errors import (
    WorkspaceAllocationError,
    WorkspaceError,
    WorkspaceIntegrationError,
    WorkspaceNotContainedError,
    WorkspaceNotFoundError,
    WorkspaceOwnershipError,
    WorkspacePersistenceError,
    WorkspaceReleaseError,
    WorktreeCreationError,
    WorktreeNotContainedError,
    WorktreeOperationError,
)
from agent_office.application.workspaces.ports import WorkspaceRepository, WorktreeManager
from agent_office.application.workspaces.service import WRITE_ACCESS_MODES, WorkspaceService

__all__ = [
    "WRITE_ACCESS_MODES",
    "WorkspaceAllocationError",
    "WorkspaceError",
    "WorkspaceIntegrationError",
    "WorkspaceNotContainedError",
    "WorkspaceNotFoundError",
    "WorkspaceOwnershipError",
    "WorkspacePersistenceError",
    "WorkspaceReleaseError",
    "WorkspaceRepository",
    "WorkspaceService",
    "WorktreeCreationError",
    "WorktreeManager",
    "WorktreeNotContainedError",
    "WorktreeOperationError",
]
