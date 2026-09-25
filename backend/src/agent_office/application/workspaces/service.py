"""Workspace coordination: allocation, write ownership, inspection, release.

This service is the only writer of Workspace lifecycle state, and the only place
that decides whether an isolated worktree may be created, handed to an executor,
or removed. Two rules are enforced structurally rather than by convention:

* the registered Project's main working tree is read but never mutated — all
  writes go to a managed worktree;
* removal happens only when it is provably safe, always through Git lifecycle
  semantics. A worktree holding unrecorded changes is retained and explained.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from datetime import datetime

from agent_office.application.audit import AuditService
from agent_office.application.events import EventService
from agent_office.application.projects import ProjectService
from agent_office.application.runs import RunService
from agent_office.application.workspaces.errors import (
    WorkspaceAllocationError,
    WorkspaceIntegrationError,
    WorkspaceNotFoundError,
    WorkspaceOwnershipError,
    WorkspaceReleaseError,
    WorktreeCreationError,
    WorktreeNotContainedError,
    WorktreeOperationError,
)
from agent_office.application.workspaces.ports import WorkspaceRepository, WorktreeManager
from agent_office.domain import (
    WORKSPACE_UNWRITABLE_STATUSES,
    WORKTREE_KINDS,
    AgentAccessMode,
    AgentRun,
    AgentRunId,
    AuditAction,
    AuditActorType,
    AuditTargetType,
    EventSource,
    EventType,
    ProjectStatus,
    Run,
    RunId,
    SafeMetadata,
    Workspace,
    WorkspaceChangeSummary,
    WorkspaceId,
    WorkspaceKind,
    WorkspaceReasonCode,
    WorkspaceReconciliationOutcome,
    WorkspaceStatus,
    ensure_workspace_transition_allowed,
    generated_branch_name,
    utc_now,
    workspace_path_ref,
)

Clock = Callable[[], datetime]

WorkspaceIdFactory = Callable[[], WorkspaceId]

#: Access modes that require an isolated writable Workspace before an executor
#: may be started (WORKTREE_POLICY §17, §25).
WRITE_ACCESS_MODES: frozenset[AgentAccessMode] = frozenset(
    {AgentAccessMode.BOUNDED_WRITE, AgentAccessMode.WRITE}
)

# A write-capable Workspace is always an isolated Git worktree (WORKTREE_POLICY §17).
WRITABLE_WORKSPACE_KIND = WorkspaceKind.GIT_WORKTREE


class WorkspaceService:
    """Allocate, own, inspect, release, and reconcile Workspaces."""

    def __init__(
        self,
        repository: WorkspaceRepository,
        worktree_manager: WorktreeManager,
        *,
        project_service: ProjectService,
        run_service: RunService,
        event_service: EventService,
        audit_service: AuditService,
        clock: Clock = utc_now,
        workspace_id_factory: WorkspaceIdFactory = WorkspaceId.new,
    ) -> None:
        self._repository = repository
        self._worktrees = worktree_manager
        self._projects = project_service
        self._runs = run_service
        self._events = event_service
        self._audit = audit_service
        self._clock = clock
        self._workspace_id_factory = workspace_id_factory

    def get(self, workspace_id: WorkspaceId) -> Workspace:
        workspace = self._repository.get(workspace_id)
        if workspace is None:
            raise WorkspaceNotFoundError(f"Workspace {workspace_id} was not found")
        return workspace

    def list_for_run(self, run_id: RunId) -> tuple[Workspace, ...]:
        self._runs.get_run(run_id)
        return self._repository.list_by_run(run_id)

    def find_for_agent_run(self, agent_run_id: AgentRunId) -> Workspace | None:
        return self._repository.find_by_owner(agent_run_id)

    def allocate_for_agent_run(self, run: Run, agent_run: AgentRun) -> Workspace:
        if agent_run.access_mode not in WRITE_ACCESS_MODES:
            raise WorkspaceAllocationError(
                None,
                WorkspaceReasonCode.WRITE_OWNERSHIP_UNAVAILABLE,
                "A read-only assignment does not require a writable Workspace.",
            )

        if agent_run.workspace_id is not None:
            recorded = self._repository.get(agent_run.workspace_id)
            if (
                recorded is not None
                and recorded.run_id == run.id
                and recorded.status not in {WorkspaceStatus.RELEASED, WorkspaceStatus.FAILED}
            ):
                return recorded

        project = self._projects.get_project(run.project_id)
        if project.status is not ProjectStatus.ACTIVE:
            raise WorkspaceAllocationError(
                None,
                WorkspaceReasonCode.REPOSITORY_INVALID,
                "The Project is archived, so no writable Workspace may be allocated.",
            )

        workspace_id = self._workspace_id_factory()
        now = utc_now(self._clock)
        workspace = Workspace(
            id=workspace_id,
            project_id=run.project_id,
            run_id=run.id,
            kind=WRITABLE_WORKSPACE_KIND,
            access_mode=agent_run.access_mode,
            status=WorkspaceStatus.ALLOCATING,
            path_ref=workspace_path_ref(run.project_id, run.id, workspace_id),
            created_at=now,
            updated_at=now,
        )
        self._repository.add(workspace)
        self._emit(
            run,
            EventType.WORKSPACE_ALLOCATION_REQUESTED,
            workspace,
            extra=(
                ("agent_run_id", str(agent_run.id)),
                ("requested_access_mode", agent_run.access_mode.value),
            ),
        )

        try:
            identity = self._worktrees.resolve_repository_identity(project.repository_path)
            base_revision = self._worktrees.resolve_base_revision(project.repository_path)
        except WorktreeNotContainedError as exc:
            return self._fail_allocation(
                workspace, WorkspaceReasonCode.PATH_OUTSIDE_MANAGED_ROOT, str(exc)
            )
        except WorktreeOperationError as exc:
            return self._fail_allocation(
                workspace,
                WorkspaceReasonCode.REPOSITORY_INVALID,
                f"The Project repository could not be validated: {exc}",
            )

        if identity.git_common_dir != project.repository_identity.git_common_dir:
            return self._fail_allocation(
                workspace,
                WorkspaceReasonCode.REPOSITORY_IDENTITY_MISMATCH,
                "The Project repository identity no longer matches its registration.",
            )

        branch = generated_branch_name(run.id, agent_run.agent_profile_key, workspace_id)
        try:
            self._worktrees.create_worktree(
                project_id=run.project_id,
                run_id=run.id,
                workspace_id=workspace_id,
                repository_path=project.repository_path,
                identity=identity,
                base_revision=base_revision,
                git_branch=branch,
            )
        except WorktreeNotContainedError as exc:
            return self._fail_allocation(
                workspace, WorkspaceReasonCode.PATH_OUTSIDE_MANAGED_ROOT, str(exc)
            )
        except WorktreeCreationError as exc:
            return self._fail_allocation(
                workspace,
                WorkspaceReasonCode.WORKTREE_CREATION_FAILED,
                f"An isolated worktree could not be created: {exc}",
            )
        except WorktreeOperationError as exc:
            return self._fail_allocation(
                workspace,
                WorkspaceReasonCode.WORKTREE_CREATION_FAILED,
                f"An isolated worktree could not be created: {exc}",
            )

        ready = replace(
            workspace,
            status=WorkspaceStatus.READY,
            base_revision=base_revision,
            git_branch=branch,
            updated_at=utc_now(self._clock),
        )
        self._repository.update(ready)
        self._emit(run, EventType.WORKSPACE_CREATED, ready)
        self._emit(run, EventType.WORKSPACE_READY, ready)
        self._audit_workspace(
            ready,
            AuditAction.WORKSPACE_ALLOCATED,
            actor_type=AuditActorType.SYSTEM,
            safe_metadata=(
                ("access_mode", ready.access_mode.value),
                ("agent_run_id", str(agent_run.id)),
            ),
        )
        return ready

    def ensure_integration_workspace(
        self,
        run: Run,
        source_workspace_ids: tuple[WorkspaceId, ...],
    ) -> Workspace:
        unique_sources = tuple(dict.fromkeys(source_workspace_ids))
        if len(unique_sources) < 2:
            raise WorkspaceIntegrationError((), "Integration requires at least two writers.")

        existing = [
            workspace
            for workspace in self._repository.list_by_run(run.id)
            if workspace.kind is WorkspaceKind.INTEGRATION_WORKTREE
        ]
        if len(existing) > 1:
            raise WorkspaceIntegrationError(
                (),
                (
                    "More than one integration Workspace exists for this Run; "
                    "operator review is required."
                ),
            )
        if existing:
            workspace = existing[0]
            if (
                workspace.status is WorkspaceStatus.READY
                and workspace.reason_code is None
                and workspace.base_revision is not None
            ):
                return workspace
            if workspace.reason_code is WorkspaceReasonCode.INTEGRATION_CONFLICT:
                raise WorkspaceIntegrationError(
                    (),
                    workspace.reason_summary
                    or "Integration is blocked by conflicting writer paths.",
                )
            raise WorkspaceIntegrationError(
                (),
                "The existing integration Workspace is not a usable review candidate.",
            )

        sources = tuple(self.get(workspace_id) for workspace_id in unique_sources)
        for source in sources:
            if source.run_id != run.id or source.project_id != run.project_id:
                raise WorkspaceIntegrationError(
                    (), "Integration sources must belong to the same Run and Project."
                )
            if source.kind not in WORKTREE_KINDS or not source.writable:
                raise WorkspaceIntegrationError(
                    (), "Integration sources must be writable managed Worktrees."
                )
            if source.owner_agent_run_id is not None or source.status is not WorkspaceStatus.READY:
                raise WorkspaceIntegrationError(
                    (), "Integration sources must be quiescent READY Workspaces."
                )
            if source.base_revision is None:
                raise WorkspaceIntegrationError(
                    (), "Integration sources must record a base revision."
                )

        base_revisions = {source.base_revision for source in sources}
        if len(base_revisions) != 1:
            raise WorkspaceIntegrationError(
                (), "Integration sources do not share one immutable base revision."
            )
        base_revision = next(iter(base_revisions))
        if base_revision is None:
            raise WorkspaceIntegrationError((), "Integration sources must record a base revision.")

        project = self._projects.get_project(run.project_id)
        if project.status is not ProjectStatus.ACTIVE:
            raise WorkspaceIntegrationError((), "The Project is archived.")

        workspace_id = self._workspace_id_factory()
        now = utc_now(self._clock)
        workspace = Workspace(
            id=workspace_id,
            project_id=run.project_id,
            run_id=run.id,
            kind=WorkspaceKind.INTEGRATION_WORKTREE,
            access_mode=AgentAccessMode.WRITE,
            status=WorkspaceStatus.ALLOCATING,
            path_ref=workspace_path_ref(run.project_id, run.id, workspace_id),
            created_at=now,
            updated_at=now,
        )
        self._repository.add(workspace)
        self._emit(
            run,
            EventType.WORKSPACE_ALLOCATION_REQUESTED,
            workspace,
            extra=(("integration_source_count", str(len(sources))),),
        )

        try:
            identity = self._worktrees.resolve_repository_identity(project.repository_path)
            branch = generated_branch_name(run.id, "integration", workspace_id)
            self._worktrees.create_worktree(
                project_id=run.project_id,
                run_id=run.id,
                workspace_id=workspace_id,
                repository_path=project.repository_path,
                identity=identity,
                base_revision=base_revision,
                git_branch=branch,
            )
            conflicts = self._worktrees.integrate_worktrees(
                workspace.path_ref,
                tuple(source.path_ref for source in sources),
                base_revision=base_revision,
            )
        except (WorktreeNotContainedError, WorktreeCreationError, WorktreeOperationError) as exc:
            failed = replace(
                workspace,
                status=WorkspaceStatus.FAILED,
                base_revision=base_revision,
                reason_code=WorkspaceReasonCode.WORKTREE_CREATION_FAILED,
                reason_summary="The integration Workspace could not be prepared safely.",
                updated_at=utc_now(self._clock),
            )
            self._repository.update(failed)
            self._emit(run, EventType.WORKSPACE_FAILED, failed)
            raise WorkspaceIntegrationError((), str(exc)) from exc

        if conflicts:
            summary = "Integration conflict on repository-relative paths: " + ", ".join(
                conflicts[:10]
            )
            if len(conflicts) > 10:
                summary += f" (+{len(conflicts) - 10} more)"
            failed = replace(
                workspace,
                status=WorkspaceStatus.FAILED,
                base_revision=base_revision,
                git_branch=branch,
                reason_code=WorkspaceReasonCode.INTEGRATION_CONFLICT,
                reason_summary=summary,
                updated_at=utc_now(self._clock),
            )
            self._repository.update(failed)
            self._emit(
                run,
                EventType.WORKSPACE_CONFLICT_DETECTED,
                failed,
                extra=(
                    ("conflict_count", str(len(conflicts))),
                    ("conflicting_paths", ",".join(conflicts[:10])),
                    ("base_revision", base_revision),
                ),
            )
            raise WorkspaceIntegrationError(conflicts, summary)

        ready = replace(
            workspace,
            status=WorkspaceStatus.READY,
            base_revision=base_revision,
            git_branch=branch,
            updated_at=utc_now(self._clock),
        )
        self._repository.update(ready)
        self._emit(
            run,
            EventType.WORKSPACE_CREATED,
            ready,
            extra=(("integration_source_count", str(len(sources))),),
        )
        self._emit(run, EventType.WORKSPACE_READY, ready)
        self._audit_workspace(
            ready,
            AuditAction.WORKSPACE_ALLOCATED,
            actor_type=AuditActorType.SYSTEM,
            safe_metadata=(
                ("integration_source_count", str(len(sources))),
                ("workspace_kind", WorkspaceKind.INTEGRATION_WORKTREE.value),
            ),
        )
        return ready

    def _fail_allocation(
        self,
        workspace: Workspace,
        reason_code: WorkspaceReasonCode,
        reason_summary: str,
    ) -> Workspace:
        failed = replace(
            workspace,
            status=WorkspaceStatus.FAILED,
            reason_code=reason_code,
            reason_summary=reason_summary,
            updated_at=utc_now(self._clock),
        )
        self._repository.update(failed)
        run = self._runs.get_run(workspace.run_id)
        self._emit(run, EventType.WORKSPACE_FAILED, failed)
        raise WorkspaceAllocationError(workspace.id, reason_code, reason_summary)

    def allocate_read_view(
        self,
        run: Run,
        agent_run: AgentRun,
        source_workspace_id: WorkspaceId,
    ) -> Workspace:
        if agent_run.workspace_id is not None:
            recorded = self._repository.get(agent_run.workspace_id)
            if (
                recorded is not None
                and recorded.run_id == run.id
                and recorded.status not in {WorkspaceStatus.RELEASED, WorkspaceStatus.FAILED}
            ):
                return recorded

        source = self.get(source_workspace_id)
        if source.run_id != run.id:
            raise WorkspaceOwnershipError(
                "A read view may only observe a Workspace of the same Run."
            )
        if source.kind not in WORKTREE_KINDS:
            raise WorkspaceAllocationError(
                None,
                WorkspaceReasonCode.REPOSITORY_INVALID,
                "Only a Git worktree Workspace can be observed as a review candidate.",
            )

        workspace_id = self._workspace_id_factory()
        now = utc_now(self._clock)
        view = Workspace(
            id=workspace_id,
            project_id=run.project_id,
            run_id=run.id,
            kind=WorkspaceKind.PROJECT_READ_VIEW,
            access_mode=AgentAccessMode.READ_ONLY,
            status=WorkspaceStatus.READY,
            path_ref=source.path_ref,
            base_revision=source.base_revision,
            created_at=now,
            updated_at=now,
        )
        self._repository.add(view)
        self._emit(
            run,
            EventType.WORKSPACE_CREATED,
            view,
            extra=(
                ("agent_run_id", str(agent_run.id)),
                ("observed_workspace_id", str(source.id)),
            ),
        )
        return view

    def acquire_write_ownership(self, workspace_id: WorkspaceId, agent_run: AgentRun) -> Workspace:
        workspace = self.get(workspace_id)
        if workspace.run_id != agent_run.run_id or workspace.project_id != agent_run.project_id:
            raise WorkspaceOwnershipError(
                "A Workspace may only be owned by an AgentRun of the same Run and Project."
            )
        if not workspace.writable:
            raise WorkspaceOwnershipError("A read-only Workspace cannot hold write ownership.")
        if workspace.owner_agent_run_id == agent_run.id:
            return workspace

        run = self._runs.get_run(workspace.run_id)
        if workspace.owner_agent_run_id is not None:
            self._emit(run, EventType.WORKSPACE_CONFLICT_DETECTED, workspace)
            raise WorkspaceOwnershipError(
                "This Workspace already has an active writer; parallel writers require "
                "separate Worktrees."
            )
        if workspace.status is not WorkspaceStatus.READY:
            self._emit(run, EventType.WORKSPACE_CONFLICT_DETECTED, workspace)
            raise WorkspaceOwnershipError(
                f"A Workspace in state {workspace.status} cannot acquire a writer."
            )

        claimed = self._repository.acquire_write_ownership(
            workspace_id,
            agent_run.id,
            updated_at=utc_now(self._clock).isoformat(),
        )
        if not claimed:
            self._emit(run, EventType.WORKSPACE_CONFLICT_DETECTED, self.get(workspace_id))
            raise WorkspaceOwnershipError(
                "Write ownership of this Workspace was taken by another writer."
            )
        return self.get(workspace_id)

    def release_write_ownership(self, workspace_id: WorkspaceId) -> Workspace:
        workspace = self.get(workspace_id)
        if workspace.owner_agent_run_id is None:
            return workspace
        if workspace.status in WORKSPACE_UNWRITABLE_STATUSES:
            return workspace

        released = replace(
            workspace,
            status=WorkspaceStatus.READY,
            owner_agent_run_id=None,
            updated_at=utc_now(self._clock),
        )
        self._repository.update(released)
        return released

    def capture_changes(self, workspace_id: WorkspaceId) -> WorkspaceChangeSummary:
        workspace = self.get(workspace_id)
        if workspace.base_revision is None:
            raise WorkspaceReleaseError(
                "A Workspace without a recorded base revision has no comparable changes."
            )
        return self._worktrees.capture_changes(
            workspace.path_ref,
            base_revision=workspace.base_revision,
        )

    def request_release(self, workspace_id: WorkspaceId) -> Workspace:
        workspace = self.get(workspace_id)
        if workspace.status is WorkspaceStatus.RELEASED:
            return workspace

        run = self._runs.get_run(workspace.run_id)
        self._audit_workspace(
            workspace,
            AuditAction.WORKSPACE_RELEASE_REQUESTED,
            actor_type=AuditActorType.USER,
        )

        if workspace.kind not in WORKTREE_KINDS:
            now = utc_now(self._clock)
            released_view = replace(
                workspace,
                status=WorkspaceStatus.RELEASED,
                released_at=now,
                updated_at=now,
            )
            self._repository.update(released_view)
            self._emit(run, EventType.WORKSPACE_RELEASED, released_view)
            return released_view

        if workspace.owner_agent_run_id is not None:
            return self._retain(
                workspace,
                run,
                WorkspaceReasonCode.EXECUTION_UNRESOLVED,
                "The Workspace still has an attached writer; release waits until "
                "execution is proven terminal.",
            )

        if workspace.status is not WorkspaceStatus.RELEASING:
            try:
                ensure_workspace_transition_allowed(workspace.status, WorkspaceStatus.RELEASING)
            except Exception:
                return self._retain(
                    workspace,
                    run,
                    WorkspaceReasonCode.RECONCILIATION_REQUIRED,
                    "The Workspace is not in a releasable state; reconciliation is required.",
                )
            workspace = replace(
                workspace,
                status=WorkspaceStatus.RELEASING,
                updated_at=utc_now(self._clock),
            )
            self._repository.update(workspace)
            self._emit(run, EventType.WORKSPACE_RELEASE_REQUESTED, workspace)

        try:
            summary = self.capture_changes(workspace.id)
        except WorkspaceReleaseError as exc:
            return self._orphan(
                workspace,
                run,
                WorkspaceReasonCode.WORKTREE_UNMANAGED,
                str(exc),
            )
        except WorktreeOperationError:
            return self._orphan(
                workspace,
                run,
                WorkspaceReasonCode.WORKTREE_UNMANAGED,
                "The Worktree could not be inspected, so it was retained rather than removed.",
            )

        if summary.is_dirty:
            return self._retain(
                workspace,
                run,
                WorkspaceReasonCode.DIRTY_WORKTREE,
                "The Worktree holds changes that have not been recorded, so it was "
                "retained rather than discarded.",
            )

        if not self._worktrees.remove_worktree(
            workspace.path_ref,
            git_branch=workspace.git_branch,
        ):
            return self._orphan(
                workspace,
                run,
                WorkspaceReasonCode.CLEANUP_FAILED,
                "The Worktree could not be removed safely, so it was retained.",
            )

        now = utc_now(self._clock)
        released = replace(
            workspace,
            status=WorkspaceStatus.RELEASED,
            owner_agent_run_id=None,
            released_at=now,
            reason_code=None,
            reason_summary=None,
            updated_at=now,
        )
        self._repository.update(released)
        self._emit(run, EventType.WORKSPACE_RELEASED, released)
        self._audit_workspace(
            released,
            AuditAction.WORKSPACE_RELEASED,
            actor_type=AuditActorType.SYSTEM,
        )

        if released.git_branch is not None:
            self._audit_workspace(
                released,
                AuditAction.WORKSPACE_BRANCH_DELETED,
                actor_type=AuditActorType.SYSTEM,
                safe_metadata=(("branch", released.git_branch),),
            )
        return released

    def _retain(
        self,
        workspace: Workspace,
        run: Run,
        reason_code: WorkspaceReasonCode,
        reason_summary: str,
    ) -> Workspace:
        target = (
            WorkspaceStatus.READY
            if workspace.status is WorkspaceStatus.RELEASING
            else workspace.status
        )
        if target is not workspace.status:
            ensure_workspace_transition_allowed(workspace.status, target)

        retained = replace(
            workspace,
            status=target,
            reason_code=reason_code,
            reason_summary=reason_summary,
            updated_at=utc_now(self._clock),
        )
        self._repository.update(retained)
        self._emit(run, EventType.WORKSPACE_CHANGED, retained)
        return retained

    def _orphan(
        self,
        workspace: Workspace,
        run: Run,
        reason_code: WorkspaceReasonCode,
        reason_summary: str,
    ) -> Workspace:
        if workspace.status is not WorkspaceStatus.ORPHANED:
            ensure_workspace_transition_allowed(workspace.status, WorkspaceStatus.ORPHANED)
        orphaned = replace(
            workspace,
            status=WorkspaceStatus.ORPHANED,
            reason_code=reason_code,
            reason_summary=reason_summary,
            updated_at=utc_now(self._clock),
        )
        self._repository.update(orphaned)
        self._emit(run, EventType.WORKSPACE_ORPHANED, orphaned)
        return orphaned

    def reconcile(self, workspace_id: WorkspaceId) -> Workspace:
        workspace = self.get(workspace_id)
        run = self._runs.get_run(workspace.run_id)
        self._audit_workspace(
            workspace,
            AuditAction.WORKSPACE_RECONCILIATION_REQUESTED,
            actor_type=AuditActorType.USER,
        )

        if workspace.status is WorkspaceStatus.RELEASED:
            return workspace

        project = self._projects.get_project(workspace.project_id)
        observed = self._worktrees.verify_worktree(
            workspace.path_ref,
            project.repository_identity,
        )

        if observed is WorkspaceReconciliationOutcome.MISSING:
            reconciled = self._mark_unresolved(
                workspace,
                WorkspaceReasonCode.WORKTREE_MISSING,
                "The Worktree no longer exists; it was not recreated.",
            )
        elif observed is WorkspaceReconciliationOutcome.CONFLICT:
            reconciled = self._mark_unresolved(
                workspace,
                WorkspaceReasonCode.REPOSITORY_IDENTITY_MISMATCH,
                "The Worktree resolves to a different repository than its Project.",
            )
        elif observed is WorkspaceReconciliationOutcome.ORPHANED:
            reconciled = self._mark_unresolved(
                workspace,
                WorkspaceReasonCode.WORKTREE_UNMANAGED,
                "The location exists but Git no longer recognises it as a worktree.",
            )
        elif workspace.status is WorkspaceStatus.ALLOCATING:
            reconciled = self._mark_unresolved(
                workspace,
                WorkspaceReasonCode.RECONCILIATION_REQUIRED,
                "Allocation did not complete; explicit operator action is required.",
            )
        else:
            reconciled = self._clear_reason(workspace)

        self._emit(run, EventType.WORKSPACE_CHANGED, reconciled)
        return reconciled

    def _mark_unresolved(
        self,
        workspace: Workspace,
        reason_code: WorkspaceReasonCode,
        reason_summary: str,
    ) -> Workspace:
        target_status = workspace.status
        if not _is_terminal(workspace.status):
            target_status = WorkspaceStatus.ORPHANED
        if target_status is not workspace.status:
            ensure_workspace_transition_allowed(workspace.status, target_status)

        reconciled = replace(
            workspace,
            status=target_status,
            reason_code=reason_code,
            reason_summary=reason_summary,
            updated_at=utc_now(self._clock),
        )
        self._repository.update(reconciled)
        return reconciled

    def _clear_reason(self, workspace: Workspace) -> Workspace:
        if workspace.reason_code is None and workspace.reason_summary is None:
            return workspace
        cleared = replace(
            workspace,
            reason_code=None,
            reason_summary=None,
            updated_at=utc_now(self._clock),
        )
        self._repository.update(cleared)
        return cleared

    def _emit(
        self,
        run: Run,
        event_type: EventType,
        workspace: Workspace,
        *,
        extra: tuple[tuple[str, str | int | bool | None], ...] = (),
    ) -> None:
        payload: tuple[tuple[str, str | int | bool | None], ...] = (
            ("workspace_id", str(workspace.id)),
            ("workspace_kind", workspace.kind.value),
            ("access_mode", workspace.access_mode.value),
            ("status", workspace.status.value),
        )
        if workspace.base_revision is not None:
            payload = payload + (("base_revision", workspace.base_revision),)
        if workspace.reason_code is not None:
            payload = payload + (("reason_code", workspace.reason_code.value),)

        self._events.emit(
            run,
            event_type,
            source=EventSource.WORKSPACE,
            payload=payload + extra,
        )

    def _audit_workspace(
        self,
        workspace: Workspace,
        action: AuditAction,
        *,
        actor_type: AuditActorType,
        safe_metadata: SafeMetadata = (),
    ) -> None:
        self._audit.record_workspace_intervention(
            workspace,
            action,
            actor_type=actor_type,
            target_type=AuditTargetType.WORKSPACE,
            safe_metadata=safe_metadata,
        )


def _is_terminal(status: WorkspaceStatus) -> bool:
    return status in {WorkspaceStatus.RELEASED, WorkspaceStatus.FAILED}
