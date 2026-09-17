"""Safe HTTP DTOs for Run management and orchestration inspection."""

from __future__ import annotations

from datetime import datetime
from typing import Self

from pydantic import BaseModel, Field

from agent_office.api.workflow_models import StageResponse
from agent_office.domain import (
    AgentAccessMode,
    AgentRun,
    AgentRunReasonCode,
    AgentRunStatus,
    ChangeArea,
    ExecutionOutcome,
    FrozenAgentAssignment,
    ReviewVerdict,
    Run,
    RunReasonCode,
    RunStageState,
    RunStageStatus,
    RunStatus,
    StageCondition,
    StageExecutionMode,
    StageKey,
    StageReasonCode,
    WorkflowSnapshot,
)


class CreateRunRequest(BaseModel):
    """Request to create a new Run from a Task."""

    requested_executor_id: str | None = None


class StartRunRequest(BaseModel):
    """Request to start orchestration for an existing Run."""

    changed_areas: list[ChangeArea] | None = Field(default=None, max_length=10)


class RunResponse(BaseModel):
    """Public Run representation — no filesystem or internal details."""

    id: str
    project_id: str
    task_id: str
    status: RunStatus
    requested_executor_id: str | None
    resolved_executor_id: str | None
    workflow_snapshot_id: str | None
    changed_areas: list[ChangeArea] | None
    failure_code: RunReasonCode | None
    failure_summary: str | None
    started_at: datetime | None
    completed_at: datetime | None
    cancel_requested_at: datetime | None
    remediation_cycles_used: int
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_domain(cls, run: Run) -> Self:
        return cls(
            id=str(run.id),
            project_id=str(run.project_id),
            task_id=str(run.task_id),
            status=run.status,
            requested_executor_id=(
                None if run.requested_executor_id is None else str(run.requested_executor_id)
            ),
            resolved_executor_id=(
                None if run.resolved_executor_id is None else str(run.resolved_executor_id)
            ),
            workflow_snapshot_id=(
                None if run.workflow_snapshot_id is None else str(run.workflow_snapshot_id)
            ),
            changed_areas=None if run.changed_areas is None else list(run.changed_areas),
            failure_code=run.failure_code,
            failure_summary=run.failure_summary,
            started_at=run.started_at,
            completed_at=run.completed_at,
            cancel_requested_at=run.cancel_requested_at,
            remediation_cycles_used=run.remediation_cycles_used,
            created_at=run.created_at,
            updated_at=run.updated_at,
        )


class ResumeRunRequest(BaseModel):
    """Request to resume a BLOCKED Run.

    ``executor_id`` is optional and only used when the previously resolved
    Executor proved unusable. Supplying an unregistered Executor is rejected;
    the Run is never silently redirected to a different one.

    ``changed_areas`` is only used when the Run was blocked before it was ever
    planned, and supplies the same bounded factual input that start accepts.
    """

    executor_id: str | None = None
    changed_areas: list[ChangeArea] | None = Field(default=None, max_length=10)


class CompletionGateResponse(BaseModel):
    """Current completion-gate state of a Run."""

    status: RunStatus
    complete: bool
    failures: list[str]


class RunStageResponse(BaseModel):
    """Durable stage runtime state of a Run."""

    stage_key: StageKey
    status: RunStageStatus
    required: bool
    order_hint: int
    execution_mode: StageExecutionMode
    condition: StageCondition
    reason_code: StageReasonCode | None
    reason_summary: str | None
    started_at: datetime | None
    completed_at: datetime | None

    @classmethod
    def from_domain(cls, stage: RunStageState) -> Self:
        return cls(
            stage_key=stage.stage_key,
            status=stage.status,
            required=stage.required,
            order_hint=stage.order_hint,
            execution_mode=stage.execution_mode,
            condition=stage.condition,
            reason_code=stage.reason_code,
            reason_summary=stage.reason_summary,
            started_at=stage.started_at,
            completed_at=stage.completed_at,
        )


