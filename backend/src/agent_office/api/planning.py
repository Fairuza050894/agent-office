"""HTTP routes for durable planning truth.

Planning history is separate from operational Run Event history. These routes
cannot create an AgentRun, Workspace, or repository mutation.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from agent_office.api.dependencies import (
    get_composer_thread_service,
    get_planning_artifact_service,
    get_planning_event_service,
    get_requirement_service,
    get_team_proposal_service,
    get_universal_composer_planning_service,
)
from agent_office.api.planning_models import (
    ComposerMessageResponse,
    ComposerPreparationResponse,
    ComposerThreadResponse,
    CreateComposerMessageRequest,
    CreateComposerThreadRequest,
    PlanningArtifactResponse,
    PlanningEventPageResponse,
    PlanningEventResponse,
    PlanningQuestionDecisionResponse,
    RequirementCandidateResponse,
    ResolvePlanningQuestionRequest,
    TeamProposalResponse,
)
from agent_office.application.planning import (
    MAX_PLANNING_EVENT_PAGE_SIZE,
    ComposerThreadNotFoundError,
    ComposerThreadService,
    PlanningArtifactNotFoundError,
    PlanningArtifactService,
    PlanningEventCursor,
    PlanningEventService,
    PlanningTransitionError,
    RequirementCandidateNotFoundError,
    RequirementService,
    TeamProposalNotFoundError,
    TeamProposalService,
    UniversalComposerPlanningService,
)
from agent_office.application.projects import ProjectNotFoundError
from agent_office.domain import (
    ComposerThreadId,
    DomainInvariantError,
    ExecutorId,
    PlanningArtifactId,
    PlanningEvent,
    PlanningEventId,
    ProjectId,
    RequirementCandidateId,
    TeamProposalId,
    WorkflowDefinitionId,
)

router = APIRouter(tags=["planning"])

ComposerServiceDependency = Annotated[
    ComposerThreadService,
    Depends(get_composer_thread_service),
]
TeamServiceDependency = Annotated[
    TeamProposalService,
    Depends(get_team_proposal_service),
]
ArtifactServiceDependency = Annotated[
    PlanningArtifactService,
    Depends(get_planning_artifact_service),
]
RequirementServiceDependency = Annotated[
    RequirementService,
    Depends(get_requirement_service),
]
PlanningEventServiceDependency = Annotated[
    PlanningEventService,
    Depends(get_planning_event_service),
]
UniversalComposerPlanningServiceDependency = Annotated[
    UniversalComposerPlanningService,
    Depends(get_universal_composer_planning_service),
]

STREAM_POLL_SECONDS = 0.25


@router.post(
    "/api/composer/threads",
    response_model=ComposerThreadResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_thread(
    request: CreateComposerThreadRequest,
    service: ComposerServiceDependency,
) -> ComposerThreadResponse:
    try:
        thread = service.create_thread(
            project_id=None if request.project_id is None else ProjectId(request.project_id),
            requested_intent=request.requested_intent,
            timezone=request.timezone,
            title=request.title,
            executor_id=(None if request.executor_id is None else ExecutorId(request.executor_id)),
            workflow_id=(
                None if request.workflow_id is None else WorkflowDefinitionId(request.workflow_id)
            ),
        )
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except DomainInvariantError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return ComposerThreadResponse.from_domain(thread)


@router.get(
    "/api/composer/threads/{thread_id}",
    response_model=ComposerThreadResponse,
)
def get_thread(
    thread_id: UUID,
    service: ComposerServiceDependency,
) -> ComposerThreadResponse:
    try:
        return ComposerThreadResponse.from_domain(service.get_thread(ComposerThreadId(thread_id)))
    except ComposerThreadNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get(
    "/api/projects/{project_id}/composer/threads",
    response_model=list[ComposerThreadResponse],
)
def list_project_threads(
    project_id: UUID,
    service: ComposerServiceDependency,
) -> list[ComposerThreadResponse]:
    try:
        threads = service.list_for_project(ProjectId(project_id))
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return [ComposerThreadResponse.from_domain(thread) for thread in threads]


@router.post(
    "/api/composer/threads/{thread_id}/messages",
    response_model=ComposerMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
def post_message(
    thread_id: UUID,
    request: CreateComposerMessageRequest,
    service: ComposerServiceDependency,
) -> ComposerMessageResponse:
    try:
        message = service.append_user_message(
            ComposerThreadId(thread_id),
            content=request.content,
        )
    except ComposerThreadNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except (DomainInvariantError, PlanningTransitionError) as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    return ComposerMessageResponse.from_domain(message)


@router.post(
    "/api/composer/threads/{thread_id}/prepare",
    response_model=ComposerPreparationResponse,
)
def prepare_thread(
    thread_id: UUID,
    service: UniversalComposerPlanningServiceDependency,
) -> ComposerPreparationResponse:
    try:
        preparation = service.prepare(ComposerThreadId(thread_id))
    except ComposerThreadNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except (DomainInvariantError, PlanningTransitionError) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return ComposerPreparationResponse.from_application(preparation)


@router.get(
    "/api/composer/threads/{thread_id}/messages",
    response_model=list[ComposerMessageResponse],
)
def list_messages(
    thread_id: UUID,
    service: ComposerServiceDependency,
) -> list[ComposerMessageResponse]:
    try:
        messages = service.list_messages(ComposerThreadId(thread_id))
    except ComposerThreadNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return [ComposerMessageResponse.from_domain(message) for message in messages]


@router.get(
    "/api/composer/threads/{thread_id}/team-proposals",
    response_model=list[TeamProposalResponse],
)
def list_team_proposals(
    thread_id: UUID,
    service: TeamServiceDependency,
) -> list[TeamProposalResponse]:
    try:
        proposals = service.list_for_thread(ComposerThreadId(thread_id))
    except ComposerThreadNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return [TeamProposalResponse.from_domain(proposal, members) for proposal, members in proposals]


@router.post(
    "/api/team-proposals/{proposal_id}/accept",
    response_model=TeamProposalResponse,
)
def accept_team_proposal(
    proposal_id: UUID,
    service: TeamServiceDependency,
) -> TeamProposalResponse:
    try:
        proposal = service.accept(TeamProposalId(proposal_id))
        pairs = service.list_for_thread(proposal.thread_id)
        members = next(members for candidate, members in pairs if candidate.id == proposal.id)
    except TeamProposalNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PlanningTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return TeamProposalResponse.from_domain(proposal, members)


@router.post(
    "/api/team-proposals/{proposal_id}/reject",
    response_model=TeamProposalResponse,
)
def reject_team_proposal(
    proposal_id: UUID,
    service: TeamServiceDependency,
) -> TeamProposalResponse:
    try:
        proposal = service.reject(TeamProposalId(proposal_id))
        pairs = service.list_for_thread(proposal.thread_id)
        members = next(members for candidate, members in pairs if candidate.id == proposal.id)
    except TeamProposalNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PlanningTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return TeamProposalResponse.from_domain(proposal, members)


@router.get(
    "/api/composer/threads/{thread_id}/artifacts",
    response_model=list[PlanningArtifactResponse],
)
def list_artifacts(
    thread_id: UUID,
    service: ArtifactServiceDependency,
) -> list[PlanningArtifactResponse]:
    try:
        artifacts = service.list_for_thread(ComposerThreadId(thread_id))
    except ComposerThreadNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return [PlanningArtifactResponse.from_domain(artifact) for artifact in artifacts]


@router.post(
    "/api/planning-artifacts/{artifact_id}/resolve",
    response_model=PlanningQuestionDecisionResponse,
)
def resolve_planning_question(
    artifact_id: UUID,
    request: ResolvePlanningQuestionRequest,
    service: ArtifactServiceDependency,
) -> PlanningQuestionDecisionResponse:
    try:
        question, decision = service.resolve_question(
            PlanningArtifactId(artifact_id),
            selected_option=request.selected_option,
            note=request.note,
        )
    except PlanningArtifactNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PlanningTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except DomainInvariantError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return PlanningQuestionDecisionResponse(
        question=PlanningArtifactResponse.from_domain(question),
        decision=PlanningArtifactResponse.from_domain(decision),
    )


@router.get(
    "/api/composer/threads/{thread_id}/requirements",
    response_model=list[RequirementCandidateResponse],
)
def list_requirements(
    thread_id: UUID,
    service: RequirementServiceDependency,
) -> list[RequirementCandidateResponse]:
    try:
        requirements = service.list_for_thread(ComposerThreadId(thread_id))
    except ComposerThreadNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return [RequirementCandidateResponse.from_domain(requirement) for requirement in requirements]


def _decide_requirement(
    requirement_id: UUID,
    service: RequirementService,
    decision: str,
) -> RequirementCandidateResponse:
    try:
        if decision == "approve":
            requirement = service.approve(RequirementCandidateId(requirement_id))
        elif decision == "reject":
            requirement = service.reject(RequirementCandidateId(requirement_id))
        else:
            requirement = service.defer(RequirementCandidateId(requirement_id))
    except RequirementCandidateNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PlanningTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return RequirementCandidateResponse.from_domain(requirement)


@router.post(
    "/api/requirements/{requirement_id}/approve",
    response_model=RequirementCandidateResponse,
)
def approve_requirement(
    requirement_id: UUID,
    service: RequirementServiceDependency,
) -> RequirementCandidateResponse:
    return _decide_requirement(requirement_id, service, "approve")


@router.post(
    "/api/requirements/{requirement_id}/reject",
    response_model=RequirementCandidateResponse,
)
def reject_requirement(
    requirement_id: UUID,
    service: RequirementServiceDependency,
) -> RequirementCandidateResponse:
    return _decide_requirement(requirement_id, service, "reject")


@router.post(
    "/api/requirements/{requirement_id}/defer",
    response_model=RequirementCandidateResponse,
)
def defer_requirement(
    requirement_id: UUID,
    service: RequirementServiceDependency,
) -> RequirementCandidateResponse:
    return _decide_requirement(requirement_id, service, "defer")


@router.get(
    "/api/composer/threads/{thread_id}/events",
    response_model=PlanningEventPageResponse,
)
def list_planning_events(
    thread_id: UUID,
    composer: ComposerServiceDependency,
    events: PlanningEventServiceDependency,
    limit: Annotated[int, Query(ge=1, le=MAX_PLANNING_EVENT_PAGE_SIZE)] = 50,
    cursor: Annotated[str | None, Query()] = None,
) -> PlanningEventPageResponse:
    parsed_thread_id = ComposerThreadId(thread_id)
    try:
        composer.get_thread(parsed_thread_id)
    except ComposerThreadNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    after: PlanningEventCursor | None = None
    if cursor is not None:
        try:
            after = PlanningEventCursor.decode(cursor)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

    planning_events = events.list_for_thread(parsed_thread_id, limit=limit, after=after)
    next_cursor: str | None = None
    if len(planning_events) == limit and planning_events:
        last = planning_events[-1]
        next_cursor = PlanningEventCursor(
            recorded_at=last.recorded_at,
            event_id=last.id,
        ).encode()

    return PlanningEventPageResponse(
        events=[PlanningEventResponse.from_domain(event) for event in planning_events],
        next_cursor=next_cursor,
    )


@router.get("/api/composer/threads/{thread_id}/events/stream")
async def stream_planning_events(
    thread_id: UUID,
    request: Request,
    composer: ComposerServiceDependency,
    events: PlanningEventServiceDependency,
    follow: Annotated[bool, Query()] = True,
) -> StreamingResponse:
    parsed_thread_id = ComposerThreadId(thread_id)
    try:
        composer.get_thread(parsed_thread_id)
    except ComposerThreadNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    raw_cursor = request.headers.get("last-event-id") or request.query_params.get("last_event_id")
    after: PlanningEventCursor | None = None
    if raw_cursor:
        after = _resolve_resume_cursor(
            raw_cursor,
            thread_id=parsed_thread_id,
            event_service=events,
        )

    return StreamingResponse(
        _planning_event_stream(
            request=request,
            event_service=events,
            thread_id=parsed_thread_id,
            after=after,
            follow=follow,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def format_planning_sse_event(event: PlanningEvent) -> str:
    payload = json.dumps(
        {
            "id": str(event.id),
            "thread_id": str(event.thread_id),
            "project_id": None if event.project_id is None else str(event.project_id),
            "event_type": event.event_type.value,
            "role_key": event.role_key,
            "occurred_at": event.occurred_at.isoformat(),
            "recorded_at": event.recorded_at.isoformat(),
            "sequence": event.sequence,
            "payload": dict(event.payload),
        },
        sort_keys=True,
    )
    return f"id: {event.id}\ndata: {payload}\n\n"


def _resolve_resume_cursor(
    raw_cursor: str,
    *,
    thread_id: ComposerThreadId,
    event_service: PlanningEventService,
) -> PlanningEventCursor:
    try:
        event_id = PlanningEventId.parse(raw_cursor)
    except DomainInvariantError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Last-Event-ID is not a valid planning event identifier.",
        ) from exc

    event = event_service.find(event_id)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Last-Event-ID does not reference a known planning event.",
        )
    if event.thread_id != thread_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Last-Event-ID belongs to a different Composer thread.",
        )
    return PlanningEventCursor(recorded_at=event.recorded_at, event_id=event.id)


async def _planning_event_stream(
    *,
    request: Request,
    event_service: PlanningEventService,
    thread_id: ComposerThreadId,
    after: PlanningEventCursor | None,
    follow: bool,
) -> AsyncIterator[str]:
    cursor = after

    while True:
        planning_events = event_service.list_for_thread(
            thread_id,
            limit=MAX_PLANNING_EVENT_PAGE_SIZE,
            after=cursor,
        )
        for event in planning_events:
            cursor = PlanningEventCursor(recorded_at=event.recorded_at, event_id=event.id)
            yield format_planning_sse_event(event)

        if not follow:
            return
        if await request.is_disconnected():
            return
        if not planning_events:
            yield ": keepalive\n\n"

        await asyncio.sleep(STREAM_POLL_SECONDS)
