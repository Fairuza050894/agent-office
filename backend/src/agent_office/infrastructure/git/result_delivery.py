"""Safe local delivery of a human-approved candidate Workspace.

Delivery is intentionally local-only: it commits the already verified candidate
inside its recorded managed worktree and creates a separate ``accepted-*``
managed branch ref at that exact commit. It never pushes, merges, rebases,
checks out the user's branch, changes the candidate's recorded branch, or changes
repository-global configuration.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from agent_office.application.results.errors import ResultDeliveryError
from agent_office.application.results.ports import ManagedDeliveryReceipt
from agent_office.domain import Workspace, validate_branch_name
from agent_office.infrastructure.git.worktree_manager import GitWorktreeManager

DELIVERY_GIT_TIMEOUT_SECONDS = 20.0


class GitManagedResultDelivery:
    """Commit an accepted candidate only inside an Agent Office worktree."""

    def __init__(self, worktree_manager: GitWorktreeManager) -> None:
        self._worktrees = worktree_manager

    def deliver(
        self,
        workspace: Workspace,
        *,
        accepted_branch: str,
        commit_message: str,
    ) -> ManagedDeliveryReceipt:
        current_managed_branch = workspace.git_branch
        if current_managed_branch is None:
            raise ResultDeliveryError("Candidate Workspace has no managed Git branch")

        validate_branch_name(current_managed_branch)
        validate_branch_name(accepted_branch)
        path = self._worktrees.resolve_workspace_path(workspace.path_ref)
        if not path.exists():
            raise ResultDeliveryError("Candidate Workspace is missing")

        current = self._git(path, "branch", "--show-current").stdout.strip()
        if current != current_managed_branch:
            raise ResultDeliveryError(
                "Candidate Worktree is no longer on its recorded managed branch"
            )

        status = self._git(path, "status", "--porcelain=v1", "--untracked-files=all").stdout
        if status.strip():
            staged = self._run(path, "add", "-A")
            if staged.returncode != 0:
                raise ResultDeliveryError("Candidate changes could not be staged safely")

            committed = self._run(
                path,
                "-c",
                "user.name=Agent Office",
                "-c",
                "user.email=agent-office@local.invalid",
                "commit",
                "--no-gpg-sign",
                "-m",
                commit_message,
            )
            if committed.returncode != 0:
                raise ResultDeliveryError("Candidate changes could not be committed safely")

        commit = self._git(path, "rev-parse", "HEAD").stdout.strip()
        if not commit:
            raise ResultDeliveryError("Accepted delivery has no resolvable commit")

        accepted_ref = f"refs/heads/{accepted_branch}"
        existing = self._run(path, "show-ref", "--hash", "--verify", accepted_ref)
        if existing.returncode == 0:
            if existing.stdout.strip() != commit:
                raise ResultDeliveryError(
                    "Accepted managed branch already points to another commit"
                )
        elif existing.returncode == 1:
            created = self._run(path, "branch", accepted_branch, commit)
            if created.returncode != 0:
                raise ResultDeliveryError("Accepted managed branch could not be created safely")
        else:
            raise ResultDeliveryError("Accepted branch collision check failed")

        final_branch = self._git(path, "branch", "--show-current").stdout.strip()
        if final_branch != current_managed_branch:
            raise ResultDeliveryError("Managed delivery changed the candidate Worktree branch")

        final_status = self._git(path, "status", "--porcelain=v1", "--untracked-files=all").stdout
        if final_status.strip():
            raise ResultDeliveryError("Candidate Worktree is not clean after delivery")

        return ManagedDeliveryReceipt(branch=accepted_branch, commit=commit)

    def _git(self, cwd: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
        result = self._run(cwd, *arguments)
        if result.returncode != 0:
            raise ResultDeliveryError("Managed Git delivery command failed")
        return result

    @staticmethod
    def _run(cwd: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
        try:
            return subprocess.run(
                ["git", *arguments],
                cwd=cwd,
                check=False,
                capture_output=True,
                text=True,
                timeout=DELIVERY_GIT_TIMEOUT_SECONDS,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise ResultDeliveryError("Managed Git delivery command could not complete") from exc
