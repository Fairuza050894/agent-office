"""Safe HTTP DTOs for workflow management."""

from __future__ import annotations

from datetime import datetime
from typing import Self

from pydantic import BaseModel, Field

from agent_office.domain import (
    AgentAccessMode,
    AgentAssignment,
    StageCondition,
    StageDefinition,
    StageExecutionMode,
    StageKey,
    VerificationCheckDefinition,
    VerificationCheckType,
    WorkflowDefinition,
    WorkflowDefinitionStatus,
    WorkflowGraph,
    WorkflowValidationCode,
    WorkflowValidationIssue,
    WorkflowValidationReport,
)


class StageAssignmentRequest(BaseModel):
    """One agent assignment inside a workflow stage."""

    profile_key: str = Field(min_length=1, max_length=100)
    access_mode: AgentAccessMode = AgentAccessMode.READ_ONLY
    required: bool = True


class StageRequest(BaseModel):
    """One stage node of a submitted workflow graph."""

    key: StageKey
    name: str = Field(min_length=1, max_length=200)
    order_hint: int = Field(ge=0, le=1000)
    assignments: list[StageAssignmentRequest] = Field(min_length=1, max_length=20)
    depends_on: list[StageKey] = Field(default_factory=list, max_length=20)
    execution_mode: StageExecutionMode = StageExecutionMode.SEQUENTIAL
    required: bool = True
    condition: StageCondition = StageCondition.ALWAYS


class VerificationCheckRequest(BaseModel):
    """One verification check a WorkflowDefinition declares.

    A check is a fixed executable plus fixed arguments. There is no shell, no
    free-form command string, and no environment map: an operator cannot turn a
    declaration into arbitrary execution.
    """

    key: str = Field(min_length=1, max_length=100)
    check_type: VerificationCheckType = VerificationCheckType.TEST
    executable: str = Field(min_length=1, max_length=200)
    arguments: list[str] = Field(default_factory=list, max_length=64)
    timeout_seconds: int | None = None
    environment_names: list[str] = Field(default_factory=list, max_length=16)
    required: bool = True


class CreateWorkflowRequest(BaseModel):
    """Request to create a reusable WorkflowDefinition."""

    key: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    status: WorkflowDefinitionStatus = WorkflowDefinitionStatus.ACTIVE
    stages: list[StageRequest] = Field(min_length=1, max_length=50)
    verification_checks: list[VerificationCheckRequest] = Field(
        default_factory=list,
        max_length=50,
    )


