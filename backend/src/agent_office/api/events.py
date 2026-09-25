"""HTTP routes for normalized Event history and the Run event stream.

REST remains authoritative for canonical state. The SSE stream is a delivery
mechanism over the same durable event history and never invents events.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from agent_office.api.dependencies import get_event_service, get_run_service
from agent_office.api.event_models import EventPageResponse, EventResponse
from agent_office.application.events import (
    MAX_EVENT_PAGE_SIZE,
    EventCursor,
    EventCursorError,
    EventService,
)
from agent_office.application.runs import RunNotFoundError, RunService
from agent_office.domain import DomainInvariantError, Event, EventId, RunId

router = APIRouter(tags=["events"])

RunServiceDependency = Annotated[RunService, Depends(get_run_service)]
EventServiceDependency = Annotated[EventService, Depends(get_event_service)]

STREAM_POLL_SECONDS = 0.25


def format_sse_event(event: Event) -> str:
    """Render one normalized Event as a Server-Sent Event frame."""

    payload = json.dumps(
        {
            "id": str(event.id),
            "event_type": event.event_type.value,
            "project_id": str(event.project_id),
            "run_id": str(event.run_id),
            "agent_run_id": None if event.agent_run_id is None else str(event.agent_run_id),
            "source": event.source.value,
            "occurred_at": event.occurred_at.isoformat(),
            "recorded_at": event.recorded_at.isoformat(),
            "payload": dict(event.payload),
        },
        sort_keys=True,
    )

    # Use the default SSE message event so browser EventSource.onmessage can
    # consume every normalized Agent Office Event without subscribing to a
    # provider- or event-type-specific channel. The canonical event type remains
    # inside the JSON payload.
    return f"id: {event.id}\ndata: {payload}\n\n"


@router.get("/api/runs/{run_id}/events", response_model=EventPageResponse)
def list_run_events(
    run_id: UUID,
    run_service: RunServiceDependency,
    event_service: EventServiceDependency,
    limit: Annotated[int, Query(ge=1, le=MAX_EVENT_PAGE_SIZE)] = 50,
    cursor: Annotated[str | None, Query()] = None,
) -> EventPageResponse:
    """Return durable Event history for a Run using keyset pagination."""

    try:
        run_service.get_run(RunId(run_id))
    except RunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    after: EventCursor | None = None

    if cursor is not None:
        try:
            after = EventCursor.decode(cursor)
        except EventCursorError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

    events = event_service.list_for_run(RunId(run_id), limit=limit, after=after)

    next_cursor: str | None = None

    if len(events) == limit and events:
        last = events[-1]
        next_cursor = EventCursor(recorded_at=last.recorded_at, event_id=last.id).encode()

    return EventPageResponse(
        events=[EventResponse.from_domain(event) for event in events],
        next_cursor=next_cursor,
    )


@router.get("/api/runs/{run_id}/events/stream")
async def stream_run_events(
    run_id: UUID,
    request: Request,
    run_service: RunServiceDependency,
    event_service: EventServiceDependency,
    follow: Annotated[bool, Query()] = True,
) -> StreamingResponse:
    """Stream normalized Events for a Run over Server-Sent Events.

    ``Last-Event-ID`` (or the ``last_event_id`` query parameter) resumes from a
    durable cursor. With ``follow=false`` the durable history is replayed and
    the stream closes, which callers can use for a bounded catch-up.
    """

    try:
        run_service.get_run(RunId(run_id))
    except RunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    raw_cursor = request.headers.get("last-event-id") or request.query_params.get("last_event_id")
    after: EventCursor | None = None

    if raw_cursor:
        after = _resolve_resume_cursor(
            raw_cursor,
            run_id=RunId(run_id),
            event_service=event_service,
        )

    return StreamingResponse(
        _event_stream(
            request=request,
            event_service=event_service,
            run_id=RunId(run_id),
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


def _resolve_resume_cursor(
    raw_cursor: str,
    *,
    run_id: RunId,
    event_service: EventService,
) -> EventCursor:
    """Resolve a stream resume token into a durable keyset position.

    The SSE ``id`` field carries the persisted Agent Office Event ID, so a
    reconnecting client sends exactly that value back as ``Last-Event-ID``. The
    Event ID is resolved to its ``(recorded_at, event_id)`` keyset position
    through the durable event store, which resumes strictly after that event.

    An unknown, foreign-run, or malformed token fails safely instead of
    silently restarting or skipping history.
    """

    try:
        event_id = EventId.parse(raw_cursor)
    except DomainInvariantError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Last-Event-ID is not a valid Agent Office event identifier.",
        ) from exc

    event = event_service.find(event_id)

    if event is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Last-Event-ID does not reference a known durable event.",
        )

    if event.run_id != run_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Last-Event-ID belongs to a different Run.",
        )

    return EventCursor(recorded_at=event.recorded_at, event_id=event.id)


async def _event_stream(
    *,
    request: Request,
    event_service: EventService,
    run_id: RunId,
    after: EventCursor | None,
    follow: bool,
) -> AsyncIterator[str]:
    """Yield durable Events as SSE frames without inventing any event."""

    cursor = after

    while True:
        events = event_service.list_for_run(run_id, limit=MAX_EVENT_PAGE_SIZE, after=cursor)

        for event in events:
            cursor = EventCursor(recorded_at=event.recorded_at, event_id=event.id)
            yield format_sse_event(event)

        if not follow:
            return

        if await request.is_disconnected():
            return

        if not events:
            # A comment frame keeps the connection alive without fabricating
            # an operational event.
            yield ": keepalive\n\n"

        await asyncio.sleep(STREAM_POLL_SECONDS)
