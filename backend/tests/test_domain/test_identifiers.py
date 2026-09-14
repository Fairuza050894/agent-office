"""Tests for canonical Agent Office identifiers."""

from uuid import UUID

import pytest

from agent_office.domain import (
    AgentProfileId,
    AgentRunId,
    ArtifactId,
    AuditRecordId,
    DomainId,
    DomainInvariantError,
    EventId,
    EvidenceId,
    ExecutorId,
    FindingId,
    ProjectId,
    RunId,
    TaskId,
    WorkflowDefinitionId,
    WorkflowSnapshotId,
    WorkspaceId,
)

ID_TYPES: tuple[type[DomainId], ...] = (
    ProjectId,
    TaskId,
    RunId,
    WorkflowDefinitionId,
    WorkflowSnapshotId,
    AgentProfileId,
    AgentRunId,
    ExecutorId,
    WorkspaceId,
    EventId,
    FindingId,
    EvidenceId,
    ArtifactId,
    AuditRecordId,
)


@pytest.mark.parametrize("identifier_type", ID_TYPES)
def test_identifier_generates_uuid(
    identifier_type: type[DomainId],
) -> None:
    identifier = identifier_type.new()

    assert isinstance(identifier.value, UUID)
    assert UUID(str(identifier)) == identifier.value


def test_identifier_generation_can_be_deterministic() -> None:
    fixed = UUID("11111111-1111-4111-8111-111111111111")

    identifier = ProjectId.new(lambda: fixed)

    assert identifier.value == fixed


def test_identifier_parse_round_trips() -> None:
    raw = "22222222-2222-4222-8222-222222222222"

    identifier = TaskId.parse(raw)

    assert str(identifier) == raw


def test_identifier_types_remain_distinct() -> None:
    value = UUID("33333333-3333-4333-8333-333333333333")

    assert ProjectId(value) != TaskId(value)


def test_invalid_identifier_fails_closed() -> None:
    with pytest.raises(DomainInvariantError, match="valid UUID"):
        ProjectId.parse("not-a-uuid")
