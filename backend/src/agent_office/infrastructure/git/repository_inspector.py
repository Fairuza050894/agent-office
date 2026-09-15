"""Read-only local Git repository inspection."""

from __future__ import annotations

import subprocess
from pathlib import Path

from agent_office.application.projects import (
    InvalidRepositoryError,
    RepositoryInspection,
)
from agent_office.domain import RepositoryIdentity

GIT_TIMEOUT_SECONDS = 5.0


class GitRepositoryInspector:
    """Validate and identify local Git repositories without mutation."""

    def inspect(self, path: Path) -> RepositoryInspection:
        try:
            selected_path = path.expanduser().resolve(strict=True)
        except OSError as exc:
            raise InvalidRepositoryError("Repository path does not exist") from exc

        if not selected_path.is_dir():
            raise InvalidRepositoryError("Repository path must be a directory")

        inside_worktree = self._git(
            selected_path,
            "rev-parse",
            "--is-inside-work-tree",
            allow_failure=True,
        )

        if inside_worktree != "true":
            raise InvalidRepositoryError("Path is not a Git working repository")

        top_level = self._git(
            selected_path,
            "rev-parse",
            "--show-toplevel",
        )
        canonical_path = Path(top_level).resolve(strict=True)

        common_dir_raw = self._git(
            canonical_path,
            "rev-parse",
            "--git-common-dir",
        )
        common_dir = Path(common_dir_raw)

        if not common_dir.is_absolute():
            common_dir = canonical_path / common_dir

        git_common_dir = common_dir.resolve(strict=True)

        default_branch = self._detect_default_branch(canonical_path)

        return RepositoryInspection(
            repository_path=canonical_path,
            repository_identity=RepositoryIdentity(
                canonical_path=canonical_path,
                git_common_dir=git_common_dir,
            ),
            default_branch=default_branch,
        )

    def _detect_default_branch(self, repository: Path) -> str:
        remote_head = self._git(
            repository,
            "symbolic-ref",
            "--quiet",
            "--short",
            "refs/remotes/origin/HEAD",
            allow_failure=True,
        )

        if remote_head:
            prefix = "origin/"
            return remote_head[len(prefix) :] if remote_head.startswith(prefix) else remote_head

        current_branch = self._git(
            repository,
            "branch",
            "--show-current",
            allow_failure=True,
        )

        if current_branch:
            return current_branch

        raise InvalidRepositoryError("Unable to determine repository default branch")

    def _git(
        self,
        repository: Path,
        *arguments: str,
        allow_failure: bool = False,
    ) -> str:
        try:
            result = subprocess.run(
                [
                    "git",
                    "-C",
                    str(repository),
                    *arguments,
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=GIT_TIMEOUT_SECONDS,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
            raise InvalidRepositoryError("Git repository inspection failed") from exc

        if result.returncode != 0:
            if allow_failure:
                return ""

            raise InvalidRepositoryError("Git repository inspection failed")

        return result.stdout.strip()
