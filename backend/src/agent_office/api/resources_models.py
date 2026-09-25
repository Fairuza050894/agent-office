"""Safe DTOs for operational AgentProfile and Executor inspection."""

from __future__ import annotations

from datetime import datetime
from typing import Self

from pydantic import BaseModel

from agent_office.domain import (
    AgentProfile,
    CapabilityRecord,
    ExecutorDescriptor,
    ExecutorHealth,
)


class AgentProfileResponse(BaseModel):
    """Public reusable AgentProfile definition."""

    id: str
    key: str
    name: str
    description: str
    default_access_mode: str
    version: int
    status: str

    @classmethod
    def from_domain(cls, profile: AgentProfile) -> Self:
        return cls(
            id=str(profile.id),
            key=profile.key,
            name=profile.name,
            description=profile.description,
            default_access_mode=profile.default_access_mode.value,
            version=profile.version,
            status=profile.status.value,
        )


class ExecutorCapabilityResponse(BaseModel):
    """One factual capability observation."""

    capability: str
    support: str
    limitations: str | None
    source: str | None
    checked_at: datetime | None

    @classmethod
    def from_domain(cls, record: CapabilityRecord) -> Self:
        return cls(
            capability=record.capability.value,
            support=record.support.value,
            limitations=record.limitations,
            source=record.source,
            checked_at=record.checked_at,
        )


class ExecutorResponse(BaseModel):
    """Safe operational Executor detail."""

    id: str
    kind: str
    name: str
    status: str
    runtime_version: str | None
    health_summary: str | None
    last_check: datetime
    capabilities: list[ExecutorCapabilityResponse]
    security_limitations: list[str]

    @classmethod
    def from_observations(
        cls,
        descriptor: ExecutorDescriptor,
        health: ExecutorHealth,
        capabilities: tuple[CapabilityRecord, ...],
    ) -> Self:
        security_relevant = {
            "BROWSER_CONTROL",
            "FILE_WRITE",
            "SHELL_EXECUTION",
        }
        limitations = [
            (
                f"{record.capability.value}: {record.limitations}"
                if record.limitations
                else f"{record.capability.value}: {record.support.value}"
            )
            for record in capabilities
            if record.capability.value in security_relevant
            and (record.support.value != "SUPPORTED" or record.limitations)
        ]

        return cls(
            id=str(descriptor.id),
            kind=descriptor.kind.value,
            name=descriptor.name,
            status=health.status.value,
            runtime_version=descriptor.runtime_version,
            health_summary=health.safe_summary,
            last_check=health.checked_at,
            capabilities=[
                ExecutorCapabilityResponse.from_domain(record) for record in capabilities
            ],
            security_limitations=limitations,
        )
