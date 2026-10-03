from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

import pytest

from agent_office.application.results import (
    ManagedDeliveryReceipt,
    ResultAlreadyDecidedError,
    ResultReviewService,
    ResultReviewState,
)
from agent_office.domain import (
    AgentAccessMode,
    AuditAction,
    ProjectId,
    Run,
    RunId,
    RunStatus,
    TaskId,
    Workspace,
    WorkspaceId,
    WorkspaceKind,
    WorkspaceStatus,
)

NOW = datetime(2026, 10, 3, 4, 0, tzinfo=UTC)
PROJECT_ID = ProjectId(UUID("11111111-1111-4111-8111-111111111111"))
TASK_ID = TaskId(UUID("22222222-2222-4222-8222-222222222222"))
RUN_ID = RunId(UUID("33333333-3333-4333-8333-333333333333"))
WORKSPACE_ID = WorkspaceId(UUID("44444444-4444-4444-8444-444444444444"))


def completed_run() -> Run:
    return Run(
        id=RUN_ID,
        project_id=PROJECT_ID,
        task_id=TASK_ID,
        status=RunStatus.COMPLETED,
        requested_executor_id=None,
        created_at=NOW,
        updated_at=NOW,
        completed_at=NOW,
        candidate_workspace_id=WORKSPACE_ID,
    )


def candidate_workspace() -> Workspace:
    return Workspace(
        id=WORKSPACE_ID,
        project_id=PROJECT_ID,
        run_id=RUN_ID,
        owner_agent_run_id=None,
        kind=WorkspaceKind.INTEGRATION_WORKTREE,
        access_mode=AgentAccessMode.WRITE,
        status=WorkspaceStatus.READY,
        path_ref=f"{PROJECT_ID}/{RUN_ID}/{WORKSPACE_ID}",
        base_revision="abc123",
        git_branch=f"agent-office/{RUN_ID}/integration-{str(WORKSPACE_ID)[:8]}",
        reason_code=None,
        reason_summary=None,
        created_at=NOW,
        updated_at=NOW,
        released_at=None,
    )


@dataclass
class AuditStub:
    action: AuditAction
    safe_metadata: tuple[tuple[str, str], ...]
    occurred_at: datetime


class FakeAudit:
    def __init__(self) -> None:
        self.records: dict[RunId, list[AuditStub]] = {}
        self.counter = 0

    def list_for_run(self, run_id: RunId) -> tuple[AuditStub, ...]:
        return tuple(self.records.get(run_id, []))

    def record_run_intervention(
        self,
        run: Run,
        action: AuditAction,
        **kwargs: object,
    ) -> AuditStub:
        metadata = kwargs.get("safe_metadata", ())
        assert isinstance(metadata, tuple)
        self.counter += 1
        occurred_at = datetime(2026, 10, 3, 4, self.counter, tzinfo=UTC)
        record = AuditStub(
            action=action,
            safe_metadata=metadata,
            occurred_at=occurred_at,
        )
        self.records.setdefault(run.id, []).append(record)
        return record


class FakeRuns:
    def __init__(self, run: Run) -> None:
        self.run = run
        self.created: list[Run] = []

    def get_run(self, run_id: RunId) -> Run:
        assert run_id == self.run.id
        return self.run

    def create_run(self, *, task_id: TaskId, requested_executor_id=None) -> Run:
        remediation = Run(
            id=RunId(UUID("55555555-5555-4555-8555-555555555555")),
            project_id=PROJECT_ID,
            task_id=task_id,
            status=RunStatus.CREATED,
            requested_executor_id=requested_executor_id,
            created_at=NOW,
            updated_at=NOW,
        )
        self.created.append(remediation)
        return remediation


class FakeTasks:
    def __init__(self) -> None:
        self.feedback: list[tuple[TaskId, RunId, str]] = []

    def append_result_review_feedback(
        self,
        task_id: TaskId,
        *,
        source_run_id: RunId,
        feedback: str,
    ) -> None:
        self.feedback.append((task_id, source_run_id, feedback))


