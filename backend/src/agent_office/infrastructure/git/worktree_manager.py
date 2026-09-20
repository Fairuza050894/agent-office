"""Safe Git worktree management for isolated Workspaces.

Every operation here is argument-safe: Git is invoked through
``subprocess.run([...])`` with an argument array, never a shell string
(WORKTREE_POLICY §41). No command classified as destructive by
WORKTREE_POLICY §37 is ever issued, and nothing in this module touches the
registered Project's main working tree except to read from it.

Absolute locations are never stored or accepted. They are derived from the
configured workspace root and the Workspace's opaque ``path_ref``, then checked
for containment before use, so a caller cannot substitute a path.
"""

from __future__ import annotations

import hashlib
import os
import stat
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from agent_office.application.workspaces.errors import (
    WorktreeCreationError,
    WorktreeNotContainedError,
    WorktreeOperationError,
)
from agent_office.domain import (
    ProjectId,
    RepositoryIdentity,
    RunId,
    WorkspaceChangeSummary,
    WorkspaceId,
    WorkspaceReconciliationOutcome,
)

GIT_TIMEOUT_SECONDS = 15.0

# The generated branch namespace. A branch outside it is never deleted, because
# cleanup must never touch a user branch (WORKTREE_POLICY §186).
MANAGED_BRANCH_PREFIX = "agent-office/"


@dataclass(frozen=True, slots=True)
class _StatusEntry:
    """One parsed ``git status --porcelain -z`` entry."""

    index_status: str
    worktree_status: str
    path: str


