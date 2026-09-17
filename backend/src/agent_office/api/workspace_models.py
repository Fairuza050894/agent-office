"""Safe HTTP DTOs for Workspaces.

Absolute filesystem locations are never exposed. ``path_ref`` is an opaque,
relative storage reference, and the worktree's real location is resolved only
inside the infrastructure layer (WORKTREE_POLICY §108, SECURITY_MODEL §23).
"""

from __future__ import annotations

from datetime import datetime
from typing import Self

from pydantic import BaseModel

from agent_office.domain import (
    AgentAccessMode,
    Workspace,
    WorkspaceChangeSummary,
    WorkspaceKind,
    WorkspaceReasonCode,
    WorkspaceStatus,
)


class WorkspaceResponse(BaseModel):
    """Public Workspace representation."""

    id: str
    project_id: str
    run_id: str
    owner_agent_run_id: str | None
    kind: WorkspaceKind
    access_mode: AgentAccessMode
    status: WorkspaceStatus
    base_revision: str | None
    git_branch: str | None
    reason_code: WorkspaceReasonCode | None
    reason_summary: str | None
    writable: bool
    created_at: datetime
    updated_at: datetime
    released_at: datetime | None

    @classmethod
    def from_domain(cls, workspace: Workspace) -> Self:
        return cls(
            id=str(workspace.id),
            project_id=str(workspace.project_id),
            run_id=str(workspace.run_id),
            owner_agent_run_id=(
                None if workspace.owner_agent_run_id is None else str(workspace.owner_agent_run_id)
            ),
            kind=workspace.kind,
            access_mode=workspace.access_mode,
            status=workspace.status,
            base_revision=workspace.base_revision,
            git_branch=workspace.git_branch,
            reason_code=workspace.reason_code,
            reason_summary=workspace.reason_summary,
            writable=workspace.writable,
            created_at=workspace.created_at,
            updated_at=workspace.updated_at,
            released_at=workspace.released_at,
        )


class WorkspaceStatusResponse(BaseModel):
    """Factual status of one Workspace, produced by Git where it can be."""

    workspace: WorkspaceResponse
    change_summary: WorkspaceChangeSummaryResponse | None


class WorkspaceChangeSummaryResponse(BaseModel):
    """Repository-relative change summary of a Worktree.

    Counts that Git cannot report numerically stay null rather than being
    estimated, and every path is repository-relative.
    """

    base_revision: str
    current_revision: str | None
    files_changed: int
    insertions: int | None
    deletions: int | None
    added_paths: list[str]
    modified_paths: list[str]
    deleted_paths: list[str]
    untracked_paths: list[str]

    @classmethod
    def from_domain(cls, summary: WorkspaceChangeSummary) -> Self:
        return cls(
            base_revision=summary.base_revision,
            current_revision=summary.current_revision,
            files_changed=summary.files_changed,
            insertions=summary.insertions,
            deletions=summary.deletions,
            added_paths=list(summary.added_paths),
            modified_paths=list(summary.modified_paths),
            deleted_paths=list(summary.deleted_paths),
            untracked_paths=list(summary.untracked_paths),
        )
