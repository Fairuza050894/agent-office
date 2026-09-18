"""Safe HTTP DTOs for Findings, Evidence, and verification state.

No DTO carries an absolute filesystem path, raw command output, a provider
payload, or a secret. Finding descriptions are reviewer-authored bounded text;
Evidence metadata is already bounded and redacted before persistence.
"""

from __future__ import annotations

from datetime import datetime
from typing import Self

from pydantic import BaseModel, Field

from agent_office.domain import (
    CommandStatus,
    Evidence,
    EvidenceKind,
    EvidenceStatus,
    Finding,
    FindingCategory,
    FindingResolutionType,
    FindingSeverity,
    FindingStatus,
    VerificationCheckType,
)


class FindingLocationResponse(BaseModel):
    """Optional source location of a Finding, always repository-relative."""

    repository_relative_path: str | None
    line_start: int | None
    line_end: int | None
    symbol: str | None

    @classmethod
    def from_domain(cls, finding: Finding) -> Self | None:
        if finding.location is None:
            return None

        return cls(
            repository_relative_path=finding.location.repository_relative_path,
            line_start=finding.location.line_start,
            line_end=finding.location.line_end,
            symbol=finding.location.symbol,
        )


class FindingResponse(BaseModel):
    """Public Finding representation."""

    id: str
    project_id: str
    run_id: str
    reviewer_agent_run_id: str
    category: FindingCategory
    severity: FindingSeverity
    title: str
    description: str
    status: FindingStatus
    location: FindingLocationResponse | None
    remediation_owner_agent_run_id: str | None
    resolution_type: FindingResolutionType | None
    resolver_agent_run_id: str | None
    resolution_summary: str | None
    blocks_completion: bool
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None

    @classmethod
    def from_domain(cls, finding: Finding) -> Self:
        return cls(
            id=str(finding.id),
            project_id=str(finding.project_id),
            run_id=str(finding.run_id),
            reviewer_agent_run_id=str(finding.reviewer_agent_run_id),
            category=finding.category,
            severity=finding.severity,
            title=finding.title,
            description=finding.description,
            status=finding.status,
            location=FindingLocationResponse.from_domain(finding),
            remediation_owner_agent_run_id=(
                None
                if finding.remediation_owner_agent_run_id is None
                else str(finding.remediation_owner_agent_run_id)
            ),
            resolution_type=finding.resolution_type,
            resolver_agent_run_id=(
                None
                if finding.resolver_agent_run_id is None
                else str(finding.resolver_agent_run_id)
            ),
            resolution_summary=finding.resolution_summary,
            blocks_completion=finding.blocks_completion,
            created_at=finding.created_at,
            updated_at=finding.updated_at,
            resolved_at=finding.resolved_at,
        )


class AcceptRiskRequest(BaseModel):
    """Operator request to accept the risk of an unresolved Finding."""

    reason: str = Field(min_length=1, max_length=1000)


class EvidenceResponse(BaseModel):
    """Public Evidence representation.

    ``metadata`` is bounded and redacted before persistence. Raw command output is
    never stored, so it can never be exposed here.
    """

    id: str
    project_id: str
    task_id: str
    run_id: str
    agent_run_id: str | None
    kind: EvidenceKind
    status: EvidenceStatus
    summary: str
    metadata: dict[str, str]
    schema_version: int
    created_at: datetime

    @classmethod
    def from_domain(cls, evidence: Evidence) -> Self:
        return cls(
            id=str(evidence.id),
            project_id=str(evidence.project_id),
            task_id=str(evidence.task_id),
            run_id=str(evidence.run_id),
            agent_run_id=None if evidence.agent_run_id is None else str(evidence.agent_run_id),
            kind=evidence.kind,
            status=evidence.status,
            summary=evidence.summary,
            metadata=dict(evidence.metadata),
            schema_version=evidence.schema_version,
            created_at=evidence.created_at,
        )


class VerificationCheckResponse(BaseModel):
    """One required verification check and the state of its Evidence."""

    check_key: str
    check_type: VerificationCheckType
    required: bool
    command_status: CommandStatus | None
    evidence_id: str | None
    satisfied: bool


class VerificationStatusResponse(BaseModel):
    """Factual verification state of a Run.

    ``checked`` is false when the Run's snapshot declares no verification
    obligation, which is how an orchestration-only Run reports honestly instead
    of claiming a pass it never established.
    """

    run_id: str
    checked: bool
    checks: list[VerificationCheckResponse]
    evidence_count: int


class RunFindingsResponse(BaseModel):
    """Findings of one Run."""

    run_id: str
    findings: list[FindingResponse]
    open_blockers: int
