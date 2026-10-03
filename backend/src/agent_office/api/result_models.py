"""HTTP DTOs for human result review and managed delivery."""

from __future__ import annotations

from datetime import datetime
from typing import Self

from pydantic import BaseModel, Field

from agent_office.application.results import ResultReviewProjection, ResultReviewState


class RequestChangesRequest(BaseModel):
    feedback: str = Field(min_length=1, max_length=2000)


class ApproveResultRequest(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


class ResultReviewResponse(BaseModel):
    run_id: str
    task_id: str
    state: ResultReviewState
    candidate_workspace_id: str | None
    feedback: str | None
    remediation_run_id: str | None
    delivered_branch: str | None
    delivered_commit: str | None
    changes_requested_at: datetime | None
    approved_at: datetime | None
    delivered_at: datetime | None
    can_approve: bool
    can_request_changes: bool

    @classmethod
    def from_projection(cls, result: ResultReviewProjection) -> Self:
        return cls(
            run_id=result.run_id,
            task_id=result.task_id,
            state=result.state,
            candidate_workspace_id=result.candidate_workspace_id,
            feedback=result.feedback,
            remediation_run_id=result.remediation_run_id,
            delivered_branch=result.delivered_branch,
            delivered_commit=result.delivered_commit,
            changes_requested_at=result.changes_requested_at,
            approved_at=result.approved_at,
            delivered_at=result.delivered_at,
            can_approve=result.can_approve,
            can_request_changes=result.can_request_changes,
        )