class AgentRunResponse(BaseModel):
    """Public AgentRun representation.

    The opaque executor session reference and the capability snapshot are
    intentionally not exposed. Executor identity is a stable Agent Office id.
    """

    id: str
    run_id: str
    project_id: str
    stage_key: StageKey
    agent_profile_key: str
    agent_profile_version: int
    executor_id: str
    access_mode: AgentAccessMode
    status: AgentRunStatus
    attempt: int
    retry_of_agent_run_id: str | None
    remediation_cycle: int
    review_verdict: ReviewVerdict | None
    workspace_id: str | None
    result_outcome: ExecutionOutcome | None
    result_summary: str | None
    reason_code: AgentRunReasonCode | None
    reason_summary: str | None
    failure_retryable: bool | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_domain(cls, agent_run: AgentRun) -> Self:
        return cls(
            id=str(agent_run.id),
            run_id=str(agent_run.run_id),
            project_id=str(agent_run.project_id),
            stage_key=agent_run.stage_key,
            agent_profile_key=agent_run.agent_profile_key,
            agent_profile_version=agent_run.agent_profile_version,
            executor_id=str(agent_run.executor_id),
            access_mode=agent_run.access_mode,
            status=agent_run.status,
            attempt=agent_run.attempt,
            retry_of_agent_run_id=(
                None
                if agent_run.retry_of_agent_run_id is None
                else str(agent_run.retry_of_agent_run_id)
            ),
            remediation_cycle=agent_run.remediation_cycle,
            review_verdict=agent_run.review_verdict,
            workspace_id=(None if agent_run.workspace_id is None else str(agent_run.workspace_id)),
            result_outcome=agent_run.result_outcome,
            result_summary=agent_run.result_summary,
            reason_code=agent_run.reason_code,
            reason_summary=agent_run.reason_summary,
            failure_retryable=agent_run.failure_retryable,
            started_at=agent_run.started_at,
            completed_at=agent_run.completed_at,
            created_at=agent_run.created_at,
            updated_at=agent_run.updated_at,
        )


class FrozenAgentAssignmentResponse(BaseModel):
    """Frozen agent-assignment authority captured in a snapshot."""

    stage_key: StageKey
    profile_id: str
    profile_key: str
    profile_name: str
    profile_version: int
    access_mode: AgentAccessMode
    required: bool

    @classmethod
    def from_domain(cls, assignment: FrozenAgentAssignment) -> Self:
        return cls(
            stage_key=assignment.stage_key,
            profile_id=str(assignment.profile_id),
            profile_key=assignment.profile_key,
            profile_name=assignment.profile_name,
            profile_version=assignment.profile_version,
            access_mode=assignment.access_mode,
            required=assignment.required,
        )


class WorkflowSnapshotResponse(BaseModel):
    """Immutable workflow frozen for one Run."""

    id: str
    run_id: str
    project_id: str
    source_workflow_id: str | None
    source_workflow_key: str
    source_workflow_version: int
    schema_version: int
    stages: list[StageResponse]
    agent_assignments: list[FrozenAgentAssignmentResponse]
    created_at: datetime

    @classmethod
    def from_domain(cls, snapshot: WorkflowSnapshot) -> Self:
        return cls(
            id=str(snapshot.id),
            run_id=str(snapshot.run_id),
            project_id=str(snapshot.project_id),
            source_workflow_id=(
                None if snapshot.source_workflow_id is None else str(snapshot.source_workflow_id)
            ),
            source_workflow_key=snapshot.source_workflow_key,
            source_workflow_version=snapshot.source_workflow_version,
            schema_version=snapshot.graph.schema_version,
            stages=[StageResponse.from_domain(stage) for stage in snapshot.graph.ordered_stages()],
            agent_assignments=[
                FrozenAgentAssignmentResponse.from_domain(assignment)
                for assignment in snapshot.agent_assignments
            ],
            created_at=snapshot.created_at,
        )
