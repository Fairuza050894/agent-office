"""Safe local delivery of a human-approved candidate Workspace.

Delivery is intentionally local-only: it stages and commits the already verified
candidate inside its managed worktree, renames that managed branch into an
``accepted-*`` branch, and returns the factual commit SHA. It never pushes,
merges, rebases, checks out the user's branch, or changes repository-global
configuration.
"""

from __future__ import annotations

import subprocess

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
        if current not in {current_managed_branch, accepted_branch}:
            raise ResultDeliveryError("Candidate Worktree is no longer on its managed branch")

        if current != accepted_branch:
            collision = self._run(path, "show-ref", "--verify", "--quiet", f"refs/heads/{accepted_branch}")
            if collision.returncode == 0:
                raise ResultDeliveryError("Accepted managed branch already exists")
            if collision.returncode not in {1}:
                raise ResultDeliveryError("Accepted branch collision check failed")

            renamed = self._run(path, "branch", "-m", accepted_branch)
            if renamed.returncode != 0:
                raise ResultDeliveryError("Candidate branch could not be promoted safely")

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
        else:
            # Idempotent retry is allowed only after this adapter has already
            # renamed the worktree to the accepted branch. A pristine original
            # candidate with no changes is not a deliverable.
            if current != accepted_branch:
                raise ResultDeliveryError("Candidate contains no changes to deliver")

        final_branch = self._git(path, "branch", "--show-current").stdout.strip()
        if final_branch != accepted_branch:
            raise ResultDeliveryError("Managed delivery did not remain on the accepted branch")

        final_status = self._git(path, "status", "--porcelain=v1", "--untracked-files=all").stdout
        if final_status.strip():
            raise ResultDeliveryError("Accepted branch is not clean after delivery")

        commit = self._git(path, "rev-parse", "HEAD").stdout.strip()
        if not commit:
            raise ResultDeliveryError("Accepted delivery has no resolvable commit")

        return ManagedDeliveryReceipt(branch=accepted_branch, commit=commit)

    def _git(self, cwd, *arguments: str) -> subprocess.CompletedProcess[str]:
        result = self._run(cwd, *arguments)
        if result.returncode != 0:
            raise ResultDeliveryError("Managed Git delivery command failed")
        return result

    @staticmethod
    def _run(cwd, *arguments: str) -> subprocess.CompletedProcess[str]:
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
