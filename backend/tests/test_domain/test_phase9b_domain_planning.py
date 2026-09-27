"""Domain invariants for Phase 9B planning truth."""

from __future__ import annotations

import pytest

from agent_office.domain import (
    ComposerThreadId,
    DomainInvariantError,
    PlanningEvent,
    PlanningEventId,
    PlanningEventType,
    RequirementCandidate,
    RequirementCandidateId,
    RequirementStatus,
    build_planning_content,
    utc_now,
)


def test_planning_content_rejects_secret_bearing_keys() -> None:
    with pytest.raises(DomainInvariantError, match="secret-bearing"):
        build_planning_content((("api_token", "secret"),))


def test_planning_content_rejects_non_scalar_values() -> None:
    with pytest.raises(DomainInvariantError, match="scalar"):
        build_planning_content((("nested", ["not", "allowed"]),))  # type: ignore[list-item]


def test_requirement_decision_is_one_way() -> None:
    now = utc_now()
    requirement = RequirementCandidate(
        id=RequirementCandidateId.new(),
        thread_id=ComposerThreadId.new(),
        project_id=None,
        title="Requirement",
        problem="Problem",
        requirement="Requirement text",
        rationale="Rationale",
        source_roles=("product-manager",),
        status=RequirementStatus.PROPOSED,
        created_at=now,
        updated_at=now,
    )

    approved = requirement.decide(RequirementStatus.APPROVED, now)
    assert approved.status is RequirementStatus.APPROVED

    with pytest.raises(DomainInvariantError, match="immutable"):
        approved.decide(RequirementStatus.DEFERRED, now)


def test_planning_event_requires_non_negative_sequence() -> None:
    now = utc_now()
    with pytest.raises(DomainInvariantError, match="sequence"):
        PlanningEvent(
            id=PlanningEventId.new(),
            thread_id=ComposerThreadId.new(),
            project_id=None,
            event_type=PlanningEventType.PLANNING_STARTED,
            occurred_at=now,
            recorded_at=now,
            sequence=-1,
            payload=(),
        )
