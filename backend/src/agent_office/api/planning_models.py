"""Safe HTTP DTOs for Phase 9 planning truth."""

from __future__ import annotations

from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from agent_office.application.planning import ComposerPreparation, IntentResolution
from agent_office.domain import (
    ComposerActorType,
    ComposerIntent,
    ComposerMessage,
    ComposerMessageKind,
    ComposerThread,
    ComposerThreadStatus,
    PlanningArtifact,
    PlanningArtifactStatus,
    PlanningArtifactType,
    PlanningEvent,
    PlanningEventType,
    RequirementCandidate,
    RequirementStatus,
    TeamMemberDisposition,
    TeamPhase,
    TeamProposal,
    TeamProposalMember,
    TeamProposalStatus,
)


class CreateComposerThreadRequest(BaseModel):
    project_id: UUID | None = None
    requested_intent: ComposerIntent = ComposerIntent.AUTO
    timezone: str = Field(default="UTC", min_length=1, max_length=100)
    title: str | None = Field(default=None, max_length=240)
    executor_id: UUID | None = None
    workflow_id: UUID | None = None

    @field_validator("timezone")
    @classmethod
    def normalize_timezone(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("timezone must not be blank")
        return normalized


class ComposerThreadResponse(BaseModel):
    id: str
    project_id: str | None
    requested_intent: ComposerIntent
    resolved_intent: ComposerIntent | None
    status: ComposerThreadStatus
    title: str | None
    timezone: str
    executor_id: str | None
    workflow_id: str | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None

    @classmethod
    def from_domain(cls, thread: ComposerThread) -> Self:
        return cls(
            id=str(thread.id),
            project_id=None if thread.project_id is None else str(thread.project_id),
            requested_intent=thread.requested_intent,
            resolved_intent=thread.resolved_intent,
            status=thread.status,
            title=thread.title,
            timezone=thread.timezone,
            executor_id=None if thread.executor_id is None else str(thread.executor_id),
            workflow_id=None if thread.workflow_id is None else str(thread.workflow_id),
            created_at=thread.created_at,
            updated_at=thread.updated_at,
            completed_at=thread.completed_at,
        )


class CreateComposerMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=16_000)


class ComposerMessageResponse(BaseModel):
    id: str
    thread_id: str
    actor_type: ComposerActorType
    role_key: str | None
    message_kind: ComposerMessageKind
    content: str
    created_at: datetime

    @classmethod
    def from_domain(cls, message: ComposerMessage) -> Self:
        return cls(
            id=str(message.id),
            thread_id=str(message.thread_id),
            actor_type=message.actor_type,
            role_key=message.role_key,
            message_kind=message.message_kind,
            content=message.content,
            created_at=message.created_at,
        )


class TeamProposalMemberResponse(BaseModel):
    role_key: str
    disposition: TeamMemberDisposition
    reason: str
    order_hint: int

    @classmethod
    def from_domain(cls, member: TeamProposalMember) -> Self:
        return cls(
            role_key=member.role_key,
            disposition=member.disposition,
            reason=member.reason,
            order_hint=member.order_hint,
        )


class TeamProposalResponse(BaseModel):
    id: str
    thread_id: str
    phase: TeamPhase
    status: TeamProposalStatus
    rationale_summary: str
    created_at: datetime
    decided_at: datetime | None
    members: list[TeamProposalMemberResponse]

    @classmethod
    def from_domain(
        cls,
        proposal: TeamProposal,
        members: tuple[TeamProposalMember, ...],
    ) -> Self:
        return cls(
            id=str(proposal.id),
            thread_id=str(proposal.thread_id),
            phase=proposal.phase,
            status=proposal.status,
            rationale_summary=proposal.rationale_summary,
            created_at=proposal.created_at,
            decided_at=proposal.decided_at,
            members=[TeamProposalMemberResponse.from_domain(member) for member in members],
        )


class PlanningArtifactResponse(BaseModel):
    id: str
    thread_id: str
    artifact_type: PlanningArtifactType
    title: str
    content: dict[str, str | int | bool | None]
    author_role_key: str | None
    status: PlanningArtifactStatus
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_domain(cls, artifact: PlanningArtifact) -> Self:
        return cls(
            id=str(artifact.id),
            thread_id=str(artifact.thread_id),
            artifact_type=artifact.artifact_type,
            title=artifact.title,
            content=dict(artifact.content),
            author_role_key=artifact.author_role_key,
            status=artifact.status,
            created_at=artifact.created_at,
            updated_at=artifact.updated_at,
        )


class RequirementCandidateResponse(BaseModel):
    id: str
    thread_id: str
    project_id: str | None
    title: str
    problem: str
    requirement: str
    rationale: str
    acceptance_hint: str | None
    source_roles: list[str]
    status: RequirementStatus
    created_at: datetime
    updated_at: datetime
    approved_at: datetime | None
    decided_at: datetime | None

    @classmethod
    def from_domain(cls, requirement: RequirementCandidate) -> Self:
        return cls(
            id=str(requirement.id),
            thread_id=str(requirement.thread_id),
            project_id=(None if requirement.project_id is None else str(requirement.project_id)),
            title=requirement.title,
            problem=requirement.problem,
            requirement=requirement.requirement,
            rationale=requirement.rationale,
            acceptance_hint=requirement.acceptance_hint,
            source_roles=list(requirement.source_roles),
            status=requirement.status,
            created_at=requirement.created_at,
            updated_at=requirement.updated_at,
            approved_at=requirement.approved_at,
            decided_at=requirement.decided_at,
        )


class PlanningEventResponse(BaseModel):
    id: str
    thread_id: str
    project_id: str | None
    event_type: PlanningEventType
    role_key: str | None
    occurred_at: datetime
    recorded_at: datetime
    sequence: int
    payload: dict[str, str | int | bool | None]

    @classmethod
    def from_domain(cls, event: PlanningEvent) -> Self:
        return cls(
            id=str(event.id),
            thread_id=str(event.thread_id),
            project_id=None if event.project_id is None else str(event.project_id),
            event_type=event.event_type,
            role_key=event.role_key,
            occurred_at=event.occurred_at,
            recorded_at=event.recorded_at,
            sequence=event.sequence,
            payload=dict(event.payload),
        )


class PlanningEventPageResponse(BaseModel):
    events: list[PlanningEventResponse]
    next_cursor: str | None


class IntentResolutionResponse(BaseModel):
    resolved_intent: ComposerIntent
    reason_summary: str
    requires_user_action: bool

    @classmethod
    def from_application(cls, resolution: IntentResolution) -> Self:
        return cls(
            resolved_intent=resolution.resolved_intent,
            reason_summary=resolution.reason_summary,
            requires_user_action=resolution.requires_user_action,
        )


class ComposerPreparationResponse(BaseModel):
    thread: ComposerThreadResponse
    resolution: IntentResolutionResponse
    team_proposal: TeamProposalResponse
    artifacts: list[PlanningArtifactResponse]
    requirements: list[RequirementCandidateResponse]

    @classmethod
    def from_application(cls, preparation: ComposerPreparation) -> Self:
        return cls(
            thread=ComposerThreadResponse.from_domain(preparation.thread),
            resolution=IntentResolutionResponse.from_application(preparation.resolution),
            team_proposal=TeamProposalResponse.from_domain(
                preparation.team_proposal,
                preparation.team_members,
            ),
            artifacts=[
                PlanningArtifactResponse.from_domain(artifact)
                for artifact in preparation.artifacts
            ],
            requirements=[
                RequirementCandidateResponse.from_domain(requirement)
                for requirement in preparation.requirements
            ],
        )