class GitWorktreeManager:
    """Manage isolated Git worktrees under a configured root."""

    def __init__(self, workspace_root: Path) -> None:
        self._workspace_root = workspace_root

    @property
    def workspace_root(self) -> Path:
        return self._workspace_root

    # ------------------------------------------------------------------
    # Location derivation and containment
    # ------------------------------------------------------------------

    def _resolve_root(self) -> Path:
        """Return the managed root, creating it if needed.

        The root is Agent Office-owned storage, so creating it is safe and is
        never destructive to repository content.
        """

        root = self._workspace_root.expanduser()
        root.mkdir(parents=True, exist_ok=True)

        return root.resolve(strict=True)

    def resolve_workspace_path(self, path_ref: str) -> Path:
        """Resolve an opaque storage reference to a contained absolute path.

        Rejects an empty reference, an absolute reference, traversal, and any
        resolution that escapes the managed root (WORKTREE_POLICY §14,
        SECURITY_MODEL §24).
        """

        if not path_ref or not path_ref.strip():
            raise WorktreeNotContainedError("Workspace path reference must not be empty")

        if Path(path_ref).is_absolute() or path_ref.startswith("~"):
            raise WorktreeNotContainedError("Workspace path reference must be relative")

        root = self._resolve_root()
        candidate = (root / path_ref).resolve(strict=False)

        if candidate == root or not candidate.is_relative_to(root):
            raise WorktreeNotContainedError(
                "Workspace path must remain inside the managed workspace root"
            )

        return candidate

    # ------------------------------------------------------------------
    # Repository identity and base revision
    # ------------------------------------------------------------------

    def resolve_repository_identity(self, repository_path: Path) -> RepositoryIdentity:
        """Return the Git identity of a repository without mutating it."""

        canonical = self._resolve_repository_root(repository_path)
        common_dir = self._git(canonical, "rev-parse", "--git-common-dir").strip()
        common_path = Path(common_dir)

        if not common_path.is_absolute():
            common_path = canonical / common_path

        return RepositoryIdentity(
            canonical_path=canonical,
            git_common_dir=common_path.resolve(strict=True),
        )

    def resolve_base_revision(self, repository_path: Path) -> str:
        """Return the immutable commit SHA a new worktree will be based on.

        The main working tree is only read. Uncommitted user changes are never
        included, moved, or discarded; the worktree simply starts from the
        recorded commit.
        """

        canonical = self._resolve_repository_root(repository_path)
        revision = self._git(canonical, "rev-parse", "HEAD").strip()

        if not revision:
            raise WorktreeOperationError("Repository has no resolvable base revision")

        return revision

    def _resolve_repository_root(self, repository_path: Path) -> Path:
        try:
            return repository_path.expanduser().resolve(strict=True)
        except OSError as exc:
            raise WorktreeOperationError("Repository path does not exist") from exc

    # ------------------------------------------------------------------
    # Worktree lifecycle
    # ------------------------------------------------------------------

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
        """Create an isolated worktree from a recorded base revision.

        The worktree is created from the Project repository, which is read but
        never modified: ``git worktree add`` writes only to the Git common
        directory and the new managed location.
        """

        repository = self._resolve_repository_root(repository_path)

        if repository != identity.canonical_path:
            raise WorktreeNotContainedError(
                "Repository path does not match the registered repository identity"
            )

        detected = self.resolve_repository_identity(repository)

        if detected.git_common_dir != identity.git_common_dir:
            raise WorktreeOperationError(
                "Repository identity changed since registration; refusing to allocate"
            )

        target = self.resolve_workspace_path(f"{project_id}/{run_id}/{workspace_id}")

        if target.exists():
            # Idempotency guard: never attach to a location we did not create for
            # this exact Workspace, and never delete one that already exists.
            raise WorktreeCreationError(
                "A directory already exists at the managed location for this Workspace"
            )

        target.parent.mkdir(parents=True, exist_ok=True)

        result = self._run(
            repository,
            "worktree",
            "add",
            "-b",
            git_branch,
            str(target),
            base_revision,
        )

        if result.returncode != 0:
            raise WorktreeCreationError(self._safe_git_failure("worktree creation failed", result))

        return target

    def verify_worktree(
        self,
        path_ref: str,
        identity: RepositoryIdentity,
    ) -> WorkspaceReconciliationOutcome:
        """Verify that a managed location is still the expected Worktree."""

        try:
            path = self.resolve_workspace_path(path_ref)
        except WorktreeNotContainedError:
            return WorkspaceReconciliationOutcome.CONFLICT

        if not path.exists():
            return WorkspaceReconciliationOutcome.MISSING

        result = self._run(path, "rev-parse", "--git-common-dir")

        if result.returncode != 0:
            # The directory exists but Git no longer recognises it as a worktree
            # of any repository (WORKTREE_POLICY §132).
            return WorkspaceReconciliationOutcome.ORPHANED

        common_dir = Path(result.stdout.strip())

        if not common_dir.is_absolute():
            common_dir = path / common_dir

        try:
            resolved_common = common_dir.resolve(strict=True)
        except OSError:
            return WorkspaceReconciliationOutcome.ORPHANED

        if resolved_common != identity.git_common_dir:
            # Belongs to a different repository: a critical policy violation.
            return WorkspaceReconciliationOutcome.CONFLICT

        return WorkspaceReconciliationOutcome.CONFIRMED_READY

    def capture_changes(
        self,
        path_ref: str,
        *,
        base_revision: str,
    ) -> WorkspaceChangeSummary:
        """Return a factual change summary for a managed worktree.

        Paths are repository-relative. Counts that Git cannot report numerically
        stay ``None`` rather than being estimated.
        """

        path = self.resolve_workspace_path(path_ref)
        entries = self._status_entries(path)

        added: list[str] = []
        modified: list[str] = []
        deleted: list[str] = []
        untracked: list[str] = []

        for entry in entries:
            if entry.index_status == "?" and entry.worktree_status == "?":
                untracked.append(entry.path)
                continue

            if "D" in {entry.index_status, entry.worktree_status}:
                deleted.append(entry.path)
                continue

            if "A" in {entry.index_status, entry.worktree_status}:
                added.append(entry.path)
                continue

            modified.append(entry.path)

        insertions, deletions = self._numstat(path, base_revision)
        current_revision = self._git_or_none(path, "rev-parse", "HEAD")
        state_fingerprint = self._state_fingerprint(
            path,
            base_revision=base_revision,
            current_revision=current_revision,
            untracked_paths=tuple(sorted(untracked)),
        )

        return WorkspaceChangeSummary(
            base_revision=base_revision,
            files_changed=len(entries),
            added_paths=tuple(sorted(added)),
            modified_paths=tuple(sorted(modified)),
            deleted_paths=tuple(sorted(deleted)),
            untracked_paths=tuple(sorted(untracked)),
            current_revision=current_revision,
            state_fingerprint=state_fingerprint,
            insertions=insertions,
            deletions=deletions,
        )

    def _state_fingerprint(
        self,
        path: Path,
        *,
        base_revision: str,
        current_revision: str | None,
        untracked_paths: tuple[str, ...],
    ) -> str:
        """Return a deterministic digest of the candidate Worktree state.

        Commit identity alone is insufficient because Agent Office intentionally
        permits uncommitted implementation work. The digest therefore binds the
        base/current revision, Git's canonical tracked diff, and the content of
        each untracked path. Raw patch/file content is hashed in memory and is
        never persisted or exposed.
        """

        diff = self._run(
            path,
            "diff",
            "--binary",
            "--full-index",
            "--no-ext-diff",
            "--no-color",
            base_revision,
            "--",
        )

        if diff.returncode != 0:
            raise WorktreeOperationError(
                self._safe_git_failure("candidate-state diff failed", diff)
            )

        digest = hashlib.sha256()
        digest.update(b"agent-office-candidate-state-v1\0")
        digest.update(base_revision.encode("utf-8"))
        digest.update(b"\0")
        digest.update((current_revision or "<unknown>").encode("utf-8"))
        digest.update(b"\0tracked-diff\0")
        digest.update(diff.stdout.encode("utf-8", errors="surrogateescape"))

        for relative_path in untracked_paths:
            digest.update(b"\0untracked-path\0")
            digest.update(os.fsencode(relative_path))
            digest.update(b"\0")
            self._hash_untracked_path(path, relative_path, digest)

        return digest.hexdigest()

    def _hash_untracked_path(
        self,
        root: Path,
        relative_path: str,
        digest: Any,
    ) -> None:
        """Hash one untracked path without following its final symlink.

        Git status supplies repository-relative paths, but this method still
        rejects absolute/traversing input and uses ``lstat``/``O_NOFOLLOW`` so a
        malicious symlink cannot make Evidence fingerprint host files outside
        the managed worktree.
        """

        candidate_rel = Path(relative_path)

        if candidate_rel.is_absolute() or ".." in candidate_rel.parts:
            raise WorktreeOperationError(
                "Git reported an unsafe untracked path while fingerprinting the Worktree"
            )

        candidate = root / candidate_rel

        try:
            before = os.lstat(candidate)
        except OSError as exc:
            raise WorktreeOperationError(
                "An untracked path changed while the Worktree fingerprint was captured"
            ) from exc

        digest.update(str(stat.S_IFMT(before.st_mode)).encode("ascii"))
        digest.update(b":")
        digest.update(str(before.st_mode & 0o777).encode("ascii"))
        digest.update(b"\0")

        if stat.S_ISLNK(before.st_mode):
            try:
                target = os.readlink(candidate)
            except OSError as exc:
                raise WorktreeOperationError(
                    "An untracked symlink changed while the Worktree fingerprint was captured"
                ) from exc

            digest.update(b"symlink\0")
            digest.update(os.fsencode(target))
            return

        if not stat.S_ISREG(before.st_mode):
            raise WorktreeOperationError(
                "Unsupported untracked file type prevents a trustworthy Worktree fingerprint"
            )

        flags = os.O_RDONLY
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW

        try:
            descriptor = os.open(candidate, flags)
        except OSError as exc:
            raise WorktreeOperationError(
                "An untracked file could not be opened safely for fingerprinting"
            ) from exc

        try:
            after = os.fstat(descriptor)

            if (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino):
                raise WorktreeOperationError(
                    "An untracked file changed identity while its fingerprint was captured"
                )

            digest.update(b"regular\0")
            while True:
                chunk = os.read(descriptor, 1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
        finally:
            os.close(descriptor)

    def remove_worktree(self, path_ref: str, *, git_branch: str | None) -> bool:
        """Remove a managed worktree without ever forcing it.

        ``git worktree remove`` refuses to destroy a worktree that holds
        modifications, which is exactly the protection this method relies on: a
        dirty worktree is retained rather than silently discarded
        (WORKTREE_POLICY §58, §60, §184).

        The generated branch is deleted only with the safe ``-d`` form, which
        itself refuses when the branch holds commits not already reachable from
        the recorded base.
        """

        try:
            path = self.resolve_workspace_path(path_ref)
        except WorktreeNotContainedError:
            return False

        if not path.exists():
            # Already gone. Removal is idempotent (WORKTREE_POLICY §171).
            return True

        common_dir = self._git_or_none(path, "rev-parse", "--git-common-dir")

        if common_dir is None:
            # Not a recognised worktree. Do not delete an unknown directory.
            return False

        common_path = Path(common_dir)

        if not common_path.is_absolute():
            common_path = path / common_path

        # Removal is issued from the Git common directory so the command never
        # depends on the current working directory being the worktree itself.
        result = self._run(
            common_path,
            "worktree",
            "remove",
            "--",
            str(path),
        )

        if result.returncode != 0:
            return False

        if git_branch is not None and git_branch.startswith(MANAGED_BRANCH_PREFIX):
            self._run(common_path, "branch", "-d", git_branch)

        return True

    # ------------------------------------------------------------------
    # Git invocation
    # ------------------------------------------------------------------

    def _status_entries(self, path: Path) -> tuple[_StatusEntry, ...]:
        """Parse ``git status --porcelain -z`` without breaking on odd paths.

        ``--untracked-files=all`` is deliberate: an untracked directory would
        otherwise be reported as one collapsed entry, hiding the individual files
        that are genuinely unrecorded workspace changes.
        """

        result = self._run(path, "status", "--porcelain", "-z", "--untracked-files=all")

        if result.returncode != 0:
            raise WorktreeOperationError(self._safe_git_failure("worktree status failed", result))

        tokens = [token for token in result.stdout.split("\0") if token]
        entries: list[_StatusEntry] = []
        index = 0

        while index < len(tokens):
            token = tokens[index]
            index += 1

            if len(token) < 4:
                continue

            index_status = token[0]
            worktree_status = token[1]
            entry_path = token[3:]

            # A rename or copy entry carries the source path in the next token.
            if index_status in {"R", "C"} or worktree_status in {"R", "C"}:
                if index < len(tokens):
                    index += 1

            entries.append(
                _StatusEntry(
                    index_status=index_status,
                    worktree_status=worktree_status,
                    path=entry_path,
                )
            )

        return tuple(entries)

    def _numstat(self, path: Path, base_revision: str) -> tuple[int | None, int | None]:
        """Return insertion and deletion counts, or ``(None, None)``.

        Git reports ``-`` for binary files. Rather than guess, the counts become
        unavailable for the whole summary.
        """

        result = self._run(path, "diff", "--numstat", base_revision)

        if result.returncode != 0:
            return (None, None)

        insertions = 0
        deletions = 0

        for line in result.stdout.splitlines():
            parts = line.split("\t")

            if len(parts) < 3:
                continue

            raw_insertions, raw_deletions = parts[0], parts[1]

            if not raw_insertions.isdigit() or not raw_deletions.isdigit():
                return (None, None)

            insertions += int(raw_insertions)
            deletions += int(raw_deletions)

        return (insertions, deletions)

    def _git(self, path: Path, *arguments: str) -> str:
        result = self._run(path, *arguments)

        if result.returncode != 0:
            raise WorktreeOperationError(self._safe_git_failure("git command failed", result))

        return result.stdout

    def _git_or_none(self, path: Path, *arguments: str) -> str | None:
        result = self._run(path, *arguments)

        if result.returncode != 0:
            return None

        value = result.stdout.strip()

        return value or None

    def _run(self, path: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
        """Run one Git command with an argument array and no shell."""

        try:
            return subprocess.run(
                ["git", "-C", str(path), *arguments],
                check=False,
                capture_output=True,
                text=True,
                timeout=GIT_TIMEOUT_SECONDS,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
            raise WorktreeOperationError("Git command could not be executed safely") from exc

    @staticmethod
    def _safe_git_failure(context: str, result: subprocess.CompletedProcess[str]) -> str:
        """Return a bounded failure summary that never echoes repository content."""

        detail = (result.stderr or "").strip().splitlines()
        first_line = detail[0][:200] if detail else "no diagnostics"

        return f"Git {context}: {first_line}"
