"""Workspace primitives.

A Workspace is a controlled filesystem context for one Run. DOMAIN_MODEL §23
defines the aggregate and §24 its invariants; WORKTREE_POLICY defines the
lifecycle, allocation contract, write ownership, and cleanup rules.

Two rules dominate every design decision here:

* the registered Project's main working tree is never the default autonomous
  write target, and it is never mutated by agent execution;
* a Workspace's identity is not its filesystem location. ``path_ref`` is an
  opaque, system-generated storage reference, and the absolute location is
  recomputed from the configured workspace root on every infrastructure
  operation. That answers DOMAIN_MODEL §69.3 in favour of opaque storage
  references, so a caller can never substitute a path.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.identifiers import (
    AgentRunId,
    ProjectId,
    RunId,
    WorkspaceId,
)
from agent_office.domain.timestamps import to_utc
from agent_office.domain.workflow import AgentAccessMode

# Generated branch names are derived only from system identifiers. The pattern is
# enforced so a malformed or user-influenced value can never reach Git.
BRANCH_NAME_PATTERN = re.compile(r"^agent-office/[0-9a-f-]{36}/[a-z0-9][a-z0-9-]{0,63}$")
BRANCH_NAME_PREFIX = "agent-office"

# Opaque storage reference segments are always system identifiers.
_PATH_REF_SEGMENT_PATTERN = re.compile(r"^[0-9a-f-]{36}$")

MAX_REASON_SUMMARY_LENGTH = 400


class WorkspaceKind(StrEnum):
    """Canonical Workspace kinds (DOMAIN_MODEL §23)."""

    PROJECT_READ_VIEW = "PROJECT_READ_VIEW"
    GIT_WORKTREE = "GIT_WORKTREE"
    INTEGRATION_WORKTREE = "INTEGRATION_WORKTREE"
    TEMPORARY = "TEMPORARY"


class WorkspaceStatus(StrEnum):
    """Canonical Workspace lifecycle (DOMAIN_MODEL §23, WORKTREE_POLICY §18)."""

    ALLOCATING = "ALLOCATING"
    READY = "READY"
    IN_USE = "IN_USE"
    RELEASING = "RELEASING"
    RELEASED = "RELEASED"
    FAILED = "FAILED"
    ORPHANED = "ORPHANED"


WORKSPACE_TERMINAL_STATUSES: frozenset[WorkspaceStatus] = frozenset(
    {WorkspaceStatus.RELEASED, WorkspaceStatus.FAILED}
)

#: Kinds backed by an isolated Git worktree rather than a logical view.
WORKTREE_KINDS: frozenset[WorkspaceKind] = frozenset(
    {WorkspaceKind.GIT_WORKTREE, WorkspaceKind.INTEGRATION_WORKTREE}
)

#: Statuses in which a Workspace must not retain a write owner, because the
#: owning execution has already been proven finished.
WORKSPACE_OWNERLESS_STATUSES: frozenset[WorkspaceStatus] = frozenset(
    {WorkspaceStatus.RELEASING, WorkspaceStatus.RELEASED}
)

#: Statuses that must never accept new autonomous writes (WORKTREE_POLICY §24.7).
WORKSPACE_UNWRITABLE_STATUSES: frozenset[WorkspaceStatus] = frozenset(
    {
        WorkspaceStatus.RELEASING,
        WorkspaceStatus.RELEASED,
        WorkspaceStatus.FAILED,
        WorkspaceStatus.ORPHANED,
    }
)


class WorkspaceReasonCode(StrEnum):
    """Controlled reasons for a non-ready Workspace state."""

    REPOSITORY_IDENTITY_MISMATCH = "REPOSITORY_IDENTITY_MISMATCH"
    REPOSITORY_INVALID = "REPOSITORY_INVALID"
    BASE_REVISION_UNAVAILABLE = "BASE_REVISION_UNAVAILABLE"
    WORKTREE_CREATION_FAILED = "WORKTREE_CREATION_FAILED"
    INTEGRATION_CONFLICT = "INTEGRATION_CONFLICT"
    BRANCH_COLLISION = "BRANCH_COLLISION"
    WRITE_OWNERSHIP_UNAVAILABLE = "WRITE_OWNERSHIP_UNAVAILABLE"
    PATH_OUTSIDE_MANAGED_ROOT = "PATH_OUTSIDE_MANAGED_ROOT"
    RECONCILIATION_REQUIRED = "RECONCILIATION_REQUIRED"
    WORKTREE_MISSING = "WORKTREE_MISSING"
    WORKTREE_UNMANAGED = "WORKTREE_UNMANAGED"
    DIRTY_WORKTREE = "DIRTY_WORKTREE"
    UNRECORDED_CHANGES = "UNRECORDED_CHANGES"
    EXECUTION_UNRESOLVED = "EXECUTION_UNRESOLVED"
    CLEANUP_FAILED = "CLEANUP_FAILED"


class WorkspaceReconciliationOutcome(StrEnum):
    """Factual outcome of reconciling a Workspace (WORKTREE_POLICY §168)."""

    CONFIRMED_READY = "CONFIRMED_READY"
    CONFIRMED_IN_USE = "CONFIRMED_IN_USE"
    CONFIRMED_RELEASED = "CONFIRMED_RELEASED"
    ORPHANED = "ORPHANED"
    MISSING = "MISSING"
    CONFLICT = "CONFLICT"
    UNKNOWN = "UNKNOWN"


_ALLOWED_WORKSPACE_TRANSITIONS: dict[WorkspaceStatus, frozenset[WorkspaceStatus]] = {
    WorkspaceStatus.ALLOCATING: frozenset(
        {
            WorkspaceStatus.READY,
            WorkspaceStatus.FAILED,
            WorkspaceStatus.ORPHANED,
        }
    ),
    WorkspaceStatus.READY: frozenset(
        {
            WorkspaceStatus.IN_USE,
            WorkspaceStatus.RELEASING,
            WorkspaceStatus.ORPHANED,
            WorkspaceStatus.FAILED,
        }
    ),
    WorkspaceStatus.IN_USE: frozenset(
        {
            WorkspaceStatus.READY,
            WorkspaceStatus.RELEASING,
            WorkspaceStatus.ORPHANED,
            WorkspaceStatus.FAILED,
        }
    ),
    # A Workspace being released may still fail cleanup or be reconciled back to
    # a ready/in-use state if the release precondition turned out to be wrong.
    WorkspaceStatus.RELEASING: frozenset(
        {
            WorkspaceStatus.RELEASED,
            WorkspaceStatus.READY,
            WorkspaceStatus.IN_USE,
            WorkspaceStatus.ORPHANED,
            WorkspaceStatus.FAILED,
        }
    ),
    WorkspaceStatus.ORPHANED: frozenset(
        {
            WorkspaceStatus.RELEASING,
            WorkspaceStatus.RELEASED,
            WorkspaceStatus.FAILED,
        }
    ),
    WorkspaceStatus.RELEASED: frozenset(),
    WorkspaceStatus.FAILED: frozenset(),
}


def is_terminal_workspace_status(status: WorkspaceStatus) -> bool:
    """Return whether a Workspace status is terminal."""

    return status in WORKSPACE_TERMINAL_STATUSES


def workspace_transition_allowed(current: WorkspaceStatus, target: WorkspaceStatus) -> bool:
    """Return whether a Workspace transition is permitted."""

    if current is target:
        return True

    return target in _ALLOWED_WORKSPACE_TRANSITIONS[current]


def ensure_workspace_transition_allowed(current: WorkspaceStatus, target: WorkspaceStatus) -> None:
    """Validate a Workspace transition, failing safely when invalid."""

    if current is target:
        return

    if is_terminal_workspace_status(current):
        raise DomainInvariantError(
            "Terminal Workspace status cannot transition to a different state: "
            f"{current} -> {target}"
        )

    if not workspace_transition_allowed(current, target):
        raise DomainInvariantError(f"Invalid Workspace transition: {current} -> {target}")


def workspace_path_ref(project_id: ProjectId, run_id: RunId, workspace_id: WorkspaceId) -> str:
    """Derive the opaque storage reference for a Workspace.

    The reference is relative and built only from system identifiers, so it can
    never contain traversal, a user-supplied fragment, or an absolute path.
    """

    return f"{project_id}/{run_id}/{workspace_id}"


def validate_workspace_path_ref(path_ref: str) -> str:
    """Validate an opaque storage reference, rejecting anything unsafe."""

    if not path_ref or not path_ref.strip():
        raise DomainInvariantError("Workspace path_ref must not be empty")

    if path_ref.startswith("/") or path_ref.startswith("~"):
        raise DomainInvariantError("Workspace path_ref must not be absolute")

    segments = path_ref.split("/")

    if len(segments) != 3:
        raise DomainInvariantError("Workspace path_ref must declare exactly three segments")

    for segment in segments:
        if not _PATH_REF_SEGMENT_PATTERN.match(segment):
            raise DomainInvariantError(
                "Workspace path_ref segments must be system-generated identifiers"
            )

    return path_ref


def generated_branch_name(run_id: RunId, agent_profile_key: str, workspace_id: WorkspaceId) -> str:
    """Return the generated branch name for a writable Workspace.

    Only a sanitized AgentProfile key (a controlled catalog value) and system
    identifiers appear, so no Task title, Project name, or arbitrary user string
    can reach a Git ref. The workspace identifier keeps the name unique per
    Project, Run and AgentRun, and collision-free across retries.
    """

    sanitized = re.sub(r"[^a-z0-9]+", "-", agent_profile_key.strip().lower()).strip("-")
    sanitized = sanitized[:48].strip("-")

    if not sanitized:
        raise DomainInvariantError("AgentProfile key must contain a usable branch fragment")

    return f"{BRANCH_NAME_PREFIX}/{run_id}/{sanitized}-{workspace_id}"


def validate_branch_name(branch_name: str) -> str:
    """Validate a generated branch name before it reaches Git."""

    if not BRANCH_NAME_PATTERN.match(branch_name):
        raise DomainInvariantError("Workspace branch name is not a generated Agent Office branch")

    return branch_name


@dataclass(frozen=True, slots=True)
class WorkspaceChangeSummary:
    """Factual change summary of a Worktree, from Git (WORKTREE_POLICY §167).

    Paths are repository-relative. Insertion and deletion counts stay ``None``
    when Git cannot report them numerically, rather than being estimated.
    """

    base_revision: str
    files_changed: int
    added_paths: tuple[str, ...] = ()
    modified_paths: tuple[str, ...] = ()
    deleted_paths: tuple[str, ...] = ()
    untracked_paths: tuple[str, ...] = ()
    current_revision: str | None = None
    state_fingerprint: str | None = None
    insertions: int | None = None
    deletions: int | None = None

    @property
    def is_dirty(self) -> bool:
        """Return whether the Worktree differs from its base revision."""

        return self.files_changed > 0

    @property
    def changed_paths(self) -> tuple[str, ...]:
        """Return every changed path, repository-relative and sorted."""

        return tuple(
            sorted(
                {
                    *self.added_paths,
                    *self.modified_paths,
                    *self.deleted_paths,
                    *self.untracked_paths,
                }
            )
        )


@dataclass(frozen=True, slots=True)
class Workspace:
    """A controlled filesystem context for one Run.

    ``path_ref`` is opaque and relative; the absolute filesystem location is
    never stored on the aggregate and is never exposed through a DTO.
    """

    id: WorkspaceId
    project_id: ProjectId
    run_id: RunId
    kind: WorkspaceKind
    access_mode: AgentAccessMode
    status: WorkspaceStatus
    path_ref: str
    created_at: datetime
    updated_at: datetime
    owner_agent_run_id: AgentRunId | None = None
    base_revision: str | None = None
    git_branch: str | None = None
    released_at: datetime | None = None
    reason_code: WorkspaceReasonCode | None = None
    reason_summary: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "path_ref", validate_workspace_path_ref(self.path_ref))

        if self.git_branch is not None:
            object.__setattr__(self, "git_branch", validate_branch_name(self.git_branch))

        if self.base_revision is not None:
            revision = self.base_revision.strip()

            if not revision:
                raise DomainInvariantError("Workspace base_revision must not be blank")

            object.__setattr__(self, "base_revision", revision)

        if self.reason_summary is not None:
            summary = self.reason_summary.strip()

            if len(summary) > MAX_REASON_SUMMARY_LENGTH:
                raise DomainInvariantError("Workspace reason_summary is too long")

            object.__setattr__(self, "reason_summary", summary or None)

        if self.writable and self.base_revision is None:
            # Allocation records the Workspace before the base revision is
            # known, so a crash during allocation stays detectable. Every state
            # reachable from ALLOCATING must carry the revision.
            if self.status not in {WorkspaceStatus.ALLOCATING, WorkspaceStatus.FAILED}:
                raise DomainInvariantError("A writable Workspace must record a base revision")

        if self.writable and self.kind not in WORKTREE_KINDS:
            raise DomainInvariantError(
                "A writable Workspace must be an isolated Git worktree, not a logical view"
            )

        if self.owner_agent_run_id is not None and not self.writable:
            raise DomainInvariantError("Only a writable Workspace may have a write owner")

        if self.status in WORKSPACE_OWNERLESS_STATUSES and self.owner_agent_run_id is not None:
            raise DomainInvariantError(
                "A Workspace whose execution has finished must not retain a write owner"
            )

        created_at = to_utc(self.created_at)
        updated_at = to_utc(self.updated_at)

        if updated_at < created_at:
            raise DomainInvariantError("Workspace updated_at must not precede created_at")

        object.__setattr__(self, "created_at", created_at)
        object.__setattr__(self, "updated_at", updated_at)

        if self.released_at is not None:
            released_at = to_utc(self.released_at)

            if released_at < created_at:
                raise DomainInvariantError("Workspace released_at must not precede created_at")

            object.__setattr__(self, "released_at", released_at)

        if self.status is WorkspaceStatus.RELEASED and self.released_at is None:
            raise DomainInvariantError("A released Workspace must record released_at")

        if self.status is not WorkspaceStatus.RELEASED and self.released_at is not None:
            raise DomainInvariantError("Only a released Workspace may record released_at")

    @property
    def writable(self) -> bool:
        """Return whether this Workspace may receive autonomous writes."""

        return self.access_mode in {AgentAccessMode.BOUNDED_WRITE, AgentAccessMode.WRITE}

    @property
    def is_ready(self) -> bool:
        """Return whether the Workspace is ready to accept a write owner."""

        return self.status is WorkspaceStatus.READY

    @property
    def accepts_writes(self) -> bool:
        """Return whether new autonomous writes are permitted."""

        return self.writable and self.status in {WorkspaceStatus.READY, WorkspaceStatus.IN_USE}