class FakeWorkspaces:
    def __init__(self, workspace: Workspace) -> None:
        self.workspace = workspace

    def get(self, workspace_id: WorkspaceId) -> Workspace:
        assert workspace_id == self.workspace.id
        return self.workspace


class FakeDelivery:
    def __init__(self) -> None:
        self.calls: list[tuple[Workspace, str, str]] = []

    def deliver(
        self,
        workspace: Workspace,
        *,
        accepted_branch: str,
        commit_message: str,
    ) -> ManagedDeliveryReceipt:
        self.calls.append((workspace, accepted_branch, commit_message))
        return ManagedDeliveryReceipt(
            branch=accepted_branch,
            commit="0123456789abcdef0123456789abcdef01234567",
        )


def service():
    run = completed_run()
    audit = FakeAudit()
    runs = FakeRuns(run)
    tasks = FakeTasks()
    delivery = FakeDelivery()
    result = ResultReviewService(
        run_service=runs,  # type: ignore[arg-type]
        task_service=tasks,  # type: ignore[arg-type]
        workspace_service=FakeWorkspaces(candidate_workspace()),  # type: ignore[arg-type]
        audit_service=audit,  # type: ignore[arg-type]
        delivery=delivery,
    )
    return result, runs, tasks, audit, delivery


def test_completed_run_is_only_awaiting_human_review() -> None:
    result, *_ = service()

    projection = result.get(RUN_ID)

    assert projection.state is ResultReviewState.AWAITING_REVIEW
    assert projection.delivered_branch is None
    assert projection.delivered_commit is None
    assert projection.changes_requested_at is None
    assert projection.approved_at is None
    assert projection.delivered_at is None


def test_request_changes_preserves_task_and_creates_new_run() -> None:
    result, runs, tasks, audit, _ = service()

    projection = result.request_changes(RUN_ID, feedback="Cover the missing capacity criterion.")

    assert projection.state is ResultReviewState.CHANGES_REQUESTED
    assert projection.remediation_run_id == str(runs.created[0].id)
    assert projection.changes_requested_at == audit.records[RUN_ID][0].occurred_at
    assert projection.approved_at is None
    assert projection.delivered_at is None
    assert tasks.feedback == [
        (TASK_ID, RUN_ID, "Cover the missing capacity criterion."),
    ]
    assert [record.action for record in audit.records[RUN_ID]] == [
        AuditAction.RESULT_CHANGES_REQUESTED
    ]
    assert audit.records[runs.created[0].id][0].action is AuditAction.RESULT_REMEDIATION_CREATED

    with pytest.raises(ResultAlreadyDecidedError):
        result.approve_and_deliver(RUN_ID)


def test_approve_and_deliver_records_human_gate_and_managed_branch() -> None:
    result, _, _, audit, delivery = service()

    projection = result.approve_and_deliver(RUN_ID, note="Reviewed against evidence.")

    assert projection.state is ResultReviewState.DELIVERED
    assert projection.delivered_branch is not None
    assert projection.delivered_branch.startswith(f"agent-office/{RUN_ID}/accepted-")
    assert projection.delivered_commit == "0123456789abcdef0123456789abcdef01234567"
    assert projection.approved_at == audit.records[RUN_ID][0].occurred_at
    assert projection.delivered_at == audit.records[RUN_ID][1].occurred_at
    assert projection.approved_at < projection.delivered_at
    assert [record.action for record in audit.records[RUN_ID]] == [
        AuditAction.RESULT_APPROVED,
        AuditAction.RESULT_DELIVERED,
    ]
    assert len(delivery.calls) == 1

    repeated = result.approve_and_deliver(RUN_ID)
    assert repeated.state is ResultReviewState.DELIVERED
    assert repeated.approved_at == projection.approved_at
    assert repeated.delivered_at == projection.delivered_at
    assert len(delivery.calls) == 1
