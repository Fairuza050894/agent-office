"""Application ports for the Workspace boundary.

Two seams are declared here:

* :class:`WorkspaceRepository` — durable Workspace state.
* :class:`WorktreeManager` — the Git/filesystem boundary. It is the only place
  that knows a Worktree's absolute location, and it accepts logical Workspace
  identity rather than paths (SECURITY_MODEL §23).
"""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from agent_office.domain import (
    AgentRunId,
    ProjectId,
    RepositoryIdentity,
    RunId,
    Workspace,
    WorkspaceChangeSummary,
    WorkspaceId,
    WorkspaceReconciliationOutcome,
)


class WorkspaceRepository(Protocol):
    """Persistence boundary for Workspaces."""

    def add(self, workspace: Workspace) -> None:
        """Persist a new Workspace."""
        ...

    def update(self, workspace: Workspace) -> None:
        """Persist the current lifecycle state of an existing Workspace."""
        ...

    def get(self, workspace_id: WorkspaceId) -> Workspace | None:
        """Return a Workspace by ID."""
        ...

    def list_by_run(self, run_id: RunId) -> tuple[Workspace, ...]:
        """Return every Workspace of one Run."""
        ...

    def find_by_owner(self, agent_run_id: AgentRunId) -> Workspace | None:
        """Return the Workspace currently owned by an AgentRun, if any."""
        ...

    def list_active(self) -> tuple[Workspace, ...]:
        """Return every Workspace that has not reached a terminal state."""
        ...

    def acquire_write_ownership(
        self,
        workspace_id: WorkspaceId,
        agent_run_id: AgentRunId,
        *,
        updated_at: str,
    ) -> bool:
        """Atomically claim write ownership, returning False when already owned."""
        ...

    def release_write_ownership(
        self,
        workspace_id: WorkspaceId,
        *,
        status: str,
        updated_at: str,
    ) -> bool:
        """Atomically clear write ownership while setting a new status."""
        ...


class WorktreeManager(Protocol):
    """The Git worktree boundary for managed Workspaces.

    Implementations resolve every absolute location internally from the
    configured workspace root and the Workspace's opaque ``path_ref``.
    """

    @property
    def workspace_root(self) -> Path:
        """Return the managed workspace root."""
        ...

    def resolve_workspace_path(self, path_ref: str) -> Path:
        """Return the contained absolute location for an opaque reference.

        Implementations must reject an empty, absolute, traversing, or escaping
        reference, so a caller can never substitute a path.
        """
        ...

    def resolve_repository_identity(self, repository_path: Path) -> RepositoryIdentity:
        """Return the Git identity of a repository, without mutating it."""
        ...

    def resolve_base_revision(self, repository_path: Path) -> str:
        """Return the immutable commit SHA that new work is based on."""
        ...

    def create_worktree(
        self,
        *,
        project_id: ProjectId,
        run_id: RunId,
        workspace_id: WorkspaceId,
        repository_path: Path,
        identity: RepositoryIdentity,
        base_revision: str,
        git_branch: str,
    ) -> Path:
        """Create the isolated worktree and return its absolute location."""
        ...

    def verify_worktree(
        self,
        path_ref: str,
        identity: RepositoryIdentity,
    ) -> WorkspaceReconciliationOutcome:
        """Verify Git membership and repository identity of a worktree.

        Returns ``CONFIRMED_*`` when the worktree is verified, ``MISSING`` when
        no directory exists, and ``CONFLICT`` when the location resolves to a
        different repository than the registered identity.
        """
        ...

    def capture_changes(
        self,
        path_ref: str,
        *,
        base_revision: str,
    ) -> WorkspaceChangeSummary:
        """Return a factual, repository-relative change summary."""
        ...

    def integrate_worktrees(
        self,
        target_path_ref: str,
        source_path_refs: tuple[str, ...],
        *,
        base_revision: str,
    ) -> tuple[str, ...]:
        """Combine disjoint source changes into one managed integration worktree.

        Return repository-relative conflicting paths without mutating the target
        when two sources claim the same path.
        """
        ...

    def remove_worktree(self, path_ref: str, *, git_branch: str | None) -> bool:
        """Remove a managed worktree using Git lifecycle semantics.

        Returns False when the worktree could not be removed safely, including
        when it holds unrecorded changes. It never forces removal.
        """
        ...
