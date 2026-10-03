"""Human result review and managed delivery application service.

Run ``COMPLETED`` remains a technical fact. This service adds the separate
business decision that a human accepted that result, requested changes, or
approved local delivery. Every decision is projected from append-only
AuditRecords so historical databases need no destructive migration.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from agent_office.application.audit import AuditService
from agent_office.application.results.errors import (
    ResultAlreadyDecidedError,
    ResultDeliveryError,
    ResultNotReviewableError,
)
from agent_office.application.results.ports import ManagedResultDelivery
from agent_office.application.runs import RunService
from agent_office.application.tasks import TaskService
from agent_office.application.workspaces import WorkspaceNotFoundError, WorkspaceService
from agent_office.domain import (
    WORKTREE_KINDS,
    AuditAction,
    AuditActorType,
    AuditTargetType,
    DomainInvariantError,
    Run,
    RunId,
    RunStatus,
    Workspace,
    WorkspaceStatus,
    validate_branch_name,
)

MAX_RESULT_NOTE_LENGTH = 1000


class ResultReviewState(StrEnum):
    NOT_READY = "NOT_READY"
    AWAITING_REVIEW = "AWAITING_REVIEW"
    CHANGES_REQUESTED = "CHANGES_REQUESTED"
    APPROVED = "APPROVED"
    DELIVERED = "DELIVERED"


@dataclass(frozen=True, slots=True)
class ResultReviewProjection:
    run_id: str
    task_id: str
    state: ResultReviewState
    candidate_workspace_id: str | None
    feedback: str | None = None
    remediation_run_id: str | None = None
    delivered_branch: str | None = None
    delivered_commit: str | None = None
    changes_requested_at: datetime | None = None
    approved_at: datetime | None = None
    delivered_at: datetime | None = None

    @property
    def can_approve(self) -> bool:
        return self.state in {ResultReviewState.AWAITING_REVIEW, ResultReviewState.APPROVED}

    @property
    def can_request_changes(self) -> bool:
        return self.state is ResultReviewState.AWAITING_REVIEW


class ResultReviewService:
    """Close the value loop after technical Run completion."""

    def __init__(
        self,
        *,
        run_service: RunService,
        task_service: TaskService,
        workspace_service: WorkspaceService,
        audit_service: AuditService,
        delivery: ManagedResultDelivery,
    ) -> None:
        self._runs = run_service
        self._tasks = task_service
        self._workspaces = workspace_service
        self._audit = audit_service
        self._delivery = delivery

    def get(self, run_id: RunId) -> ResultReviewProjection:
        run = self._runs.get_run(run_id)
        return self._projection(run)

    def request_changes(self, run_id: RunId, *, feedback: str) -> ResultReviewProjection:
        run = self._runs.get_run(run_id)
        current = self._projection(run)

        if current.state is ResultReviewState.CHANGES_REQUESTED:
            return current
        if current.state in {ResultReviewState.APPROVED, ResultReviewState.DELIVERED}:
            raise ResultAlreadyDecidedError(
                "An approved or delivered result cannot be changed by a later review request."
            )
        self._require_reviewable(run)

        normalized = " ".join(feedback.split()).strip()
        if not normalized:
            raise DomainInvariantError("Result review feedback must not be empty")

        self._tasks.append_result_review_feedback(
            run.task_id,
            source_run_id=run.id,
            feedback=normalized,
        )
        remediation = self._runs.create_run(
            task_id=run.task_id,
            requested_executor_id=run.resolved_executor_id or run.requested_executor_id,
        )

        self._audit.record_run_intervention(
            run,
            AuditAction.RESULT_CHANGES_REQUESTED,
            actor_type=AuditActorType.USER,
            target_type=AuditTargetType.RUN,
            safe_metadata=(
                ("feedback", normalized),
                ("remediation_run_id", str(remediation.id)),
            ),
        )
        self._audit.record_run_intervention(
            remediation,
            AuditAction.RESULT_REMEDIATION_CREATED,
            actor_type=AuditActorType.SYSTEM,
            target_type=AuditTargetType.RUN,
            safe_metadata=(
                ("source_run_id", str(run.id)),
                ("feedback", normalized),
            ),
        )
        return self._projection(run)

    def approve_and_deliver(
        self,
        run_id: RunId,
        *,
        note: str | None = None,
    ) -> ResultReviewProjection:
        run = self._runs.get_run(run_id)
        current = self._projection(run)

        if current.state is ResultReviewState.DELIVERED:
            return current
        if current.state is ResultReviewState.CHANGES_REQUESTED:
            raise ResultAlreadyDecidedError(
                "This result already has requested changes; review the remediation Run instead."
            )
        self._require_reviewable(run)
        candidate = self._candidate(run)

        normalized_note = None
        if note is not None:
            normalized_note = " ".join(note.split()).strip() or None
            if normalized_note is not None and len(normalized_note) > MAX_RESULT_NOTE_LENGTH:
                raise DomainInvariantError("Result approval note is too long")

        if current.state is ResultReviewState.AWAITING_REVIEW:
            metadata = () if normalized_note is None else (("note", normalized_note),)
            self._audit.record_run_intervention(
                run,
                AuditAction.RESULT_APPROVED,
                actor_type=AuditActorType.USER,
                target_type=AuditTargetType.RUN,
                safe_metadata=metadata,
            )

        accepted_branch = validate_branch_name(
            f"agent-office/{run.id}/accepted-{str(candidate.id)[:8]}"
        )
        try:
            receipt = self._delivery.deliver(
                candidate,
                accepted_branch=accepted_branch,
                commit_message=f"Agent Office accepted result for Task {run.task_id}",
            )
        except ResultDeliveryError:
            raise
        except Exception as exc:  # defensive adapter boundary
            raise ResultDeliveryError("Accepted result could not be delivered safely") from exc

        self._audit.record_run_intervention(
            run,
            AuditAction.RESULT_DELIVERED,
            actor_type=AuditActorType.SYSTEM,
            target_type=AuditTargetType.RUN,
            safe_metadata=(
                ("workspace_id", str(candidate.id)),
                ("branch", receipt.branch),
                ("commit", receipt.commit),
            ),
        )
        return self._projection(run)

    def _projection(self, run: Run) -> ResultReviewProjection:
        records = self._audit.list_for_run(run.id)
        approved = None
        changed = None
        delivered = None

        for record in records:
            if record.action is AuditAction.RESULT_APPROVED:
                approved = record
            elif record.action is AuditAction.RESULT_CHANGES_REQUESTED:
                changed = record
            elif record.action is AuditAction.RESULT_DELIVERED:
                delivered = record

        run_id = str(run.id)
        task_id = str(run.task_id)
        candidate_workspace_id = (
            None if run.candidate_workspace_id is None else str(run.candidate_workspace_id)
        )
        changes_requested_at = None if changed is None else changed.occurred_at
        approved_at = None if approved is None else approved.occurred_at
        delivered_at = None if delivered is None else delivered.occurred_at

        if delivered is not None:
            metadata = dict(delivered.safe_metadata)
            return ResultReviewProjection(
                run_id=run_id,
                task_id=task_id,
                candidate_workspace_id=candidate_workspace_id,
                changes_requested_at=changes_requested_at,
                approved_at=approved_at,
                delivered_at=delivered_at,
                state=ResultReviewState.DELIVERED,
                delivered_branch=metadata.get("branch"),
                delivered_commit=metadata.get("commit"),
            )

        if changed is not None:
            metadata = dict(changed.safe_metadata)
            return ResultReviewProjection(
                run_id=run_id,
                task_id=task_id,
                candidate_workspace_id=candidate_workspace_id,
                changes_requested_at=changes_requested_at,
                approved_at=approved_at,
                delivered_at=delivered_at,
                state=ResultReviewState.CHANGES_REQUESTED,
                feedback=metadata.get("feedback"),
                remediation_run_id=metadata.get("remediation_run_id"),
            )

        if approved is not None:
            return ResultReviewProjection(
                run_id=run_id,
                task_id=task_id,
                candidate_workspace_id=candidate_workspace_id,
                changes_requested_at=changes_requested_at,
                approved_at=approved_at,
                delivered_at=delivered_at,
                state=ResultReviewState.APPROVED,
            )

        state = (
            ResultReviewState.AWAITING_REVIEW
            if run.status is RunStatus.COMPLETED
            else ResultReviewState.NOT_READY
        )
        return ResultReviewProjection(
            run_id=run_id,
            task_id=task_id,
            candidate_workspace_id=candidate_workspace_id,
            changes_requested_at=changes_requested_at,
            approved_at=approved_at,
            delivered_at=delivered_at,
            state=state,
        )

    def _require_reviewable(self, run: Run) -> None:
        if run.status is not RunStatus.COMPLETED:
            raise ResultNotReviewableError(
                f"Run {run.id} is {run.status.value}; "
                "only a technically COMPLETED Run can be reviewed."
            )
        if run.candidate_workspace_id is None:
            raise ResultNotReviewableError(
                "The completed Run has no verified candidate Workspace to review."
            )

    def _candidate(self, run: Run) -> Workspace:
        self._require_reviewable(run)
        assert run.candidate_workspace_id is not None
        try:
            candidate = self._workspaces.get(run.candidate_workspace_id)
        except WorkspaceNotFoundError as exc:
            raise ResultNotReviewableError(
                "The Run's candidate Workspace is no longer available."
            ) from exc

        if candidate.kind not in WORKTREE_KINDS:
            raise ResultNotReviewableError("The candidate is not a managed Git worktree.")
        if candidate.status is not WorkspaceStatus.READY:
            raise ResultNotReviewableError(
                f"The candidate Workspace is {candidate.status.value}, not READY for delivery."
            )
        if candidate.git_branch is None:
            raise ResultNotReviewableError("The candidate Workspace has no managed Git branch.")
        return candidate