class UpdateWorkflowRequest(BaseModel):
    """Request to edit a WorkflowDefinition into a new revision."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    status: WorkflowDefinitionStatus | None = None
    stages: list[StageRequest] = Field(min_length=1, max_length=50)
    verification_checks: list[VerificationCheckRequest] | None = Field(
        default=None,
        max_length=50,
    )


class StageAssignmentResponse(BaseModel):
    """Safe agent assignment representation."""

    profile_key: str
    access_mode: AgentAccessMode
    required: bool

    @classmethod
    def from_domain(cls, assignment: AgentAssignment) -> Self:
        return cls(
            profile_key=assignment.profile_key,
            access_mode=assignment.access_mode,
            required=assignment.required,
        )


class StageResponse(BaseModel):
    """Safe workflow stage representation."""

    key: StageKey
    name: str
    order_hint: int
    execution_mode: StageExecutionMode
    required: bool
    condition: StageCondition
    depends_on: list[StageKey]
    assignments: list[StageAssignmentResponse]

    @classmethod
    def from_domain(cls, stage: StageDefinition) -> Self:
        return cls(
            key=stage.key,
            name=stage.name,
            order_hint=stage.order_hint,
            execution_mode=stage.execution_mode,
            required=stage.required,
            condition=stage.condition,
            depends_on=list(stage.depends_on),
            assignments=[
                StageAssignmentResponse.from_domain(assignment) for assignment in stage.assignments
            ],
        )


class WorkflowResponse(BaseModel):
    """Public WorkflowDefinition representation without internal details."""

    id: str
    key: str
    name: str
    description: str
    version: int
    status: WorkflowDefinitionStatus
    schema_version: int
    stages: list[StageResponse]
    verification_checks: list[VerificationCheckResponse]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_domain(cls, definition: WorkflowDefinition) -> Self:
        return cls(
            id=str(definition.id),
            key=definition.key,
            name=definition.name,
            description=definition.description,
            version=definition.version,
            status=definition.status,
            schema_version=definition.graph.schema_version,
            stages=[
                StageResponse.from_domain(stage) for stage in definition.graph.ordered_stages()
            ],
            verification_checks=[
                VerificationCheckResponse.from_domain(check)
                for check in definition.graph.verification_checks
            ],
            created_at=definition.created_at,
            updated_at=definition.updated_at,
        )


class WorkflowValidationIssueResponse(BaseModel):
    """One workflow validation issue."""

    code: WorkflowValidationCode
    message: str
    stage_key: StageKey | None

    @classmethod
    def from_domain(cls, issue: WorkflowValidationIssue) -> Self:
        return cls(
            code=issue.code,
            message=issue.message,
            stage_key=issue.stage_key,
        )


class WorkflowValidationResponse(BaseModel):
    """Result of validating a WorkflowDefinition."""

    valid: bool
    schema_version: int
    stage_count: int
    stage_keys: list[StageKey]
    issues: list[WorkflowValidationIssueResponse]

    @classmethod
    def from_report(
        cls,
        definition: WorkflowDefinition,
        report: WorkflowValidationReport,
    ) -> Self:
        ordered = definition.graph.ordered_stages()

        return cls(
            valid=report.valid,
            schema_version=definition.graph.schema_version,
            stage_count=len(ordered),
            stage_keys=[stage.key for stage in ordered],
            issues=[WorkflowValidationIssueResponse.from_domain(issue) for issue in report.issues],
        )


class VerificationCheckResponse(BaseModel):
    """Safe verification check representation."""

    key: str
    check_type: VerificationCheckType
    executable: str
    arguments: list[str]
    timeout_seconds: int
    environment_names: list[str]
    required: bool

    @classmethod
    def from_domain(cls, check: VerificationCheckDefinition) -> Self:
        return cls(
            key=check.key,
            check_type=check.check_type,
            executable=check.executable,
            arguments=list(check.arguments),
            timeout_seconds=check.timeout_seconds,
            environment_names=list(check.environment_names),
            required=check.required,
        )


def graph_from_stages(
    stages: list[StageRequest],
    verification_checks: list[VerificationCheckRequest] | None = None,
) -> WorkflowGraph:
    """Build a validated workflow graph from request stages.

    Domain validation raises ``DomainInvariantError`` for unknown dependencies,
    duplicate stage keys, or cyclic graphs, which the API maps to a controlled
    422 response.
    """

    return WorkflowGraph(
        stages=tuple(
            StageDefinition(
                key=stage.key,
                name=stage.name,
                order_hint=stage.order_hint,
                assignments=tuple(
                    AgentAssignment(
                        profile_key=assignment.profile_key,
                        access_mode=assignment.access_mode,
                        required=assignment.required,
                    )
                    for assignment in stage.assignments
                ),
                depends_on=tuple(stage.depends_on),
                execution_mode=stage.execution_mode,
                required=stage.required,
                condition=stage.condition,
            )
            for stage in stages
        ),
        verification_checks=tuple(
            VerificationCheckDefinition(
                key=check.key,
                check_type=check.check_type,
                executable=check.executable,
                arguments=tuple(check.arguments),
                **(
                    {"timeout_seconds": check.timeout_seconds}
                    if check.timeout_seconds is not None
                    else {}
                ),
                environment_names=tuple(check.environment_names),
                required=check.required,
            )
            for check in verification_checks or []
        ),
    )
