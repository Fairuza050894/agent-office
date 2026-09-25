"""Resolve Codex process cwd from canonical Agent Office ownership state."""

from __future__ import annotations

from pathlib import Path

from agent_office.application.agents import AgentRunService
from agent_office.application.projects import ProjectService
from agent_office.application.workspaces import WRITE_ACCESS_MODES, WorkspaceService
from agent_office.application.workspaces.ports import WorktreeManager
from agent_office.domain import AgentAccessMode, AgentRunId
from agent_office.infrastructure.executors.codex import (
    CodexExecutionContext,
    CodexExecutionContextError,
)


class CodexExecutionContextResolver:
    """Map one AgentRun to a controlled local cwd.

    Read-only assignments without a Workspace may inspect the registered Project
    tree under Codex's read-only sandbox. Every write-capable assignment must
    already own a managed writable Workspace before this resolver will expose its
    internal path to the Codex infrastructure adapter.
    """

    def __init__(
        self,
        *,
        agent_run_service: AgentRunService,
        project_service: ProjectService,
        workspace_service: WorkspaceService,
        worktree_manager: WorktreeManager,
    ) -> None:
        self._agent_runs = agent_run_service
        self._projects = project_service
        self._workspaces = workspace_service
        self._worktree_manager = worktree_manager

    def __call__(self, agent_run_id: AgentRunId) -> CodexExecutionContext:
        agent_run = self._agent_runs.get(agent_run_id)
        project = self._projects.get_project(agent_run.project_id)

        if agent_run.workspace_id is None:
            if agent_run.access_mode is not AgentAccessMode.READ_ONLY:
                raise CodexExecutionContextError(
                    "Write-capable Codex execution requires a managed Workspace."
                )

            return CodexExecutionContext(
                working_directory=self._existing_directory(project.repository_path),
                access_mode=agent_run.access_mode,
            )

        workspace = self._workspaces.get(agent_run.workspace_id)

        if workspace.project_id != agent_run.project_id or workspace.run_id != agent_run.run_id:
            raise CodexExecutionContextError("AgentRun and Workspace ownership do not match.")

        if agent_run.access_mode in WRITE_ACCESS_MODES:
            if not workspace.accepts_writes:
                raise CodexExecutionContextError(
                    "Assigned Workspace is not in a writable lifecycle state."
                )
            if workspace.owner_agent_run_id != agent_run.id:
                raise CodexExecutionContextError(
                    "Assigned Workspace is not owned by this AgentRun."
                )

        path = self._worktree_manager.resolve_workspace_path(workspace.path_ref)

        return CodexExecutionContext(
            working_directory=self._existing_directory(path),
            access_mode=agent_run.access_mode,
        )

    @staticmethod
    def _existing_directory(path: Path) -> Path:
        try:
            resolved = path.expanduser().resolve(strict=True)
        except OSError as exc:
            raise CodexExecutionContextError("Codex execution directory does not exist.") from exc

        if not resolved.is_dir():
            raise CodexExecutionContextError("Codex execution path is not a directory.")

        return resolved
