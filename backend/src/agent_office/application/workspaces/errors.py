"""Workspace application errors."""

from __future__ import annotations

from agent_office.domain import WorkspaceId, WorkspaceReasonCode


class WorkspaceError(RuntimeError):
    """Base class for Workspace failures."""


class WorkspaceNotFoundError(WorkspaceError):
    """Raised when a Workspace cannot be found."""


class WorkspacePersistenceError(WorkspaceError):
    """Raised when a Workspace cannot be persisted safely."""


class WorkspaceOwnershipError(WorkspaceError):
    """Raised when write ownership cannot be acquired or is misused."""


class WorkspaceNotContainedError(WorkspaceError):
    """Raised when an operation would leave the managed workspace root."""


class WorktreeNotContainedError(WorkspaceNotContainedError):
    """Raised when a workspace path reference escapes the managed root."""


class WorktreeOperationError(WorkspaceError):
    """Raised when a Git worktree operation fails."""


class WorktreeCreationError(WorktreeOperationError):
    """Raised when an isolated worktree could not be created."""


class WorkspaceAllocationError(WorkspaceError):
    """Raised when a writable Workspace cannot be allocated.

    The caller must not start execution. The reason code is canonical so the
    orchestration gate can block the Run with a truthful explanation.
    """

    def __init__(
        self,
        workspace_id: WorkspaceId | None,
        reason_code: WorkspaceReasonCode,
        reason_summary: str,
    ) -> None:
        super().__init__(reason_summary)
        self.workspace_id = workspace_id
        self.reason_code = reason_code
        self.reason_summary = reason_summary


class WorkspaceIntegrationError(WorkspaceError):
    """Raised when several writer Workspaces cannot form one safe candidate."""

    def __init__(self, conflicting_paths: tuple[str, ...], reason_summary: str) -> None:
        super().__init__(reason_summary)
        self.conflicting_paths = conflicting_paths
        self.reason_summary = reason_summary


class WorkspaceReleaseError(WorkspaceError):
    """Raised when a Workspace cannot be released safely."""
